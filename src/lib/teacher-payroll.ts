import {
  MAX_SLOT_STUDENTS,
  SLOT_PAY_PRESENT_COUNTS,
  type SlotPayPresentCount,
} from "@/lib/teacher-slot";
import type { AttendanceStatus } from "@/lib/types";

export type PayrollEntryType = "accrual" | "adjustment" | "payout";

export type SlotPayRates = Partial<Record<SlotPayPresentCount, number>>;

export type PayrollBlockedReason =
  | "rates_not_configured"
  | "rate_missing_for_count"
  | "present_count_out_of_range";

export type PayrollAmountResult =
  | { ok: true; amountKopecks: number }
  | { ok: false; reason: PayrollBlockedReason };

export function isPresentAttendance(status: AttendanceStatus | null | undefined): boolean {
  return status === "present";
}

export function attendanceCountsAsMarked(
  status: AttendanceStatus | null | undefined
): boolean {
  return (
    status === "present" ||
    status === "absent_excused" ||
    status === "absent_unexcused" ||
    status === "cancelled" ||
    status === "rescheduled"
  );
}

export function snapshotRates(rates: SlotPayRates): Record<string, number> {
  const out: Record<string, number> = {};
  for (const count of SLOT_PAY_PRESENT_COUNTS) {
    const value = rates[count];
    if (value != null) out[String(count)] = value;
  }
  return out;
}

export function ratesFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): SlotPayRates {
  const rates: SlotPayRates = {};
  if (!snapshot) return rates;
  for (const count of SLOT_PAY_PRESENT_COUNTS) {
    const raw = snapshot[String(count)];
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      rates[count] = raw;
    }
  }
  return rates;
}

export function amountForPresentCount(
  rates: SlotPayRates,
  presentCount: number
): PayrollAmountResult {
  if (presentCount === 0) {
    return { ok: true, amountKopecks: 0 };
  }
  if (!Number.isInteger(presentCount) || presentCount < 0) {
    return { ok: false, reason: "present_count_out_of_range" };
  }
  if (presentCount > MAX_SLOT_STUDENTS) {
    return { ok: false, reason: "present_count_out_of_range" };
  }
  const count = presentCount as SlotPayPresentCount;
  const amount = rates[count];
  if (amount == null) {
    const anyRate = SLOT_PAY_PRESENT_COUNTS.some((c) => rates[c] != null);
    return {
      ok: false,
      reason: anyRate ? "rate_missing_for_count" : "rates_not_configured",
    };
  }
  return { ok: true, amountKopecks: amount };
}

export function payrollBlockedMessage(
  reason: PayrollBlockedReason,
  presentCount?: number
): string {
  if (reason === "rates_not_configured") {
    return "Ставки преподавателя не настроены — начисление не создано";
  }
  if (reason === "rate_missing_for_count") {
    return `Нет ставки для ${presentCount ?? "этого"} присутствующих — начисление не создано`;
  }
  return `Некорректное число присутствующих (${presentCount ?? "?"}): ожидается 0–${MAX_SLOT_STUDENTS}. Начисление не создано.`;
}

export function ratesAreComplete(rates: SlotPayRates): boolean {
  return SLOT_PAY_PRESENT_COUNTS.every((count) => rates[count] != null);
}

export function signedLedgerDelta(
  type: PayrollEntryType,
  amountKopecks: number
): number {
  return type === "payout" ? -amountKopecks : amountKopecks;
}

export function teacherDebtFromTotals(input: {
  accruedKopecks: number;
  adjustmentsKopecks: number;
  paidKopecks: number;
}): number {
  return input.accruedKopecks + input.adjustmentsKopecks - input.paidKopecks;
}

export function netSlotAmount(entries: { type: PayrollEntryType; amountKopecks: number }[]): number {
  return entries.reduce((sum, entry) => sum + signedLedgerDelta(entry.type, entry.amountKopecks), 0);
}
