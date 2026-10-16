import type { Lesson } from "@/lib/types";

/** Понедельник недели, содержащей date (локальное время). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 вс
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function lessonsOverlap(a: Lesson, b: Lesson): boolean {
  if (a.id === b.id) return false;
  if (a.teacherId !== b.teacherId) return false;
  if (a.status === "cancelled" || b.status === "cancelled") return false;
  const a0 = new Date(a.startsAt).getTime();
  const a1 = new Date(a.endsAt).getTime();
  const b0 = new Date(b.startsAt).getTime();
  const b1 = new Date(b.endsAt).getTime();
  return a0 < b1 && b0 < a1;
}

/** Найти конфликт для черновика занятия среди существующих. */
export function findLessonConflict(
  lessons: Lesson[],
  draft: Pick<Lesson, "id" | "teacherId" | "startsAt" | "endsAt" | "status">
): Lesson | null {
  if (draft.status === "cancelled") return null;
  for (const lesson of lessons) {
    if (lesson.id === draft.id) continue;
    if (lessonsOverlap(lesson, draft as Lesson)) return lesson;
  }
  return null;
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000
  );
}

export function combineDateAndTime(day: Date, hours: number, minutes: number): Date {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

/** Сетка часов для календаря (например 8–21). */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 21;
export const SLOT_MINUTES = 30;
export const PX_PER_MINUTE = 1.2;
