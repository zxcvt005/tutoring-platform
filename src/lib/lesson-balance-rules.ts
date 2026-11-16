/** Минимальный допустимый остаток после обычного списания / ручной корректировки. */
export const LESSON_BALANCE_DEBT_FLOOR = -2;

/**
 * Ручное списание не должно опускать баланс ниже лимита долга
 * без явного административного разрешения.
 */
export function manualDebitViolatesDebtFloor(
  remaining: number,
  delta: number,
  allowBelowDebtFloor = false
): boolean {
  if (delta >= 0) return false;
  if (allowBelowDebtFloor) return false;
  return remaining + delta < LESSON_BALANCE_DEBT_FLOOR;
}
