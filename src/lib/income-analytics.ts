/**
 * Аналитика раздела «Доходы»: группировка платежей и мониторинг тарифов.
 * Все календарные границы — Europe/Moscow.
 */

import {
  appDateKey,
  appZonedParts,
  fromAppWall,
  startOfAppDay,
} from "@/lib/app-time";
import type {
  PaymentRecord,
  PaymentRecordStatus,
  StudentTariffAssignment,
} from "@/lib/types";

export type IncomeMonthKey = string; // YYYY-MM

export type IncomePaymentRow = {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  tariffName: string | null;
  amount: number;
  status: PaymentRecordStatus;
  /** Дата для отображения: paidAt для paid, иначе createdAt */
  at: string;
  paidAt?: string;
  createdAt: string;
};

export type MonthSummary = {
  monthKey: IncomeMonthKey;
  label: string;
  /** Ученики с createdAt ≤ конец месяца (см. ограничения истории). */
  studentsAtMonthEnd: number;
  studentsAtMonthEndReliable: boolean;
  purchasedTariffs: number;
  /** null если покупок нет — в UI «—» */
  averagePurchaseAmount: number | null;
  /** Сумма status=paid по paidAt в месяце */
  revenue: number;
  payments: IncomePaymentRow[];
};

export type PeriodUrgency = "expired" | "today" | "soon_3" | "soon_7" | "ok";

export type CurrentTariffRow = {
  studentId: string;
  studentName: string;
  assignmentId: string;
  tariffId: string;
  tariffName: string;
  endsAt: string;
  lessonsRemaining: number | null;
  /** Календарные дни до конца (отрицательно = просрочен по дате) */
  daysLeft: number;
  urgency: PeriodUrgency;
  urgencyLabel: string;
  /** Период считается истёкшим (дата или остаток занятий) */
  isExpired: boolean;
};

export type TariffGroup = {
  tariffId: string;
  tariffName: string;
  count: number;
  students: CurrentTariffRow[];
};

export type CurrentTariffOverview = {
  activeCount: number;
  expiredCount: number;
  soonCount: number;
  attention: CurrentTariffRow[];
  byTariff: TariffGroup[];
  limitations: string[];
};

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function monthKeyFromInstant(input: string | Date): IncomeMonthKey {
  const p = appZonedParts(input);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function monthLabel(monthKey: IncomeMonthKey): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return `${MONTH_NAMES_RU[m - 1] ?? monthKey} ${y}`;
}

/** Последний момент календарного месяца (Москва). */
export function endOfAppMonth(monthKey: IncomeMonthKey): Date {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return new Date(fromAppWall(y, m + 1, 1, 0, 0, 0).getTime() - 1);
}

export function startOfAppMonthKey(monthKey: IncomeMonthKey): Date {
  const [ys, ms] = monthKey.split("-");
  return fromAppWall(Number(ys), Number(ms), 1, 0, 0, 0);
}

/** Фактическое поступление: только paid с paidAt. */
export function isRevenuePayment(p: {
  status: string;
  paidAt?: string | null;
}): boolean {
  return p.status === "paid" && Boolean(p.paidAt);
}

/**
 * Ученики на конец месяца: строки, существовавшие на момент конца месяца.
 * Ограничение: нет истории удалений и смены статусов — учитываются
 * только текущие записи с createdAt ≤ конец месяца.
 */
export function countStudentsAtMonthEnd(
  students: { createdAt: string }[],
  monthKey: IncomeMonthKey
): { count: number; reliable: boolean } {
  const end = endOfAppMonth(monthKey);
  const count = students.filter(
    (s) => new Date(s.createdAt).getTime() <= end.getTime()
  ).length;
  return {
    count,
    reliable: false, // нет истории удалений/статусов
  };
}

export function revenueEventAt(p: {
  status: string;
  paidAt?: string | null;
  createdAt: string;
}): string | null {
  if (p.status !== "paid" || !p.paidAt) return null;
  return p.paidAt;
}

