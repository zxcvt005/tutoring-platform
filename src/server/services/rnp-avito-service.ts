import { and, asc, eq, gte, lt, lte } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { fromAppWall } from "@/lib/app-time";
import {
  type ManualTrialCreatedDayCounts,
  type RnpAvitoDayStats,
  type RnpAvitoMonthPayload,
  type RnpAvitoTrialMetricKey,
  aggregateManualTrialsByCreatedAppDay,
  buildMonthDayShell,
  daysInMonth,
  isoDate,
  resolveTrialDayFields,
} from "@/lib/rnp-avito";
import {
  type RnpAvitoSyncMode,
  isRnpAvitoMetricStale,
  minMaxIsoDates,
  monthDatesThroughToday,
} from "@/lib/rnp-avito-sync-policy";
import {
  fetchAvitoItemStatsPage,
  fetchAvitoSpendings,
  type AvitoClientDeps,
} from "@/server/avito/client";
import { diagnoseAvitoEnv, requireAvitoEnv } from "@/server/avito/env";
import {
  parseItemStatsByDay,
  parseSpendingsByDay,
  readDataTotalCount,
} from "@/server/avito/parse-stats";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { manualTrialLessons, rnpAvitoDailyStats } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, validationError } from "@/server/errors";

const ITEM_STATS_PAGE_SIZE = 100;
const MAX_ITEM_STATS_PAGES = 20;

/** Prevent concurrent sync of the same org+month in one process. */
const syncLocks = new Set<string>();

function newId() {
  return `rnp_${randomBytes(6).toString("hex")}`;
}

/** Test helper */
export function resetRnpAvitoSyncLocks() {
  syncLocks.clear();
}

const MAX_COUNT = 1_000_000;

function maxIsoTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (!best || v > best) best = v;
  }
  return best;
}

function toDayBase(
  row: typeof rnpAvitoDailyStats.$inferSelect
): Omit<
  RnpAvitoDayStats,
  | "trialsScheduled"
  | "trialsCompleted"
  | "trialsScheduledSource"
  | "trialsCompletedSource"
> {
  const budgetAt = row.budgetApiSyncedAt
    ? row.budgetApiSyncedAt.toISOString()
    : null;
  const itemsAt = row.itemsApiSyncedAt
    ? row.itemsApiSyncedAt.toISOString()
    : null;
  const legacy = row.apiSyncedAt ? row.apiSyncedAt.toISOString() : null;
  return {
    date: row.dayDate,
    budgetSpentRub: row.budgetSpentRub,
    impressions: row.impressions,
    views: row.views,
    contacts: row.contacts,
    manualUpdatedAt: row.manualUpdatedAt.toISOString(),
    apiSyncedAt: maxIsoTimestamp(budgetAt, itemsAt, legacy),
  };
}

function resolveDay(
  row: typeof rnpAvitoDailyStats.$inferSelect | null,
  date: string,
  counts: ManualTrialCreatedDayCounts | undefined
): RnpAvitoDayStats {
  const base = row
    ? toDayBase(row)
    : {
        date,
        budgetSpentRub: null,
        impressions: null,
        views: null,
        contacts: null,
        manualUpdatedAt: null,
        apiSyncedAt: null,
      };
  return {
    ...base,
    ...resolveTrialDayFields(
      row
        ? {
            trialsScheduled: row.trialsScheduled,
            trialsCompleted: row.trialsCompleted,
            trialsScheduledIsManual: row.trialsScheduledIsManual,
            trialsCompletedIsManual: row.trialsCompletedIsManual,
          }
        : null,
      counts
    ),
  };
}

function parseDayDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw validationError("Дата должна быть в формате ГГГГ-ММ-ДД");
  }
  const iso = value.trim();
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw validationError("Некорректная дата");
  }
  return iso;
}

function parseOptionalNonNegInt(
  value: unknown,
  label: string,
  max: number
): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/\s/g, "").replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw validationError(`${label}: укажите целое число`);
  }
  if (n < 0) {
    throw validationError(`${label}: значение не может быть отрицательным`);
  }
  if (n > max) {
    throw validationError(`${label}: слишком большое значение`);
  }
  return n;
}

function sameInstant(a: Date, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return a.getTime() === t;
}

async function countsForDayDate(
  db: AppDb,
  organizationId: string,
  dayDate: string
): Promise<ManualTrialCreatedDayCounts | undefined> {
  const [y, m] = dayDate.split("-").map(Number);
  const map = await loadManualTrialCountsByCreatedDay(
    db,
    organizationId,
    y!,
    m!
  );
  return map.get(dayDate);
}

