import { validationError } from "@/server/errors";

export type AvitoDayApiMetrics = {
  /** null — в ответе spendings дня не было (не подменять нулём). */
  budgetSpentRub: number | null;
  /** null — в ответе items дня не было. */
  impressions: number | null;
  views: number | null;
  contacts: number | null;
  /** День присутствовал в spendings (в т.ч. с явным 0). */
  hasBudget: boolean;
  /** День присутствовал в items stats. */
  hasItems: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function roundRub(value: number): number {
  return Math.max(0, Math.round(value));
}

function roundCount(value: number): number {
  return Math.max(0, Math.round(value));
}

/** YYYY-MM-DD without timezone shifts. */
export function parseAvitoDayKey(value: unknown): string | null {
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // ISO datetime → take calendar date part as returned (no TZ convert)
    const m = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(s);
    if (m) return m[1]!;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    // YYYYMMDD integer used by some Avito day groupings
    if (value >= 20000101 && value <= 21001231) {
      const s = String(value);
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    // Unix seconds → calendar date in Europe/Moscow (Avito)
    if (value > 1_000_000_000 && value < 4_000_000_000) {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return fmt.format(new Date(value * 1000));
    }
  }
  return null;
}

/**
 * Parse POST /stats/v2/accounts/{user_id}/spendings response.
 * Uses category values for the requested period; prefers slug "promotion",
 * otherwise sums all category values for the day.
 */
export function parseSpendingsByDay(payload: unknown): Map<string, number> {
  if (!isRecord(payload) || !isRecord(payload.result)) {
    throw validationError("Avito spendings: неожиданный формат ответа");
  }
  const groupings = payload.result.groupings;
  if (!Array.isArray(groupings)) {
    throw validationError("Avito spendings: отсутствует result.groupings");
  }

  const byDay = new Map<string, number>();
  for (const row of groupings) {
    if (!isRecord(row)) {
      throw validationError("Avito spendings: некорректная группировка");
    }
    const date = parseAvitoDayKey(row.date);
    if (!date) {
      throw validationError(
        "Avito spendings: не удалось распознать дату группировки"
      );
    }
    const spendings = row.spendings;
    if (!Array.isArray(spendings)) {
      throw validationError("Avito spendings: отсутствует spendings");
    }

    let promotion: number | null = null;
    let total = 0;
    let any = false;
    for (const item of spendings) {
      if (!isRecord(item)) continue;
      const value = asFiniteNumber(item.value);
      if (value == null) continue;
      any = true;
      total += value;
      if (item.slug === "promotion") promotion = value;
    }
    if (!any) {
      byDay.set(date, 0);
      continue;
    }
    byDay.set(date, roundRub(promotion ?? total));
  }
  return byDay;
}

type DayCounters = { impressions: number; views: number; contacts: number };

function emptyCounters(): DayCounters {
  return { impressions: 0, views: 0, contacts: 0 };
}

function addMetric(target: DayCounters, slug: unknown, value: unknown) {
  const n = asFiniteNumber(value);
  if (n == null) return;
  if (slug === "impressions") target.impressions += n;
  else if (slug === "views") target.views += n;
  else if (slug === "contacts") target.contacts += n;
}

/**
 * Parse POST /stats/v2/accounts/{user_id}/items response (grouping=day).
 * Aggregates metrics if several rows share the same day (defensive).
 */
export function parseItemStatsByDay(payload: unknown): Map<string, DayCounters> {
  if (!isRecord(payload) || !isRecord(payload.result)) {
    throw validationError("Avito items stats: неожиданный формат ответа");
  }
  const groupings = payload.result.groupings;
  if (!Array.isArray(groupings)) {
    throw validationError("Avito items stats: отсутствует result.groupings");
  }

  const byDay = new Map<string, DayCounters>();
  for (const row of groupings) {
    if (!isRecord(row)) {
      throw validationError("Avito items stats: некорректная группировка");
    }
    // Prefer explicit date if present; otherwise id (YYYYMMDD / unix).
    const date =
      parseAvitoDayKey(row.date) ?? parseAvitoDayKey(row.id);
    if (!date) {
      throw validationError(
        "Avito items stats: не удалось распознать дату группировки"
      );
    }
    const metrics = row.metrics;
    if (!Array.isArray(metrics)) {
      throw validationError("Avito items stats: отсутствует metrics");
    }
    const bucket = byDay.get(date) ?? emptyCounters();
    for (const metric of metrics) {
      if (!isRecord(metric)) continue;
      addMetric(bucket, metric.slug, metric.value);
    }
    byDay.set(date, bucket);
  }

  for (const [date, c] of byDay) {
    byDay.set(date, {
      impressions: roundCount(c.impressions),
      views: roundCount(c.views),
      contacts: roundCount(c.contacts),
    });
  }
  return byDay;
}

/**
 * Сливает spendings и items по календарному дню.
 * Отсутствие дня в одном источнике ≠ 0: оставляем null и флаги hasBudget/hasItems,
 * чтобы sync не затирал ранее сохранённые корректные значения.
 */
export function mergeAvitoDayMetrics(
  dates: string[],
  spendings: Map<string, number>,
  items: Map<string, DayCounters>
): Map<string, AvitoDayApiMetrics> {
  const out = new Map<string, AvitoDayApiMetrics>();
  for (const date of dates) {
    const hasBudget = spendings.has(date);
    const hasItems = items.has(date);
    if (!hasBudget && !hasItems) continue;
    const counters = items.get(date);
    out.set(date, {
      budgetSpentRub: hasBudget ? (spendings.get(date) ?? 0) : null,
      impressions: hasItems ? (counters?.impressions ?? 0) : null,
      views: hasItems ? (counters?.views ?? 0) : null,
      contacts: hasItems ? (counters?.contacts ?? 0) : null,
      hasBudget,
      hasItems,
    });
  }
  return out;
}

export function readDataTotalCount(payload: unknown): number | null {
  if (!isRecord(payload) || !isRecord(payload.result)) return null;
  const n = asFiniteNumber(payload.result.dataTotalCount);
  return n == null ? null : Math.trunc(n);
}
