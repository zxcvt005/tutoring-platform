import { and, asc, eq } from "drizzle-orm";

import { parseAppInstant, startOfAppMonth } from "@/lib/app-time";
import { averageKopecks } from "@/lib/money-kopecks";
import {
  buildMonthlyDynamics,
  buildWeeklyDynamics,
  runningBalances,
  type PayrollLedgerRow,
} from "@/lib/teacher-payroll-analytics";
import {
  ratesAreComplete,
  signedLedgerDelta,
  teacherDebtFromTotals,
  type PayrollEntryType,
  type SlotPayRates,
} from "@/lib/teacher-payroll";
import { SLOT_PAY_PRESENT_COUNTS, type SlotPayPresentCount } from "@/lib/teacher-slot";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  teacherPayRates,
  teacherPayrollEntries,
  teacherPayrollSlots,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { notFound, validationError } from "@/server/errors";

export type PayrollPeriodInput = {
  from?: string;
  to?: string;
};

function resolvePeriod(input: PayrollPeriodInput, now = new Date()) {
  const from = input.from
    ? parseAppInstant(input.from)
    : startOfAppMonth(now);
  const to = input.to ? parseAppInstant(input.to, true) : now;
  if (!(to.getTime() >= from.getTime())) {
    throw validationError("Конец периода должен быть не раньше начала");
  }
  return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
}

type EntryAgg = {
  teacherId: string;
  accruedAll: number;
  adjustmentsAll: number;
  paidAll: number;
  accruedPeriod: number;
  adjustmentsPeriod: number;
  paidPeriod: number;
  slotsPeriod: number;
  presentPeriod: number;
};

function emptyAgg(teacherId: string): EntryAgg {
  return {
    teacherId,
    accruedAll: 0,
    adjustmentsAll: 0,
    paidAll: 0,
    accruedPeriod: 0,
    adjustmentsPeriod: 0,
    paidPeriod: 0,
    slotsPeriod: 0,
    presentPeriod: 0,
  };
}

function addEntry(
  agg: EntryAgg,
  row: {
    entryType: string;
    amountKopecks: number;
    presentCount: number | null;
    occurredAt: Date;
  },
  period: { from: Date; to: Date }
) {
  const inPeriod =
    row.occurredAt.getTime() >= period.from.getTime() &&
    row.occurredAt.getTime() <= period.to.getTime();
  if (row.entryType === "accrual") {
    agg.accruedAll += row.amountKopecks;
    if (inPeriod) {
      agg.accruedPeriod += row.amountKopecks;
      agg.slotsPeriod += 1;
      agg.presentPeriod += row.presentCount ?? 0;
    }
  } else if (row.entryType === "adjustment") {
    agg.adjustmentsAll += row.amountKopecks;
    if (inPeriod) agg.adjustmentsPeriod += row.amountKopecks;
  } else if (row.entryType === "payout") {
    agg.paidAll += row.amountKopecks;
    if (inPeriod) agg.paidPeriod += row.amountKopecks;
  }
}

export type TeacherPayrollListRow = {
  teacherId: string;
  fullName: string;
  status: string;
  ratesComplete: boolean;
  accruedAllKopecks: number;
  paidAllKopecks: number;
  debtKopecks: number;
  accruedPeriodKopecks: number;
  paidPeriodKopecks: number;
  adjustmentsPeriodKopecks: number;
};

export type PayrollOverview = {
  period: { from: string; to: string };
  school: {
    accruedPeriodKopecks: number;
    adjustmentsPeriodKopecks: number;
    paidPeriodKopecks: number;
    debtKopecks: number;
    completedSlotsPeriod: number;
    presentPeriod: number;
    averageAccrualPerSlotKopecks: number | null;
    teacherDebtSumKopecks: number;
  };
  weekly: ReturnType<typeof buildWeeklyDynamics>;
  monthly: ReturnType<typeof buildMonthlyDynamics>;
  teachers: TeacherPayrollListRow[];
};