/**
 * Единый источник пробных для РНП: manual_trial_lessons по createdAt (Europe/Moscow).
 */
export async function loadManualTrialCountsByCreatedDay(
  db: AppDb,
  organizationId: string,
  year: number,
  month: number
): Promise<Map<string, ManualTrialCreatedDayCounts>> {
  const monthStart = fromAppWall(year, month, 1, 0, 0, 0);
  const nextMonthStart = fromAppWall(year, month + 1, 1, 0, 0, 0);
  const rows = await db
    .select({
      createdAt: manualTrialLessons.createdAt,
      attended: manualTrialLessons.attended,
    })
    .from(manualTrialLessons)
    .where(
      and(
        eq(manualTrialLessons.organizationId, organizationId),
        gte(manualTrialLessons.createdAt, monthStart),
        lt(manualTrialLessons.createdAt, nextMonthStart)
      )
    );
  return aggregateManualTrialsByCreatedAppDay(rows, year, month);
}

function parseYearMonth(year: unknown, month: unknown): {
  year: number;
  month: number;
} {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw validationError("Некорректный год");
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw validationError("Некорректный месяц");
  }
  return { year: y, month: m };
}

export async function getRnpAvitoMonth(
  db: AppDb,
  ctx: AuthContext,
  input: { year: number; month: number }
): Promise<RnpAvitoMonthPayload> {
  requireRoles(ctx, ["director"]);
  const { year, month } = parseYearMonth(input.year, input.month);
  const shell = buildMonthDayShell(year, month);
  const from = isoDate(year, month, 1);
  const to = isoDate(year, month, daysInMonth(year, month));

  const rows = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(
      and(
        eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
        gte(rnpAvitoDailyStats.dayDate, from),
        lte(rnpAvitoDailyStats.dayDate, to)
      )
    )
    .orderBy(asc(rnpAvitoDailyStats.dayDate));

  const byDate = new Map(rows.map((r) => [r.dayDate, r]));
  const trialCounts = await loadManualTrialCountsByCreatedDay(
    db,
    ctx.organizationId,
    year,
    month
  );
  const days = shell.map((d) =>
    resolveDay(byDate.get(d.date) ?? null, d.date, trialCounts.get(d.date))
  );

  let lastSyncedAt: string | null = null;
  for (const d of days) {
    if (!d.apiSyncedAt) continue;
    if (!lastSyncedAt || d.apiSyncedAt > lastSyncedAt) {
      lastSyncedAt = d.apiSyncedAt;
    }
  }

  const diagnosis = diagnoseAvitoEnv();
  return {
    year,
    month,
    daysInMonth: days.length,
    days,
    apiConnected: diagnosis.configured,
    avitoEnv: {
      hasClientId: diagnosis.hasClientId,
      hasClientSecret: diagnosis.hasClientSecret,
      hasUserId: diagnosis.hasUserId,
      userIdIsNumeric: diagnosis.userIdIsNumeric,
      missingKeys: diagnosis.missingKeys,
    },
    lastSyncedAt,
  };
}

export type UpsertRnpAvitoManualInput = {
  date: string;
  /** null для новой строки; иначе ISO manualUpdatedAt */
  expectedManualUpdatedAt: string | null;
  trialsScheduled?: number | null | "";
  trialsCompleted?: number | null | "";
};

/**
 * Сохраняет ручное переопределение одной или обеих ячеек пробных.
 * Каждое переданное поле переводится в режим manual независимо от другого.
 */
