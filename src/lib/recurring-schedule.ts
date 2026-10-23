/**
 * Расчёт вхождений регулярного расписания в Europe/Moscow.
 * weekdays: 1=пн … 7=вс (как workDays преподавателя).
 */

import {
  addAppDateKey,
  appDateKey,
  appZonedParts,
  fromAppDateTime,
  startOfAppDay,
} from "@/lib/app-time";

export const AUDITORIA_UPCOMING_DAYS = 14;
/** Горизонт материализации занятий из шаблона (недели вперёд). */
export const SCHEDULE_HORIZON_WEEKS = 8;

export type RecurringScheduleSpec = {
  weekdays: number[];
  /** HH:MM по Москве */
  startTime: string;
  durationMin: number;
  activeFrom: Date;
  activeUntil?: Date | null;
};

export type Occurrence = {
  /** YYYY-MM-DD по Москве */
  occurrenceKey: string;
  startsAt: Date;
  endsAt: Date;
};

function parseHm(startTime: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!m) throw new Error("Некорректное время (ожидается HH:MM)");
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error("Некорректное время");
  }
  return { h, m: min };
}

/** JS getDay(): 0=вс … 6=сб → наш 1=пн … 7=вс */
export function jsDayToWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

export function weekdayToJsDay(weekday: number): number {
  return weekday === 7 ? 0 : weekday;
}

function eachDateKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let key = fromKey;
  let guard = 0;
  while (key <= toKey && guard < 400) {
    out.push(key);
    key = addAppDateKey(key, 1);
    guard += 1;
  }
  return out;
}

function occurrenceOnDate(
  spec: RecurringScheduleSpec,
  dateKey: string,
  durationMs: number
): Occurrence | null {
  const weekdays = [...new Set(spec.weekdays)].filter((d) => d >= 1 && d <= 7);
  const startsAt = fromAppDateTime(dateKey, spec.startTime);
  const wd = appZonedParts(startsAt).weekday;
  if (!weekdays.includes(wd)) return null;
  if (startsAt.getTime() < spec.activeFrom.getTime()) return null;
  if (spec.activeUntil && startsAt.getTime() > spec.activeUntil.getTime()) {
    return null;
  }
  return {
    occurrenceKey: dateKey,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMs),
  };
}

/**
 * Список будущих вхождений от now (строго в будущем)
 * до now + horizonWeeks. Не включает прошлые слоты.
 */
export function listUpcomingOccurrences(
  spec: RecurringScheduleSpec,
  now: Date,
  horizonWeeks = SCHEDULE_HORIZON_WEEKS
): Occurrence[] {
  const weekdays = [...new Set(spec.weekdays)].filter((d) => d >= 1 && d <= 7);
  if (weekdays.length === 0) return [];
  parseHm(spec.startTime);
  const durationMs = Math.max(1, spec.durationMin) * 60_000;
  const until = new Date(now.getTime() + horizonWeeks * 7 * 86_400_000);
  const hardUntil =
    spec.activeUntil && spec.activeUntil.getTime() < until.getTime()
      ? spec.activeUntil
      : until;
  const fromKey = appDateKey(
    new Date(
      Math.max(startOfAppDay(spec.activeFrom).getTime(), startOfAppDay(now).getTime())
    )
  );
  const toKey = appDateKey(hardUntil);
  const out: Occurrence[] = [];
  for (const key of eachDateKey(fromKey, toKey)) {
    const occ = occurrenceOnDate(spec, key, durationMs);
    if (!occ) continue;
    if (occ.startsAt.getTime() <= now.getTime()) continue;
    if (occ.startsAt.getTime() > hardUntil.getTime()) continue;
    out.push(occ);
  }
  return out;
}

/**
 * Вхождения шаблона в полуинтервале [from, to], включая прошлое.
 */
export function listOccurrencesInRange(
  spec: RecurringScheduleSpec,
  from: Date,
  to: Date
): Occurrence[] {
  const weekdays = [...new Set(spec.weekdays)].filter((d) => d >= 1 && d <= 7);
  if (weekdays.length === 0) return [];
  parseHm(spec.startTime);
  const durationMs = Math.max(1, spec.durationMin) * 60_000;
  const fromKey = appDateKey(
    new Date(
      Math.max(from.getTime(), startOfAppDay(spec.activeFrom).getTime())
    )
  );
  const hardUntil =
    spec.activeUntil && spec.activeUntil.getTime() < to.getTime()
      ? spec.activeUntil
      : to;
  const toKey = appDateKey(hardUntil);
  const out: Occurrence[] = [];
  for (const key of eachDateKey(fromKey, toKey)) {
    const occ = occurrenceOnDate(spec, key, durationMs);
    if (!occ) continue;
    if (occ.startsAt.getTime() < from.getTime()) continue;
    if (occ.startsAt.getTime() > hardUntil.getTime()) continue;
    out.push(occ);
  }
  return out;
}

export function firstUpcomingOccurrence(
  spec: RecurringScheduleSpec,
  now: Date,
  horizonWeeks = SCHEDULE_HORIZON_WEEKS
): Occurrence | null {
  return listUpcomingOccurrences(spec, now, horizonWeeks)[0] ?? null;
}

export function isWithinUpcomingWindow(
  startsAtIso: string,
  now: Date,
  days = AUDITORIA_UPCOMING_DAYS
): boolean {
  const t = new Date(startsAtIso).getTime();
  const n = now.getTime();
  if (t < n) return false;
  return t <= n + days * 86_400_000;
}

export function filterUpcomingLessonsForAuditoria<
  T extends { startsAt: string; status: string },
>(lessons: T[], now: Date): T[] {
  return lessons
    .filter(
      (l) =>
        l.status === "planned" && isWithinUpcomingWindow(l.startsAt, now)
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
}
