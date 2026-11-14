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
  fetchAvitoItemStatsPage,
  fetchAvitoSpendings,
  type AvitoClientDeps,
} from "@/server/avito/client";
import { diagnoseAvitoEnv, requireAvitoEnv } from "@/server/avito/env";
import {
  mergeAvitoDayMetrics,
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

function toDayBase(
  row: typeof rnpAvitoDailyStats.$inferSelect
): Omit<
  RnpAvitoDayStats,
  | "trialsScheduled"
  | "trialsCompleted"
  | "trialsScheduledSource"
  | "trialsCompletedSource"
> {
  return {
    date: row.dayDate,
    budgetSpentRub: row.budgetSpentRub,
    impressions: row.impressions,
    views: row.views,
    contacts: row.contacts,
    manualUpdatedAt: row.manualUpdatedAt.toISOString(),
    apiSyncedAt: row.apiSyncedAt ? row.apiSyncedAt.toISOString() : null,
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
) {
  const merged = new Map<
    string,
    { impressions: number; views: number; contacts: number }
  >();
  let offset = 0;
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
  return merged;
}

export type SyncRnpAvitoMonthResult = {
  year: number;
  month: number;
  syncedDays: number;
  lastSyncedAt: string;
  monthPayload: RnpAvitoMonthPayload;
};

/**
 * Pull Avito API metrics for a month and upsert only API columns.
 * Manual fields are never modified. On fetch/parse failure nothing is written.
 */
export async function syncRnpAvitoMonth(
  db: AppDb,
  ctx: AuthContext,
  input: { year: number; month: number },
  deps: AvitoClientDeps = {}
): Promise<SyncRnpAvitoMonthResult> {
  requireRoles(ctx, ["director"]);
  const { year, month } = parseYearMonth(input.year, input.month);
  const lockKey = `${ctx.organizationId}:${year}-${month}`;
  if (syncLocks.has(lockKey)) {
    throw conflict("Синхронизация этого месяца уже выполняется");
  }
  syncLocks.add(lockKey);

  try {
    const cfg = requireAvitoEnv();
    const from = isoDate(year, month, 1);
    const lastDay = daysInMonth(year, month);
    const to = isoDate(year, month, lastDay);
    const monthDates = buildMonthDayShell(year, month).map((d) => d.date);

    // Fetch both endpoints BEFORE any DB writes (atomicity of month update).
    const spendingsPayload = await fetchAvitoSpendings(
      cfg,
      { dateFrom: from, dateTo: to },
      deps
    );
    const spendingsByDay = parseSpendingsByDay(spendingsPayload);
    const itemsByDay = await fetchAllItemStatsByDay(cfg, from, to, deps);
    const merged = mergeAvitoDayMetrics(monthDates, spendingsByDay, itemsByDay);

    const syncedAt = new Date();
    const rows = [...merged.entries()].map(([dayDate, metrics]) => ({
      id: newId(),
      organizationId: ctx.organizationId,
      dayDate,
      budgetSpentRub: metrics.budgetSpentRub,
      impressions: metrics.impressions,
      views: metrics.views,
      contacts: metrics.contacts,
      apiSyncedAt: syncedAt,
      updatedAt: syncedAt,
    }));

    await db.transaction(async (tx) => {
      // Clear previous API values for the month so removed days don't keep stale API data.
      // Manual columns are preserved.
      await tx
        .update(rnpAvitoDailyStats)
        .set({
          budgetSpentRub: null,
          impressions: null,
          views: null,
          contacts: null,
          apiSyncedAt: null,
          updatedAt: syncedAt,
        })
        .where(
          and(
            eq(rnpAvitoDailyStats.organizationId, ctx.organizationId),
            gte(rnpAvitoDailyStats.dayDate, from),
            lte(rnpAvitoDailyStats.dayDate, to)
          )
        );

      for (const row of rows) {
        await tx
          .insert(rnpAvitoDailyStats)
          .values({
            id: row.id,
            organizationId: row.organizationId,
            dayDate: row.dayDate,
            budgetSpentRub: row.budgetSpentRub,
            impressions: row.impressions,
            views: row.views,
            contacts: row.contacts,
            apiSyncedAt: row.apiSyncedAt,
            trialsScheduled: null,
            trialsCompleted: null,
            trialsScheduledIsManual: false,
            trialsCompletedIsManual: false,
            manualUpdatedAt: syncedAt,
            createdAt: syncedAt,
            updatedAt: row.updatedAt,
          })
          .onConflictDoUpdate({
            target: [
              rnpAvitoDailyStats.organizationId,
              rnpAvitoDailyStats.dayDate,
            ],
            set: {
              budgetSpentRub: row.budgetSpentRub,
              impressions: row.impressions,
              views: row.views,
              contacts: row.contacts,
              apiSyncedAt: row.apiSyncedAt,
              updatedAt: row.updatedAt,
              // trials_* и *_is_manual не трогаем — ручные переопределения сохраняются.
            },
          });
      }
    });

    // Обновить автозаписи «Расходы» из актуальных дневных сумм (без повторного вызова Avito API).
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
      syncedDays: rows.length,
      lastSyncedAt: syncedAt.toISOString(),
      monthPayload,
    };
  } finally {
    syncLocks.delete(lockKey);
  }
}