export async function getPayrollOverview(
  db: AppDb,
  ctx: AuthContext,
  input: PayrollPeriodInput & { query?: string; sort?: "debt_desc" | "debt_asc" | "name" }
): Promise<PayrollOverview> {
  requireRoles(ctx, ["director"]);
  const period = resolvePeriod(input);
  const teacherRows = await db
    .select({
      id: teachers.id,
      fullName: teachers.fullName,
      status: teachers.status,
    })
    .from(teachers)
    .where(eq(teachers.organizationId, ctx.organizationId));

  const [entryRows, rateRows] = await Promise.all([
    db
      .select({
        teacherId: teacherPayrollEntries.teacherId,
        entryType: teacherPayrollEntries.entryType,
        amountKopecks: teacherPayrollEntries.amountKopecks,
        presentCount: teacherPayrollEntries.presentCount,
        occurredAt: teacherPayrollEntries.occurredAt,
        createdAt: teacherPayrollEntries.createdAt,
      })
      .from(teacherPayrollEntries)
      .where(eq(teacherPayrollEntries.organizationId, ctx.organizationId)),
    db
      .select({
        teacherId: teacherPayRates.teacherId,
        presentCount: teacherPayRates.presentCount,
      })
      .from(teacherPayRates)
      .innerJoin(teachers, eq(teachers.id, teacherPayRates.teacherId))
      .where(eq(teachers.organizationId, ctx.organizationId)),
  ]);

  const ratesByTeacher = new Map<string, Set<number>>();
  for (const row of rateRows) {
    const set = ratesByTeacher.get(row.teacherId) ?? new Set<number>();
    set.add(row.presentCount);
    ratesByTeacher.set(row.teacherId, set);
  }

  const aggs = new Map<string, EntryAgg>();
  for (const teacher of teacherRows) {
    aggs.set(teacher.id, emptyAgg(teacher.id));
  }
  const ledger: PayrollLedgerRow[] = [];
  for (const row of entryRows) {
    const agg = aggs.get(row.teacherId) ?? emptyAgg(row.teacherId);
    addEntry(agg, row, period);
    aggs.set(row.teacherId, agg);
    ledger.push({
      teacherId: row.teacherId,
      type: row.entryType as PayrollEntryType,
      amountKopecks: row.amountKopecks,
      presentCount: row.presentCount,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    });
  }

  const q = input.query?.trim().toLowerCase() ?? "";
  const list: TeacherPayrollListRow[] = teacherRows.map((teacher) => {
    const agg = aggs.get(teacher.id)!;
    const rateSet = ratesByTeacher.get(teacher.id);
    return {
      teacherId: teacher.id,
      fullName: teacher.fullName,
      status: teacher.status,
      ratesComplete: SLOT_PAY_PRESENT_COUNTS.every((c) => rateSet?.has(c)),
      accruedAllKopecks: agg.accruedAll,
      paidAllKopecks: agg.paidAll,
      debtKopecks: teacherDebtFromTotals({
        accruedKopecks: agg.accruedAll,
        adjustmentsKopecks: agg.adjustmentsAll,
        paidKopecks: agg.paidAll,
      }),
      accruedPeriodKopecks: agg.accruedPeriod,
      paidPeriodKopecks: agg.paidPeriod,
      adjustmentsPeriodKopecks: agg.adjustmentsPeriod,
    };
  });

  const filtered = q
    ? list.filter((t) => t.fullName.toLowerCase().includes(q))
    : list;
  const sort = input.sort ?? "debt_desc";
  filtered.sort((a, b) => {
    if (sort === "name") return a.fullName.localeCompare(b.fullName, "ru");
    if (sort === "debt_asc") return a.debtKopecks - b.debtKopecks;
    return b.debtKopecks - a.debtKopecks;
  });

  const schoolAccrued = list.reduce((s, t) => s + t.accruedPeriodKopecks, 0);
  const schoolAdj = list.reduce((s, t) => s + t.adjustmentsPeriodKopecks, 0);
  const schoolPaid = list.reduce((s, t) => s + t.paidPeriodKopecks, 0);
  const schoolDebt = list.reduce((s, t) => s + t.debtKopecks, 0);
  const slots = [...aggs.values()].reduce((s, a) => s + a.slotsPeriod, 0);
  const present = [...aggs.values()].reduce((s, a) => s + a.presentPeriod, 0);

  return {
    period: { from: period.fromIso, to: period.toIso },
    school: {
      accruedPeriodKopecks: schoolAccrued,
      adjustmentsPeriodKopecks: schoolAdj,
      paidPeriodKopecks: schoolPaid,
      debtKopecks: schoolDebt,
      completedSlotsPeriod: slots,
      presentPeriod: present,
      averageAccrualPerSlotKopecks: averageKopecks(schoolAccrued, slots),
      teacherDebtSumKopecks: schoolDebt,
    },
    weekly: buildWeeklyDynamics(ledger, {
      from: period.fromIso,
      to: period.toIso,
    }),
    monthly: buildMonthlyDynamics(ledger, {
      from: period.fromIso,
      to: period.toIso,
    }),
    teachers: filtered,
  };
}

export type PayrollHistoryItem = {
  id: string;
  type: PayrollEntryType;
  amountKopecks: number;
  signedKopecks: number;
  balanceAfterKopecks: number;
  presentCount: number | null;
  appliedRateKopecks: number | null;
  explanation: string;
  comment: string | null;
  slotDate: string | null;
  slotStartTime: string | null;
  slotStartsAt: string | null;
  canonicalLessonId: string | null;
  occurredAt: string;
  createdAt: string;
  actorUserId: string | null;
};