/**
 * Месячные сводки по платежам.
 * Покупки и поступления — по paid-платежам с paidAt (одно событие = одна покупка).
 */
export function buildMonthSummaries(input: {
  payments: Array<{
    id: string;
    studentId: string;
    assignmentId: string;
    amount: number;
    status: PaymentRecordStatus;
    paidAt?: string | null;
    createdAt: string;
  }>;
  students: Array<{ id: string; fullName: string; createdAt: string }>;
  assignments: Array<{
    id: string;
    tariffName?: string | null;
  }>;
}): MonthSummary[] {
  const nameById = new Map(input.students.map((s) => [s.id, s.fullName]));
  const tariffByAsg = new Map(
    input.assignments.map((a) => [a.id, a.tariffName ?? null])
  );

  const byMonth = new Map<IncomeMonthKey, IncomePaymentRow[]>();

  for (const p of input.payments) {
    const displayAt =
      p.status === "paid" && p.paidAt ? p.paidAt : p.createdAt;
    const key = monthKeyFromInstant(displayAt);
    const row: IncomePaymentRow = {
      id: p.id,
      studentId: p.studentId,
      studentName: nameById.get(p.studentId) ?? p.studentId,
      assignmentId: p.assignmentId,
      tariffName: tariffByAsg.get(p.assignmentId) ?? null,
      amount: p.amount,
      status: p.status,
      at: displayAt,
      paidAt: p.paidAt ?? undefined,
      createdAt: p.createdAt,
    };
    const list = byMonth.get(key) ?? [];
    list.push(row);
    byMonth.set(key, list);
  }

  const currentKey = monthKeyFromInstant(new Date());
  if (!byMonth.has(currentKey)) {
    byMonth.set(currentKey, []);
  }

  const keys = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return keys.map((monthKey) => {
    const payments = (byMonth.get(monthKey) ?? []).sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    const revenuePayments = payments.filter((p) =>
      isRevenuePayment({ status: p.status, paidAt: p.paidAt })
    );
    const purchasedTariffs = revenuePayments.length;
    const revenue = revenuePayments.reduce((s, p) => s + p.amount, 0);
    const averagePurchaseAmount =
      purchasedTariffs === 0
        ? null
        : Math.round((revenue / purchasedTariffs) * 100) / 100;
    const { count, reliable } = countStudentsAtMonthEnd(
      input.students,
      monthKey
    );
    return {
      monthKey,
      label: monthLabel(monthKey),
      studentsAtMonthEnd: count,
      studentsAtMonthEndReliable: reliable,
      purchasedTariffs,
      averagePurchaseAmount,
      revenue,
      payments,
    };
  });
}

/** Дни от «сегодня» (Москва) до даты окончания: ceil по календарным датам. */
export function calendarDaysUntil(
  endsAt: string | Date,
  now: Date = new Date()
): number {
  const endKey = appDateKey(endsAt);
  const nowKey = appDateKey(now);
  const end = startOfAppDay(endKey);
  const start = startOfAppDay(nowKey);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function urgencyFromDays(
  daysLeft: number,
  exhausted: boolean
): { urgency: PeriodUrgency; label: string; isExpired: boolean } {
  if (exhausted || daysLeft < 0) {
    return { urgency: "expired", label: "Истёк", isExpired: true };
  }
  if (daysLeft === 0) {
    return {
      urgency: "today",
      label: "Закончится сегодня",
      isExpired: false,
    };
  }
  if (daysLeft <= 3) {
    return {
      urgency: "soon_3",
      label: `Осталось ${daysLeft} дн.`,
      isExpired: false,
    };
  }
  if (daysLeft <= 7) {
    return {
      urgency: "soon_7",
      label: `Осталось ${daysLeft} дн.`,
      isExpired: false,
    };
  }
  return {
    urgency: "ok",
    label: `Осталось ${daysLeft} дн.`,
    isExpired: false,
  };
}

/**
 * Текущее назначение: одно на ученика — active+paid с максимальным startsAt;
 * если нет — не включаем в «действующие» (история не считается текущей).
 */
export function pickCurrentPaidAssignment(
  assignments: StudentTariffAssignment[],
  studentId: string
): StudentTariffAssignment | null {
  const list = assignments
    .filter(
      (a) =>
        a.studentId === studentId &&
        a.status === "active" &&
        a.paymentStatus === "paid"
    )
    .sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );
  return list[0] ?? null;
}

