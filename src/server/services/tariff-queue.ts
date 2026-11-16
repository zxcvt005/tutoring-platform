import type { AuthContext } from "@/server/authz/context";
import type { AppDb } from "@/server/db/types";

/** @deprecated Очередь тарифов заменена моделью lesson_orders; no-op для совместимости импортов. */
export function shouldActivatePaidAssignment(
  _currentRemaining?: number | null,
  _hasCurrent?: boolean
): boolean {
  return false;
}

/** @deprecated */
export async function settleDebtOnNewAssignment(
  _db: AppDb,
  _ctx: AuthContext,
  _studentId: string,
  _newAssignmentId: string
) {
  return { settled: false as const, previousRemaining: null as number | null };
}

/** @deprecated */
export async function activateQueuedIfNeeded(
  _db: AppDb,
  _ctx: AuthContext,
  _studentId: string
): Promise<{ activated: false; assignmentId: null }> {
  return { activated: false, assignmentId: null };
}