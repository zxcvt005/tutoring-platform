import { and, asc, eq, gte, lte } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  type RnpAvitoDayStats,
  type RnpAvitoMonthPayload,
  buildMonthDayShell,
  daysInMonth,
  emptyDayStats,
  isoDate,
} from "@/lib/rnp-avito";
import {
  fetchAvitoItemStatsPage,
  fetchAvitoSpendings,
  type AvitoClientDeps,
} from "@/server/avito/client";
import { isAvitoConfigured, requireAvitoEnv } from "@/server/avito/env";
import {
  mergeAvitoDayMetrics,
  parseItemStatsByDay,
  parseSpendingsByDay,
  readDataTotalCount,
} from "@/server/avito/parse-stats";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { rnpAvitoDailyStats } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, validationError } from "@/server/errors";

const MAX_COUNT = 1_000_000;
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

function toDay(row: typeof rnpAvitoDailyStats.$inferSelect): RnpAvitoDayStats {
  return {
    date: row.dayDate,
    budgetSpentRub: row.budgetSpentRub,
    impressions: row.impressions,
    views: row.views,
    contacts: row.contacts,
    trialsScheduled: row.trialsScheduled,
    trialsCompleted: row.trialsCompleted,
    manualUpdatedAt: row.manualUpdatedAt.toISOString(),
    apiSyncedAt: row.apiSyncedAt ? row.apiSyncedAt.toISOString() : null,
  };
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

  const byDate = new Map(rows.map((r) => [r.dayDate, toDay(r)]));
  const days = shell.map((d) => byDate.get(d.date) ?? emptyDayStats(d.date));

  let lastSyncedAt: string | null = null;
  for (const d of days) {
    if (!d.apiSyncedAt) continue;
    if (!lastSyncedAt || d.apiSyncedAt > lastSyncedAt) {
      lastSyncedAt = d.apiSyncedAt;
    }
  }

  return {
    year,
    month,
    daysInMonth: days.length,
    days,
    apiConnected: isAvitoConfigured(),
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

export async function upsertRnpAvitoManualDay(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertRnpAvitoManualInput
): Promise<RnpAvitoDayStats> {
  requireRoles(ctx, ["director"]);
  const dayDate = parseDayDate(input.date);
  const now = new Date();

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

  const patchManual: {
    trialsScheduled?: number | null;
    trialsCompleted?: number | null;
  } = {};

  if (input.trialsScheduled !== undefined) {
    patchManual.trialsScheduled = parseOptionalNonNegInt(
      input.trialsScheduled,
      "Назначенные пробные",
      MAX_COUNT
    );
  }
  if (input.trialsCompleted !== undefined) {
    patchManual.trialsCompleted = parseOptionalNonNegInt(
      input.trialsCompleted,
      "Проведённые пробные",
      MAX_COUNT
    );
  }

  if (Object.keys(patchManual).length === 0) {
    throw validationError("Нет полей для сохранения");
  }

  if (!existing) {
    if (input.expectedManualUpdatedAt) {
      throw conflict(
        "Запись уже изменена. Обновите данные и повторите сохранение."
      );
    }
    const id = newId();
    await db.insert(rnpAvitoDailyStats).values({
      id,
      organizationId: ctx.organizationId,
      dayDate,
      budgetSpentRub: null,
      impressions: null,
      views: null,
      contacts: null,
      apiSyncedAt: null,
      trialsScheduled: patchManual.trialsScheduled ?? null,
      trialsCompleted: patchManual.trialsCompleted ?? null,
      manualUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const [row] = await db
      .select()
      .from(rnpAvitoDailyStats)
      .where(eq(rnpAvitoDailyStats.id, id))
      .limit(1);
    if (!row) throw new Error("Не удалось сохранить день РНП");
    return toDay(row);
  }

  const expected = input.expectedManualUpdatedAt;
  if (!expected || !sameInstant(existing.manualUpdatedAt, expected)) {
    throw conflict(
      "Запись уже изменена. Обновите данные и повторите сохранение."
    );
  }

  await db
    .update(rnpAvitoDailyStats)
    .set({
      ...patchManual,
      manualUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(rnpAvitoDailyStats.id, existing.id));

  const [row] = await db
    .select()
    .from(rnpAvitoDailyStats)
    .where(eq(rnpAvitoDailyStats.id, existing.id))
    .limit(1);
  if (!row) throw new Error("Не удалось сохранить день РНП");
  return toDay(row);
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
            },
          });
      }
    });

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