export function buildCurrentTariffOverview(input: {
  students: Array<{ id: string; fullName: string }>;
  assignments: StudentTariffAssignment[];
  now?: Date;
}): CurrentTariffOverview {
  const now = input.now ?? new Date();
  const limitations: string[] = [
    "История удалений учеников отсутствует: число на конец месяца — по созданным и всё ещё существующим записям.",
    "Окончание периода: min(календарный endsAt, исчерпание занятий).",
  ];

  const rows: CurrentTariffRow[] = [];

  for (const student of input.students) {
    const asg = pickCurrentPaidAssignment(input.assignments, student.id);
    if (!asg) continue;
    if (!asg.endsAt) continue;

    const exhausted =
      asg.packageStatus === "exhausted" ||
      (asg.lessonsRemaining != null && asg.lessonsRemaining <= 0);

    const daysLeft = exhausted ? -1 : calendarDaysUntil(asg.endsAt, now);
    const { urgency, label, isExpired } = urgencyFromDays(daysLeft, exhausted);

    rows.push({
      studentId: student.id,
      studentName: student.fullName,
      assignmentId: asg.id,
      tariffId: asg.tariffId,
      tariffName: asg.tariffName ?? "Тариф",
      endsAt: asg.endsAt,
      lessonsRemaining: asg.lessonsRemaining ?? null,
      daysLeft: exhausted ? -1 : daysLeft,
      urgency,
      urgencyLabel: label,
      isExpired,
    });
  }

  const activeCount = rows.filter((r) => !r.isExpired).length;
  const expiredCount = rows.filter((r) => r.isExpired).length;
  const soonCount = rows.filter(
    (r) =>
      !r.isExpired &&
      (r.urgency === "today" ||
        r.urgency === "soon_3" ||
        r.urgency === "soon_7")
  ).length;

  const attention = rows
    .filter(
      (r) =>
        r.isExpired ||
        r.urgency === "today" ||
        r.urgency === "soon_3" ||
        r.urgency === "soon_7"
    )
    .sort((a, b) => {
      if (a.isExpired !== b.isExpired) return a.isExpired ? -1 : 1;
      return a.daysLeft - b.daysLeft;
    });

  const groupMap = new Map<string, CurrentTariffRow[]>();
  for (const r of rows) {
    const list = groupMap.get(r.tariffId) ?? [];
    list.push(r);
    groupMap.set(r.tariffId, list);
  }

  const byTariff: TariffGroup[] = [...groupMap.entries()]
    .map(([tariffId, students]) => {
      const sorted = [...students].sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? -1 : 1;
        return a.daysLeft - b.daysLeft;
      });
      return {
        tariffId,
        tariffName: sorted[0]?.tariffName ?? "Тариф",
        count: sorted.length,
        students: sorted,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tariffName.localeCompare(b.tariffName, "ru");
    });

  return {
    activeCount,
    expiredCount,
    soonCount,
    attention,
    byTariff,
    limitations,
  };
}

/** Фильтр списка платежей месяца. */
export function filterIncomePayments(
  payments: IncomePaymentRow[],
  opts: { query?: string; status?: PaymentRecordStatus | "all" }
): IncomePaymentRow[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  return payments.filter((p) => {
    if (opts.status && opts.status !== "all" && p.status !== opts.status) {
      return false;
    }
    if (!q) return true;
    return p.studentName.toLowerCase().includes(q);
  });
}

export function paymentsToAnalyticsInput(
  payments: PaymentRecord[]
): Parameters<typeof buildMonthSummaries>[0]["payments"] {
  return payments.map((p) => ({
    id: p.id,
    studentId: p.studentId,
    assignmentId: p.assignmentId,
    amount: p.amount,
    status: p.status,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }));
}
