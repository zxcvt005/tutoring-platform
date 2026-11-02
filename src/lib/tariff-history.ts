import { appDateKey } from "@/lib/app-time";
import { assignmentTariffAlert } from "@/lib/tariff-warnings";
import type {
  PaymentRecord,
  PaymentRecordStatus,
  StudentTariffAssignment,
} from "@/lib/types";

export type TariffHistoryDisplayStatus =
  | "current"
  | "expired"
  | "review"
  | "queued"
  | "rejected";

export type TariffHistoryItem = {
  id: string;
  assignmentId: string;
  paymentId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  lessonsLimit: number | null;
  price: number;
  displayStatus: TariffHistoryDisplayStatus;
  expiring: boolean;
  remaining: number | null;
  paymentStatus: PaymentRecordStatus | null;
};

export const tariffHistoryStatusLabel: Record<
  TariffHistoryDisplayStatus,
  string
> = {
  current: "Текущий",
  expired: "Истёк",
  review: "Оплата на проверке",
  queued: "В очереди",
  rejected: "Оплата отклонена",
};

export const paymentRecordStatusLabel: Record<PaymentRecordStatus, string> = {
  paid: "Оплачен",
  pending: "Оплата на проверке",
  rejected: "Оплата отклонена",
  cancelled: "Отменён",
  failed: "Ошибка",
};

export function latestPaymentForAssignment(
  payments: PaymentRecord[],
  assignmentId: string
): PaymentRecord | null {
  return (
    [...payments]
      .filter((p) => p.assignmentId === assignmentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null
  );
}

export function pendingReviewPaymentForStudent(
  payments: PaymentRecord[],
  studentId: string
): PaymentRecord | null {
  return (
    [...payments]
      .filter((p) => p.studentId === studentId && p.status === "pending")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null
  );
}

export function queuedAssignmentForStudent(
  assignments: StudentTariffAssignment[],
  studentId: string
): StudentTariffAssignment | null {
  return (
    [...assignments]
      .filter(
        (a) =>
          a.studentId === studentId &&
          a.status === "queued" &&
          a.paymentStatus === "paid"
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      )[0] ?? null
  );
}

/** Остаток 0 или меньше — для подписи «Истёк», без смены статуса в БД. */
export function remainingLooksExhausted(
  assignment: Pick<
    StudentTariffAssignment,
    "lessonsRemaining" | "packageStatus"
  >
): boolean {
  if (assignment.lessonsRemaining != null) {
    return assignment.lessonsRemaining <= 0;
  }
  return (
    assignment.packageStatus === "debt" ||
    assignment.packageStatus === "exhausted"
  );
}

export function assignmentHistoryStatus(
  assignment: StudentTariffAssignment,
  payment: PaymentRecord | null,
  _opts?: { hasQueuedPaid?: boolean }
): TariffHistoryDisplayStatus {
  void _opts;
  if (payment?.status === "rejected") return "rejected";
  if (payment?.status === "pending" || assignment.status === "pending_payment") {
    return "review";
  }
  if (assignment.status === "queued" && assignment.paymentStatus === "paid") {
    return "queued";
  }
  if (assignment.paymentStatus === "paid") {
    if (remainingLooksExhausted(assignment)) return "expired";
    if (assignment.status === "active") return "current";
  }
  if (assignment.status === "expired" || assignment.status === "cancelled") {
    return "expired";
  }
  return "expired";
}

export function buildTariffHistoryItems(
  assignments: StudentTariffAssignment[],
  payments: PaymentRecord[],
  studentId: string
): TariffHistoryItem[] {
  const mine = assignments.filter((a) => a.studentId === studentId);
  const hasQueuedPaid = mine.some(
    (a) => a.status === "queued" && a.paymentStatus === "paid"
  );
  const items: TariffHistoryItem[] = [];
  for (const assignment of mine) {
    const payment = latestPaymentForAssignment(payments, assignment.id);
    if (payment?.status === "cancelled" && assignment.status === "cancelled") {
      continue;
    }
    const displayStatus = assignmentHistoryStatus(assignment, payment, {
      hasQueuedPaid,
    });
    const remaining = assignment.lessonsRemaining ?? null;
    const expiring =
      displayStatus === "current" &&
      remaining != null &&
      remaining > 0 &&
      remaining <= 2;
    items.push({
      id: assignment.id,
      assignmentId: assignment.id,
      paymentId: payment?.id ?? null,
      title: assignment.tariffName ?? "Тариф",
      startsAt: assignment.startsAt,
      endsAt: assignment.endsAt || null,
      lessonsLimit: assignment.lessonsLimitSnapshot ?? null,
      price: assignment.priceSnapshot,
      displayStatus,
      expiring,
      remaining,
      paymentStatus: payment?.status ?? null,
    });
  }
  return items.sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
  );
}

export function historyExpiringWarning(remaining: number | null): string | null {
  const alert = assignmentTariffAlert({
    lessonsRemaining: remaining,
    packageStatus: undefined,
  });
  if (remaining === 1 || remaining === 2) return alert.message;
  return null;
}

export type TariffTermView =
  | { state: "unknown" }
  | {
      state: "active";
      daysLeft: number;
      endsToday: boolean;
      progress: number;
      tone: "calm" | "soon";
    }
  | { state: "ended"; progress: 1; tone: "ended" };

const TARIFF_TERM_SOON_DAYS = 7;

function validInstant(iso?: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

function calendarDaySpan(fromKey: string, toKey: string): number {
  const from = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromKey);
  const to = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toKey);
  if (!from || !to) return 0;
  const start = Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]));
  const end = Date.UTC(Number(to[1]), Number(to[2]) - 1, Number(to[3]));
  return Math.round((end - start) / 86_400_000);
}

/** Срок по календарным датам приложения. Без дат полоска и число дней не выдумываются. */
export function tariffTermView(input: {
  startsAt?: string | null;
  endsAt?: string | null;
  now?: Date;
}): TariffTermView {
  const startMs = validInstant(input.startsAt);
  const endMs = validInstant(input.endsAt);
  if (startMs == null || endMs == null || endMs <= startMs) {
    return { state: "unknown" };
  }
  const now = input.now ?? new Date();
  const elapsed = now.getTime() - startMs;
  const progress = Math.min(1, Math.max(0, elapsed / (endMs - startMs)));
  const today = appDateKey(now);
  const endDay = appDateKey(new Date(endMs));
  if (today > endDay) {
    return { state: "ended", progress: 1, tone: "ended" };
  }
  const daysLeft = Math.max(0, calendarDaySpan(today, endDay));
  return {
    state: "active",
    daysLeft,
    endsToday: daysLeft === 0,
    progress,
    tone: daysLeft <= TARIFF_TERM_SOON_DAYS ? "soon" : "calm",
  };
}

export function tariffDaysLeftLabel(daysLeft: number, endsToday: boolean): string {
  if (endsToday) return "Сегодня";
  const n = Math.max(0, Math.trunc(daysLeft));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";
  return `${n} ${word}`;
}

/** Текст про доступное занятие в долг при остатке 0 не показываем. */
export function showsLastDebtAvailableCopy(remaining: number | null): boolean {
  void remaining;
  return false;
}
