import type { StudentLessonLedgerReason } from "@/lib/types";

const REASON_RU: Record<StudentLessonLedgerReason, string> = {
  purchase: "Покупка тарифа",
  present: "Списание за занятие",
  absent_unexcused: "Списание (неявка)",
  reversal: "Сторно",
  manual_adjustment: "Ручная корректировка",
  refund_clawback: "Возврат (списание с баланса)",
};

export function lessonLedgerReasonLabel(
  reason: string | null | undefined
): string {
  if (!reason) return "Операция";
  return REASON_RU[reason as StudentLessonLedgerReason] ?? reason;
}

export function lessonLedgerDeltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}