export async function upsertRnpAvitoManualDay(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertRnpAvitoManualInput
): Promise<RnpAvitoDayStats> {
  requireRoles(ctx, ["director"]);
  const dayDate = parseDayDate(input.date);
  const now = new Date();

  const patch: {
    trialsScheduled?: number | null;
    trialsCompleted?: number | null;
    trialsScheduledIsManual?: boolean;
    trialsCompletedIsManual?: boolean;
  } = {};

  if (input.trialsScheduled !== undefined) {
    patch.trialsScheduled = parseOptionalNonNegInt(
      input.trialsScheduled,
      "Назначенные пробные",
      MAX_COUNT
    );
    patch.trialsScheduledIsManual = true;
  }
  if (input.trialsCompleted !== undefined) {
    patch.trialsCompleted = parseOptionalNonNegInt(
      input.trialsCompleted,
      "Проведённые пробные",
      MAX_COUNT
    );
    patch.trialsCompletedIsManual = true;
  }

  if (
    patch.trialsScheduledIsManual === undefined &&
    patch.trialsCompletedIsManual === undefined
  ) {
    throw validationError("Нет полей для сохранения");
  }

  const [existing] = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(
      and(
        eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
        eq(rnpAvitoDailyStats.dayDate, dayDate)
      )
    )
    .limit(1);

  let rowId: string;
  if (!existing) {
    if (input.expectedManualUpdatedAt) {
      throw conflict(
        "Запись уже изменена. Обновите данные и повторите сохранение."
      );
    }
    rowId = newId();
    await db.insert(rnpAvitoDailyStats).values({
      id: rowId,
      organizationId: ctx.organizationId,
      dayDate,
      budgetSpentRub: null,
      impressions: null,
      views: null,
      contacts: null,
      apiSyncedAt: null,
      trialsScheduled: patch.trialsScheduled ?? null,
      trialsCompleted: patch.trialsCompleted ?? null,
      trialsScheduledIsManual: patch.trialsScheduledIsManual ?? false,
      trialsCompletedIsManual: patch.trialsCompletedIsManual ?? false,
      manualUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const expected = input.expectedManualUpdatedAt;
    if (!expected || !sameInstant(existing.manualUpdatedAt, expected)) {
      throw conflict(
        "Запись уже изменена. Обновите данные и повторите сохранение."
      );
    }
    rowId = existing.id;
    await db
      .update(rnpAvitoDailyStats)
      .set({
        ...patch,
        manualUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(rnpAvitoDailyStats.id, existing.id));
  }

  const [row] = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(eq(rnpAvitoDailyStats.id, rowId))
    .limit(1);
  if (!row) throw new Error("Не удалось сохранить день РНП");
  const counts = await countsForDayDate(db, ctx.organizationId, dayDate);
  return resolveDay(row, dayDate, counts);
}

export type ClearRnpAvitoTrialOverrideInput = {
  date: string;
  expectedManualUpdatedAt: string | null;
  field: RnpAvitoTrialMetricKey;
};

/**
 * Снимает ручной режим с одной ячейки; значение снова из manual_trial_lessons.
 */
export async function clearRnpAvitoTrialOverride(
  db: AppDb,
  ctx: AuthContext,
  input: ClearRnpAvitoTrialOverrideInput
): Promise<RnpAvitoDayStats> {
  requireRoles(ctx, ["director"]);
  const dayDate = parseDayDate(input.date);
  if (
    input.field !== "trialsScheduled" &&
    input.field !== "trialsCompleted"
  ) {
    throw validationError("Некорректное поле для сброса");
  }

  const [existing] = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(
      and(
        eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
        eq(rnpAvitoDailyStats.dayDate, dayDate)
      )
    )
    .limit(1);

  if (!existing) {
    const counts = await countsForDayDate(db, ctx.organizationId, dayDate);
    return resolveDay(null, dayDate, counts);
  }

  const expected = input.expectedManualUpdatedAt;
  if (!expected || !sameInstant(existing.manualUpdatedAt, expected)) {
    throw conflict(
      "Запись уже изменена. Обновите данные и повторите сохранение."
    );
  }

  const isManual =
    input.field === "trialsScheduled"
      ? existing.trialsScheduledIsManual
      : existing.trialsCompletedIsManual;
  if (!isManual) {
    const counts = await countsForDayDate(db, ctx.organizationId, dayDate);
    return resolveDay(existing, dayDate, counts);
  }

  const now = new Date();
  const patch =
    input.field === "trialsScheduled"
      ? { trialsScheduledIsManual: false, manualUpdatedAt: now, updatedAt: now }
      : {
          trialsCompletedIsManual: false,
          manualUpdatedAt: now,
          updatedAt: now,
        };

  await db
    .update(rnpAvitoDailyStats)
    .set(patch)
    .where(eq(rnpAvitoDailyStats.id, existing.id));

  const [row] = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(eq(rnpAvitoDailyStats.id, existing.id))
    .limit(1);
  if (!row) throw new Error("Не удалось сбросить переопределение РНП");
  const counts = await countsForDayDate(db, ctx.organizationId, dayDate);
  return resolveDay(row, dayDate, counts);
}

async function fetchAllItemStatsByDay(
  cfg: ReturnType<typeof requireAvitoEnv>,
  dateFrom: string,
  dateTo: string,
  deps: AvitoClientDeps
): Promise<{
  byDay: Map<string, { impressions: number; views: number; contacts: number }>;
  pages: number;
}> {
  const merged = new Map<
    string,
    { impressions: number; views: number; contacts: number }
  >();
  let offset = 0;
  let pages = 0;
  for (let page = 0; page < MAX_ITEM_STATS_PAGES; page++) {
    const payload = await fetchAvitoItemStatsPage(
      cfg,
      {
        dateFrom,
        dateTo,
        limit: ITEM_STATS_PAGE_SIZE,
        offset,
      },
      deps
    );
    pages += 1;
    const pageMap = parseItemStatsByDay(payload);
    for (const [date, counters] of pageMap) {
      const prev = merged.get(date) ?? {
        impressions: 0,
        views: 0,
        contacts: 0,
      };
      merged.set(date, {
        impressions: prev.impressions + counters.impressions,
        views: prev.views + counters.views,
        contacts: prev.contacts + counters.contacts,
      });
    }
    const total = readDataTotalCount(payload);
    offset += ITEM_STATS_PAGE_SIZE;
    if (total == null) {
      if (pageMap.size < ITEM_STATS_PAGE_SIZE) break;
    } else if (offset >= total) {
      break;
    }
  }
  return { byDay: merged, pages };
}

export type SyncRnpAvitoMonthResult = {
  year: number;
  month: number;
  /** Дней, по которым записали/отметили sync хотя бы одной метрики */
  syncedDays: number;
  /** Сколько HTTP-вызовов к Avito stats API (без token) */
  apiCalls: number;
  /** true если запросов к Avito не было (данные свежие) */
  skipped: boolean;
  mode: RnpAvitoSyncMode;
  lastSyncedAt: string | null;
  monthPayload: RnpAvitoMonthPayload;
};

type DayApiPatch = {
  dayDate: string;
  budgetSpentRub?: number;
  writeBudgetValue: boolean;
  markBudgetSynced: boolean;
  impressions?: number;
  views?: number;
  contacts?: number;
  writeItemsValue: boolean;
  markItemsSynced: boolean;
};

/**
 * Выборочная синхронизация API-метрик месяца.
 * - auto: только устаревшие дни по TTL; повторное открытие без API при свежих данных.
 * - force: обновляет окно последних 7 дней (+ никогда не синхронизированные дни).
 * Не затирает историю нулями при отсутствии дня в ответе.
 * Ручные пробные (trials_* / *_is_manual) не трогает.
 * При ошибке fetch/parse до записи — без изменений в БД.
 */
export async function syncRnpAvitoMonth(
  db: AppDb,
  ctx: AuthContext,
  input: { year: number; month: number; mode?: RnpAvitoSyncMode },
  deps: AvitoClientDeps = {}
): Promise<SyncRnpAvitoMonthResult> {
  requireRoles(ctx, ["director"]);
  const { year, month } = parseYearMonth(input.year, input.month);
  const mode: RnpAvitoSyncMode = input.mode === "auto" ? "auto" : "force";
  const lockKey = `${ctx.organizationId}:${year}-${month}`;
  if (syncLocks.has(lockKey)) {
    throw conflict("Синхронизация этого месяца уже выполняется");
  }
  syncLocks.add(lockKey);

  try {
    const now = new Date();
    const from = isoDate(year, month, 1);
    const to = isoDate(year, month, daysInMonth(year, month));
    const eligibleDates = monthDatesThroughToday(year, month, now);

    const existingRows = await db
      .select()
      .from(rnpAvitoDailyStats)
      .where(
        and(
          eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
          gte(rnpAvitoDailyStats.dayDate, from),
          lte(rnpAvitoDailyStats.dayDate, to)
        )
      );
    const byDate = new Map(existingRows.map((r) => [r.dayDate, r]));

    const budgetStale: string[] = [];
    const itemsStale: string[] = [];
    for (const dayDate of eligibleDates) {
      const row = byDate.get(dayDate);
      const budgetAt = row?.budgetApiSyncedAt ?? row?.apiSyncedAt ?? null;
      const itemsAt = row?.itemsApiSyncedAt ?? row?.apiSyncedAt ?? null;
      if (isRnpAvitoMetricStale(budgetAt, dayDate, now, mode)) {
        budgetStale.push(dayDate);
      }
      if (isRnpAvitoMetricStale(itemsAt, dayDate, now, mode)) {
        itemsStale.push(dayDate);
      }
    }

    if (budgetStale.length === 0 && itemsStale.length === 0) {
      const monthPayload = await getRnpAvitoMonth(db, ctx, { year, month });
      return {
        year,
        month,
        syncedDays: 0,
        apiCalls: 0,
        skipped: true,
        mode,
        lastSyncedAt: monthPayload.lastSyncedAt,
        monthPayload,
      };
    }

    const cfg = requireAvitoEnv();
    let apiCalls = 0;
    let spendingsByDay = new Map<string, number>();
    let itemsByDay = new Map<
      string,
      { impressions: number; views: number; contacts: number }
    >();

    // Fetch BEFORE writes. Partial failure → no DB changes.
    const budgetRange = minMaxIsoDates(budgetStale);
    if (budgetRange) {
      const spendingsPayload = await fetchAvitoSpendings(
        cfg,
        { dateFrom: budgetRange.from, dateTo: budgetRange.to },
        deps
      );
      apiCalls += 1;
      spendingsByDay = parseSpendingsByDay(spendingsPayload);
    }

    const itemsRange = minMaxIsoDates(itemsStale);
    if (itemsRange) {
      const fetched = await fetchAllItemStatsByDay(
        cfg,
        itemsRange.from,
        itemsRange.to,
        deps
      );
      itemsByDay = fetched.byDay;
      apiCalls += fetched.pages;
    }

    const patchDates = new Set([...budgetStale, ...itemsStale]);
    const patches: DayApiPatch[] = [];
    for (const dayDate of patchDates) {
      const patch: DayApiPatch = {
        dayDate,
        writeBudgetValue: false,
        markBudgetSynced: false,
        writeItemsValue: false,
        markItemsSynced: false,
      };
      if (budgetStale.includes(dayDate)) {
        patch.markBudgetSynced = true;
        if (spendingsByDay.has(dayDate)) {
          patch.writeBudgetValue = true;
          patch.budgetSpentRub = spendingsByDay.get(dayDate)!;
        }
      }
      if (itemsStale.includes(dayDate)) {
        patch.markItemsSynced = true;
        if (itemsByDay.has(dayDate)) {
          const c = itemsByDay.get(dayDate)!;
          patch.writeItemsValue = true;
          patch.impressions = c.impressions;
          patch.views = c.views;
          patch.contacts = c.contacts;
        }
      }
      patches.push(patch);
    }

    const syncedAt = new Date();
    await db.transaction(async (tx) => {
      for (const patch of patches) {
        const [existing] = await tx
          .select()
          .from(rnpAvitoDailyStats)
          .where(
            and(
              eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
              eq(rnpAvitoDailyStats.dayDate, patch.dayDate)
            )
          )
          .limit(1);

        const setValues: Partial<typeof rnpAvitoDailyStats.$inferInsert> = {
          updatedAt: syncedAt,
          apiSyncedAt: syncedAt,
        };
        if (patch.markBudgetSynced) {
          setValues.budgetApiSyncedAt = syncedAt;
        }
        if (patch.writeBudgetValue) {
          setValues.budgetSpentRub = patch.budgetSpentRub ?? null;
        }
        if (patch.markItemsSynced) {
          setValues.itemsApiSyncedAt = syncedAt;
        }
        if (patch.writeItemsValue) {
          setValues.impressions = patch.impressions ?? null;
          setValues.views = patch.views ?? null;
          setValues.contacts = patch.contacts ?? null;
        }

        if (!existing) {
          await tx.insert(rnpAvitoDailyStats).values({
            id: newId(),
            organizationId: ctx.organizationId,
            dayDate: patch.dayDate,
            budgetSpentRub: patch.writeBudgetValue
              ? (patch.budgetSpentRub ?? null)
              : null,
            impressions: patch.writeItemsValue
              ? (patch.impressions ?? null)
              : null,
            views: patch.writeItemsValue ? (patch.views ?? null) : null,
            contacts: patch.writeItemsValue ? (patch.contacts ?? null) : null,
            apiSyncedAt: syncedAt,
            budgetApiSyncedAt: patch.markBudgetSynced ? syncedAt : null,
            itemsApiSyncedAt: patch.markItemsSynced ? syncedAt : null,
            trialsScheduled: null,
            trialsCompleted: null,
            trialsScheduledIsManual: false,
            trialsCompletedIsManual: false,
            manualUpdatedAt: syncedAt,
            createdAt: syncedAt,
            updatedAt: syncedAt,
          });
        } else {
          await tx
            .update(rnpAvitoDailyStats)
            .set(setValues)
            .where(eq(rnpAvitoDailyStats.id, existing.id));
        }
      }
    });

    try {
      const { refreshAvitoExpensesFromRnp } = await import(
        "@/server/services/expenses-service"
      );
      await refreshAvitoExpensesFromRnp(db, ctx.organizationId);
    } catch (err) {
      console.error(
        "[rnp-avito] failed to refresh director expenses after sync",
        err instanceof Error ? err.message : "unknown"
      );
    }

    const monthPayload = await getRnpAvitoMonth(db, ctx, { year, month });
    return {
      year,
      month,
      syncedDays: patches.length,
      apiCalls,
      skipped: false,
      mode,
      lastSyncedAt: syncedAt.toISOString(),
      monthPayload,
    };
  } finally {
    syncLocks.delete(lockKey);
  }
}
