import { addAppDateKey, appDateKey, startOfAppMonth, startOfAppWeek } from "@/lib/app-time";
import { averageKopecks } from "@/lib/money-kopecks";
import {
  signedLedgerDelta,
  teacherDebtFromTotals,
  type PayrollEntryType,
} from "@/lib/teacher-payroll";

export type PayrollLedgerRow = {
  teacherId: string;
  type: PayrollEntryType;
  amountKopecks: number;
  presentCount: number | null;
  occurredAt: string;
  createdAt: string;
};

export type PeriodFilter = {
  from: string;
  to: string;
};

export function entryInPeriod(
  occurredAt: string,
  period: PeriodFilter | null
): boolean {
  if (!period) return true;
  const t = new Date(occurredAt).getTime();
  return t >= new Date(period.from).getTime() && t <= new Date(period.to).getTime();
}

export function summarizeLedger(
  rows: PayrollLedgerRow[],
  period: PeriodFilter | null
) {
  let accruedAll = 0;
  let adjustmentsAll = 0;
  let paidAll = 0;
  let accruedPeriod = 0;
  let adjustmentsPeriod = 0;
  let paidPeriod = 0;
  let completedSlotsPeriod = 0;
  let presentPeriod = 0;
  const teacherIds = new Set<string>();

  for (const row of rows) {
    teacherIds.add(row.teacherId);
    if (row.type === "accrual") accruedAll += row.amountKopecks;
    else if (row.type === "adjustment") adjustmentsAll += row.amountKopecks;
    else paidAll += row.amountKopecks;

    if (!entryInPeriod(row.occurredAt, period)) continue;
    if (row.type === "accrual") {
      accruedPeriod += row.amountKopecks;
      completedSlotsPeriod += 1;
      presentPeriod += row.presentCount ?? 0;
    } else if (row.type === "adjustment") {
      adjustmentsPeriod += row.amountKopecks;
    } else {
      paidPeriod += row.amountKopecks;
    }
  }

  const debt = teacherDebtFromTotals({
    accruedKopecks: accruedAll,
    adjustmentsKopecks: adjustmentsAll,
    paidKopecks: paidAll,
  });

  return {
    accruedAllKopecks: accruedAll,
    adjustmentsAllKopecks: adjustmentsAll,
    paidAllKopecks: paidAll,
    debtKopecks: debt,
    accruedPeriodKopecks: accruedPeriod,
    adjustmentsPeriodKopecks: adjustmentsPeriod,
    paidPeriodKopecks: paidPeriod,
    completedSlotsPeriod,
    presentPeriod,
    averageAccrualPerSlotKopecks: averageKopecks(
      accruedPeriod,
      completedSlotsPeriod
    ),
    averagePresentPerSlot:
      completedSlotsPeriod > 0
        ? Math.round((presentPeriod * 100) / completedSlotsPeriod) / 100
        : null,
    teacherCount: teacherIds.size,
  };
}

export type DynamicsBucket = {
  key: string;
  label: string;
  accruedKopecks: number;
  paidKopecks: number;
  adjustmentsKopecks: number;
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1));
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

export function buildMonthlyDynamics(
  rows: PayrollLedgerRow[],
  period: PeriodFilter | null
): DynamicsBucket[] {
  const map = new Map<string, DynamicsBucket>();
  for (const row of rows) {
    if (!entryInPeriod(row.occurredAt, period)) continue;
    const start = startOfAppMonth(row.occurredAt);
    const key = appDateKey(start).slice(0, 7);
    const bucket = map.get(key) ?? {
      key,
      label: monthLabel(key),
      accruedKopecks: 0,
      paidKopecks: 0,
      adjustmentsKopecks: 0,
    };
    if (row.type === "accrual") bucket.accruedKopecks += row.amountKopecks;
    else if (row.type === "adjustment") bucket.adjustmentsKopecks += row.amountKopecks;
    else bucket.paidKopecks += row.amountKopecks;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildWeeklyDynamics(
  rows: PayrollLedgerRow[],
  period: PeriodFilter | null
): DynamicsBucket[] {
  const map = new Map<string, DynamicsBucket>();
  for (const row of rows) {
    if (!entryInPeriod(row.occurredAt, period)) continue;
    const start = startOfAppWeek(row.occurredAt);
    const key = appDateKey(start);
    const end = addAppDateKey(key, 6);
    const bucket = map.get(key) ?? {
      key,
      label: `${key.slice(8)}.${key.slice(5, 7)}–${end.slice(8)}.${end.slice(5, 7)}`,
      accruedKopecks: 0,
      paidKopecks: 0,
      adjustmentsKopecks: 0,
    };
    if (row.type === "accrual") bucket.accruedKopecks += row.amountKopecks;
    else if (row.type === "adjustment") bucket.adjustmentsKopecks += row.amountKopecks;
    else bucket.paidKopecks += row.amountKopecks;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function runningBalances(
  rows: { type: PayrollEntryType; amountKopecks: number }[],
  openingKopecks = 0
): number[] {
  let balance = openingKopecks;
  return rows.map((row) => {
    balance += signedLedgerDelta(row.type, row.amountKopecks);
    return balance;
  });
}
