/**
 * Политика устаревания API-метрик РНП Авито (Europe/Moscow calendar days).
 * Никогда не синхронизируем будущие даты.
 */

import { addAppDateKey, appDateKey } from "@/lib/app-time";

export type RnpAvitoSyncMode = "auto" | "force";

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

/** Сегодня: 5 мин; вчера/позавчера: 1 ч; дни 3–6 назад: 1 сут; старше: без авто. */
export function syncTtlMsForAge(daysAgo: number): number | null {
  if (daysAgo <= 0) return 5 * MS_MIN;
  if (daysAgo <= 2) return MS_HOUR;
  if (daysAgo <= 6) return MS_DAY;
  return null;
}

/** Целые календарные дни: 0 = сегодня, 1 = вчера (по ключам YYYY-MM-DD). */
export function calendarDaysBetween(earlier: string, later: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(earlier);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(later);
  if (!a || !b) throw new Error("Некорректный ключ даты");
  const t0 = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const t1 = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((t1 - t0) / MS_DAY);
}

/**
 * Нужна ли повторная синхронизация метрики для дня.
 * - never synced → всегда да (первый проход истории).
 * - auto: по TTL в зависимости от возраста дня; старше 7 дней — только история.
 * - force: все дни выбранного месяца до сегодня (игнор TTL), без будущих дат.
 */
export function isRnpAvitoMetricStale(
  syncedAt: Date | string | null | undefined,
  dayDate: string,
  now: Date,
  mode: RnpAvitoSyncMode
): boolean {
  const today = appDateKey(now);
  if (dayDate > today) return false;

  if (mode === "force") {
    return true;
  }

  if (syncedAt == null || syncedAt === "") {
    return true;
  }

  const ago = calendarDaysBetween(dayDate, today);
  const ttl = syncTtlMsForAge(ago);
  if (ttl == null) return false;

  const t =
    syncedAt instanceof Date ? syncedAt.getTime() : Date.parse(String(syncedAt));
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= ttl;
}

export function minMaxIsoDates(dates: string[]): { from: string; to: string } | null {
  if (dates.length === 0) return null;
  let from = dates[0]!;
  let to = dates[0]!;
  for (const d of dates) {
    if (d < from) from = d;
    if (d > to) to = d;
  }
  return { from, to };
}

/** Даты месяца от 1-го числа до min(конец месяца, сегодня). Будущий месяц → []. */
export function monthDatesThroughToday(
  year: number,
  month: number,
  now: Date
): string[] {
  const today = appDateKey(now);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const start = `${prefix}01`;
  if (start > today) return [];
  const days: string[] = [];
  let cursor = start;
  while (cursor.startsWith(prefix) && cursor <= today) {
    days.push(cursor);
    cursor = addAppDateKey(cursor, 1);
  }
  return days;
}
