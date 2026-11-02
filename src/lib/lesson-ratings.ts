import { appDateKey, formatInAppZone } from "@/lib/app-time";
import { lessonHasOccurred } from "@/lib/kafedra-today";

export const LESSON_RATING_MIN = 1;
export const LESSON_RATING_MAX = 10;
/** Комментарий больше не обязателен ни для какой оценки. */
export const LESSON_RATING_COMMENT_REQUIRED_MAX = 0;
/** 7–10 считаются положительными в интерфейсе ученика. */
export const LESSON_RATING_POSITIVE_MIN = 7;
export const LESSON_RATING_COMMENT_MAX = 2000;
export const LESSON_RATING_PAGE_SIZE = 40;

export type LessonRatingScore = number;

export function isLessonRatingScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LESSON_RATING_MIN &&
    value <= LESSON_RATING_MAX
  );
}

export function parseLessonRatingScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!isLessonRatingScore(n)) {
    throw new Error("Оценка должна быть целым числом от 1 до 10");
  }
  return n;
}

export function ratingRequiresComment(score: number): boolean {
  void score;
  return false;
}

export function ratingOffersComment(score: number): boolean {
  return score < LESSON_RATING_POSITIVE_MIN;
}

export function isPositiveLessonRating(score: number): boolean {
  return score >= LESSON_RATING_POSITIVE_MIN;
}

export function studentCanRateLesson(input: {
  lessonStatus: string;
  startsAt: string | Date;
  attendanceStatus?: string | null;
  now?: Date;
}): boolean {
  if (input.lessonStatus === "cancelled") return false;
  if (input.attendanceStatus !== "present") return false;
  if (input.lessonStatus === "done") return true;
  return lessonHasOccurred({ startsAt: String(input.startsAt) }, input.now);
}

export function roundLessonRatingAverage(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

export function formatLessonRatingAverage(value: number | null): string {
  if (value == null) return "Нет оценок";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return `${text}/10`;
}

export function lessonRatingCountLabel(count: number): string {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return `${count} оценка`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) {
    return `${count} оценки`;
  }
  return `${count} оценок`;
}

export function formatTeacherLessonRating(
  name: string,
  average: number | null,
  count: number
): string {
  if (average == null || count === 0) return `${name} — Нет оценок`;
  return `${name} — ${formatLessonRatingAverage(average)} · ${lessonRatingCountLabel(count)}`;
}

export function lessonRatingTone(
  score: number
): "high" | "mid" | "low" {
  if (score >= LESSON_RATING_POSITIVE_MIN) return "high";
  if (score >= 5) return "mid";
  return "low";
}

export function groupRatingsByAppDay<T extends { submittedAt: string }>(
  items: T[]
): { dateKey: string; label: string; items: T[] }[] {
  const groups: { dateKey: string; label: string; items: T[] }[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const dateKey = appDateKey(item.submittedAt);
    const existing = index.get(dateKey);
    if (existing == null) {
      index.set(dateKey, groups.length);
      groups.push({
        dateKey,
        label: formatInAppZone(item.submittedAt, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        items: [item],
      });
    } else {
      groups[existing]!.items.push(item);
    }
  }
  return groups;
}

export const LESSON_RATING_PERIODS = [
  "current_month",
  "previous_month",
  "custom",
  "all",
] as const;
export type LessonRatingPeriod = (typeof LESSON_RATING_PERIODS)[number];

export const lessonRatingPeriodLabel: Record<LessonRatingPeriod, string> = {
  current_month: "Текущий месяц",
  previous_month: "Предыдущий месяц",
  custom: "Свой период",
  all: "Весь период",
};
