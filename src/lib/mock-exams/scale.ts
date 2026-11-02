/** Шкала ЕГЭ по физике. Индекс — первичный балл, значение — тестовый. */
const TEST_BY_PRIMARY = [
  0, 5, 9, 14, 18, 23, 27, 32, 36, 39, 41, 43, 44, 46, 48, 49, 51, 53, 54, 56,
  58, 59, 61, 62, 64, 65, 67, 68, 70, 71, 73, 74, 76, 77, 79, 80, 82, 84, 86,
  88, 90, 92, 94, 96, 98, 100,
] as const;

export const EGE_PHYSICS_SCALE: readonly number[] = TEST_BY_PRIMARY;

export function primaryToTestScore(primary: number): number | null {
  if (!Number.isInteger(primary) || primary < 0 || primary > 45) return null;
  return TEST_BY_PRIMARY[primary] ?? null;
}
