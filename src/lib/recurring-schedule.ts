/**
 * Расчёт вхождений регулярного расписания в локальном времени браузера/сервера.
 * weekdays: 1=пн … 7=вс (как workDays преподавателя).
 */

import { dateKeyLocal } from "@/lib/calendar-month";

export const AUDITORIA_UPCOMING_DAYS = 14;
/** Горизонт материализации занятий из шаблона (недели вперёд). */
export const SCHEDULE_HORIZON_WEEKS = 8;

export type RecurringScheduleSpec = {
  weekdays: number[];
  /** HH:MM */
  startTime: string;
  durationMin: number;
  /** С какого момента шаблон действует (обычно «сейчас» или выбранная дата) */
  activeFrom: Date;
  activeUntil?: Date | null;
};

export type Occurrence = {
  /** YYYY-MM-DD локально */
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

/**
 * Список будущих вхождений от now (строго в будущем или на границе now)
 * до now + horizonWeeks. Не включает прошлые слоты.
 */
export function listUpcomingOccurrences(
  spec: RecurringScheduleSpec,
  now: Date,
  horizonWeeks = SCHEDULE_HORIZON_WEEKS
): Occurrence[] {
  const weekdays = [...new Set(spec.weekdays)].filter(
    (d) => d >= 1 && d <= 7
  );
  if (weekdays.length === 0) return [];
  const { h, m } = parseHm(spec.startTime);
  const durationMs = Math.max(1, spec.durationMin) * 60_000;

  const activeFrom = new Date(spec.activeFrom);
  const until = new Date(now.getTime() + horizonWeeks * 7 * 86_400_000);
  if (spec.activeUntil && spec.activeUntil < until) {
    // cap
  }
  const hardUntil =
    spec.activeUntil && spec.activeUntil.getTime() < until.getTime()
      ? spec.activeUntil
      : until;

  // Стартуем с начала дня activeFrom или сегодня (что позже)
  const cursor = new Date(
    Math.max(
      new Date(
        activeFrom.getFullYear(),
        activeFrom.getMonth(),
        activeFrom.getDate()
      ).getTime(),
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    )
  );

  const out: Occurrence[] = [];
  const endScan = new Date(hardUntil);
  endScan.setDate(endScan.getDate() + 1);

  for (
    let d = new Date(cursor);
    d <= endScan;
    d.setDate(d.getDate() + 1)
  ) {
    const wd = jsDayToWeekday(d.getDay());
    if (!weekdays.includes(wd)) continue;
    const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
    if (startsAt.getTime() <= now.getTime()) continue; // не в прошлом и не «уже началось»
    if (startsAt.getTime() < activeFrom.getTime()) continue;
    if (spec.activeUntil && startsAt.getTime() > spec.activeUntil.getTime()) {
      continue;
    }
    if (startsAt.getTime() > hardUntil.getTime()) continue;
    out.push({
      occurrenceKey: dateKeyLocal(startsAt),
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
    });
  }
  return out;
}

/** Первое вхождение не раньше now (для превью). */
export function firstUpcomingOccurrence(
  spec: RecurringScheduleSpec,
  now: Date
): Occurrence | null {
  return listUpcomingOccurrences(spec, now, 3)[0] ?? null;
}

export function isWithinUpcomingWindow(
  startsAtIso: string,
  now: Date,
  days = AUDITORIA_UPCOMING_DAYS
): boolean {
  const t = new Date(startsAtIso).getTime();
  const end = now.getTime() + days * 86_400_000;
  return t >= now.getTime() && t <= end;
}

export function filterUpcomingLessonsForAuditoria<
  T extends { startsAt: string; status: string },
>(lessons: T[], now: Date = new Date()): T[] {
  return lessons
    .filter(
      (l) =>
        l.status === "planned" &&
        isWithinUpcomingWindow(l.startsAt, now, AUDITORIA_UPCOMING_DAYS)
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
}
