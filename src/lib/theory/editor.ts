import type { Homework } from "@/lib/types";

/**
 * Тест теории — только тот, что уже прикреплён к материалу.
 * Каталог домашних заданий для выбора не используется.
 */
export function attachedTheoryTest(
  homeworks: Homework[],
  testId: string | null | undefined
): Homework | undefined {
  const id = testId?.trim();
  if (!id) return undefined;
  return homeworks.find((item) => item.id === id);
}

export const THEORY_ALLOWS_CATALOG_TEST_PICK = false;