export async function getTeacherPayrollDetail(
  db: AppDb,
  ctx: AuthContext,
  input: {
    teacherId: string;
    from?: string;
    to?: string;
    offset?: number;
    limit?: number;
  }
) {
  requireRoles(ctx, ["director"]);
  const period = resolvePeriod({ from: input.from, to: input.to });
  const [teacher] = await db
    .select({
      id: teachers.id,
      fullName: teachers.fullName,
      status: teachers.status,
    })
    .from(teachers)
    .where(
      and(
        eq(teachers.id, input.teacherId),
        eq(teachers.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!teacher) throw notFound("Преподаватель не найден");

  const [entries, rateRows, blockedSlots] = await Promise.all([
    db
      .select()
      .from(teacherPayrollEntries)
      .where(
        and(
          eq(teacherPayrollEntries.organizationId, ctx.organizationId),
          eq(teacherPayrollEntries.teacherId, input.teacherId)
        )
      )
      .orderBy(
        asc(teacherPayrollEntries.occurredAt),
        asc(teacherPayrollEntries.createdAt),
        asc(teacherPayrollEntries.id)
      ),
    db
      .select()
      .from(teacherPayRates)
      .where(eq(teacherPayRates.teacherId, input.teacherId)),
    db
      .select({
        blockedReason: teacherPayrollSlots.blockedReason,
        presentCount: teacherPayrollSlots.presentCount,
        slotDate: teacherPayrollSlots.slotDate,
        slotStartTime: teacherPayrollSlots.slotStartTime,
      })
      .from(teacherPayrollSlots)
      .where(
        and(
          eq(teacherPayrollSlots.teacherId, input.teacherId),
          eq(teacherPayrollSlots.organizationId, ctx.organizationId)
        )
      ),
  ]);

  const rates: SlotPayRates = {};
  for (const row of rateRows) {
    if (row.presentCount >= 1 && row.presentCount <= 5) {
      rates[row.presentCount as SlotPayPresentCount] = row.amountKopecks;
    }
  }

  const agg = emptyAgg(teacher.id);
  for (const row of entries) {
    addEntry(agg, row, period);
  }

  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const opening = entries
    .slice(0, offset)
    .reduce((sum, row) => sum + signedLedgerDelta(row.entryType as PayrollEntryType, row.amountKopecks), 0);
  const pageRows = entries.slice(offset, offset + limit);
  const balances = runningBalances(
    pageRows.map((row) => ({
      type: row.entryType as PayrollEntryType,
      amountKopecks: row.amountKopecks,
    })),
    opening
  );
  const history: PayrollHistoryItem[] = pageRows.map((row, i) => ({
    id: row.id,
    type: row.entryType as PayrollEntryType,
    amountKopecks: row.amountKopecks,
    signedKopecks: signedLedgerDelta(row.entryType as PayrollEntryType, row.amountKopecks),
    balanceAfterKopecks: balances[i]!,
    presentCount: row.presentCount,
    appliedRateKopecks: row.appliedRateKopecks,
    explanation: row.explanation,
    comment: row.comment,
    slotDate: row.slotDate,
    slotStartTime: row.slotStartTime,
    slotStartsAt: row.slotStartsAt?.toISOString() ?? null,
    canonicalLessonId: row.canonicalLessonId,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
  }));

  const ledger: PayrollLedgerRow[] = entries.map((row) => ({
    teacherId: row.teacherId,
    type: row.entryType as PayrollEntryType,
    amountKopecks: row.amountKopecks,
    presentCount: row.presentCount,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));

  const blocked = blockedSlots.filter((s) => s.blockedReason);

  return {
    teacher: {
      id: teacher.id,
      fullName: teacher.fullName,
      status: teacher.status,
      rates,
      ratesComplete: ratesAreComplete(rates),
    },
    period: { from: period.fromIso, to: period.toIso },
    totals: {
      accruedAllKopecks: agg.accruedAll,
      paidAllKopecks: agg.paidAll,
      debtKopecks: teacherDebtFromTotals({
        accruedKopecks: agg.accruedAll,
        adjustmentsKopecks: agg.adjustmentsAll,
        paidKopecks: agg.paidAll,
      }),
      accruedPeriodKopecks: agg.accruedPeriod,
      paidPeriodKopecks: agg.paidPeriod,
      adjustmentsPeriodKopecks: agg.adjustmentsPeriod,
      completedSlotsPeriod: agg.slotsPeriod,
      presentPeriod: agg.presentPeriod,
      averagePresentPerSlot:
        agg.slotsPeriod > 0
          ? Number((agg.presentPeriod / agg.slotsPeriod).toFixed(2))
          : null,
      averageAccrualPerSlotKopecks: averageKopecks(
        agg.accruedPeriod,
        agg.slotsPeriod
      ),
    },
    weekly: buildWeeklyDynamics(ledger, {
      from: period.fromIso,
      to: period.toIso,
    }),
    monthly: buildMonthlyDynamics(ledger, {
      from: period.fromIso,
      to: period.toIso,
    }),
    blockedSlots: blocked.map((s) => ({
      reason: s.blockedReason,
      presentCount: s.presentCount,
      slotDate: s.slotDate,
      slotStartTime: s.slotStartTime,
    })),
    history,
    historyTotal: entries.length,
    historyOffset: offset,
    historyLimit: limit,
  };
}

