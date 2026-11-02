import {
  addAppDateKey,
  appDateKey,
  appTimeHm,
  appZonedParts,
  fromAppDateTime,
  fromAppWall,
  startOfAppDay,
} from "@/lib/app-time";

export const PRESS_REMINDER_KINDS = ["once", "recurring"] as const;
export type PressReminderKind = (typeof PRESS_REMINDER_KINDS)[number];

export const PRESS_REMINDER_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
] as const;
export type PressReminderFrequency =
  (typeof PRESS_REMINDER_FREQUENCIES)[number];

export const PRESS_REMINDER_STATUSES = [
  "active",
  "disabled",
  "archived",
] as const;
export type PressReminderStatus = (typeof PRESS_REMINDER_STATUSES)[number];

export const PRESS_REMINDER_VIEWS = [
  "today",
  "upcoming",
  "completed",
  "all",
] as const;
export type PressReminderView = (typeof PRESS_REMINDER_VIEWS)[number];

export const pressReminderKindLabel: Record<PressReminderKind, string> = {
  once: "Разовое",
  recurring: "Регулярное",
};

export const pressReminderFrequencyLabel: Record<
  PressReminderFrequency,
  string
> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
};

export const pressReminderStatusLabel: Record<PressReminderStatus, string> = {
  active: "Активно",
  disabled: "Отключено",
  archived: "Архив",
};

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function withStartClock(startAt: Date, dateKey: string): Date {
  return fromAppDateTime(dateKey, appTimeHm(startAt));
}

/** n-е повторение от даты начала. 0 — само начало. День месяца берётся из начала и ужимается до последнего дня месяца. */
export function reminderOccurrenceAt(
  startAt: Date,
  frequency: PressReminderFrequency | null,
  index: number
): Date {
  if (index < 0) {
    throw new Error("Индекс повторения не может быть отрицательным");
  }
  if (!frequency || index === 0) {
    return new Date(startAt.getTime());
  }
  if (frequency === "daily") {
    return withStartClock(startAt, addAppDateKey(appDateKey(startAt), index));
  }
  if (frequency === "weekly") {
    return withStartClock(
      startAt,
      addAppDateKey(appDateKey(startAt), index * 7)
    );
  }
  const p = appZonedParts(startAt);
  const absolute = p.year * 12 + (p.month - 1) + index;
  const year = Math.floor(absolute / 12);
  const month = (absolute % 12) + 1;
  const day = Math.min(p.day, daysInMonth(year, month));
  return fromAppWall(year, month, day, p.hour, p.minute, p.second);
}

/** Первое повторение строго после указанного момента. */
export function nextReminderOccurrenceAfter(
  startAt: Date,
  frequency: PressReminderFrequency,
  after: Date
): Date {
  for (let i = 0; i < 20_000; i += 1) {
    const occ = reminderOccurrenceAt(startAt, frequency, i);
    if (occ.getTime() > after.getTime()) return occ;
  }
  throw new Error("Не удалось вычислить следующее повторение");
}

export function reminderIsDueOnOrBeforeDay(
  occurrenceAt: Date,
  now: Date
): boolean {
  return appDateKey(occurrenceAt) <= appDateKey(now);
}

export function reminderIsOnDay(occurrenceAt: Date, now: Date): boolean {
  return appDateKey(occurrenceAt) === appDateKey(now);
}

export function reminderIsAfterDay(occurrenceAt: Date, now: Date): boolean {
  return appDateKey(occurrenceAt) > appDateKey(now);
}

export function startOfTomorrow(now: Date): Date {
  return startOfAppDay(addAppDateKey(appDateKey(now), 1));
}

export function reminderCompletionProgress(
  items: { completedAt: string | null }[]
): { completed: number; total: number; percent: number } {
  const total = items.length;
  const completed = items.filter((item) => Boolean(item.completedAt)).length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
