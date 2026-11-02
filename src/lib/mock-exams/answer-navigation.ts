import { PART1_TASKS } from "@/lib/mock-exams/ege";

/** Индекс следующего ответа первой части. На последнем задании перехода нет. */
export function nextPart1AnswerIndex(currentIndex: number): number | null {
  if (!Number.isInteger(currentIndex)) return null;
  if (currentIndex < 0 || currentIndex >= PART1_TASKS.length - 1) return null;
  return currentIndex + 1;
}
