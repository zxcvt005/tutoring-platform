import type { Lesson } from "@/lib/types";

/** Понедельник недели, содержащей date (локальное время). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
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

export function lessonsTimeOverlap(a: Lesson, b: Lesson): boolean {
  if (a.id === b.id) return false;
  if (a.teacherId !== b.teacherId) return false;
  if (a.status === "cancelled" || b.status === "cancelled") return false;
  const a0 = new Date(a.startsAt).getTime();
  const a1 = new Date(a.endsAt).getTime();
  const b0 = new Date(b.startsAt).getTime();
  const b1 = new Date(b.endsAt).getTime();
  return a0 < b1 && b0 < a1;
}

/**
 * Конфликт только если один и тот же ученик уже в другом занятии
 * этого преподавателя в пересекающееся время.
 * Параллельные независимые занятия разрешены.
 */
export function findStudentScheduleConflict(
  lessons: Lesson[],
  draft: Pick<
    Lesson,
    "id" | "teacherId" | "startsAt" | "endsAt" | "status" | "studentIds"
  >
): { lesson: Lesson; studentId: string } | null {
  if (draft.status === "cancelled") return null;
  const ids = uniqueStudentIds(draft.studentIds);
  for (const lesson of lessons) {
    if (lesson.id === draft.id) continue;
    if (!lessonsTimeOverlap(lesson, draft as Lesson)) continue;
    for (const sid of ids) {
      if (lesson.studentIds.includes(sid)) {
        return { lesson, studentId: sid };
      }
    }
  }
  return null;
}

export function uniqueStudentIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000
  );
}

export function combineDateAndTime(
  day: Date,
  hours: number,
  minutes: number
): Date {
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

/** Раскладка параллельных занятий в колонки внутри дня. */
export function layoutLessonColumns(lessons: Lesson[]): {
  lesson: Lesson;
  column: number;
  columns: number;
}[] {
  const active = lessons
    .filter((l) => l.status !== "cancelled")
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
        new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime()
    );
  const cancelled = lessons
    .filter((l) => l.status === "cancelled")
    .map((lesson) => ({ lesson, column: 0, columns: 1 }));

  type Placed = { lesson: Lesson; column: number; end: number };
  const placed: Placed[] = [];
  const result: { lesson: Lesson; column: number; columns: number }[] = [];

  for (const lesson of active) {
    const start = new Date(lesson.startsAt).getTime();
    const end = new Date(lesson.endsAt).getTime();
    const overlapping = placed.filter((p) => p.end > start);
    const used = new Set(overlapping.map((p) => p.column));
    let column = 0;
    while (used.has(column)) column++;
    placed.push({ lesson, column, end });
    result.push({ lesson, column, columns: 1 });
  }

  // Пересчитать ширину: для каждой группы пересечений — max columns
  for (let i = 0; i < result.length; i++) {
    const a = result[i]!;
    const a0 = new Date(a.lesson.startsAt).getTime();
    const a1 = new Date(a.lesson.endsAt).getTime();
    const group = result.filter((b) => {
      const b0 = new Date(b.lesson.startsAt).getTime();
      const b1 = new Date(b.lesson.endsAt).getTime();
      return a0 < b1 && b0 < a1;
    });
    const maxCol = Math.max(...group.map((g) => g.column)) + 1;
    for (const g of group) {
      g.columns = Math.max(g.columns, maxCol);
    }
  }

  return [...result, ...cancelled];
}

export function lessonParticipantsLabel(
  lesson: Lesson,
  nameOf: (id: string) => string
): string {
  const ids = lesson.studentIds;
  if (ids.length === 0) return "Без учеников";
  if (ids.length === 1) return nameOf(ids[0]!);
  if (ids.length <= 3) return ids.map(nameOf).join(", ");
  return `${ids.length} учеников`;
}

/** Сетка часов */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 21;
export const SLOT_MINUTES = 30;
/** Недельный календарь */
export const PX_PER_MINUTE = 1.05;
/** Компактный день Кафедры */
export const DAY_HOME_PX_PER_MINUTE = 0.72;
