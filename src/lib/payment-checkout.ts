import type {
  LessonOrder,
  LessonOrderStatus,
  PaymentRecord,
  PaymentRecordStatus,
} from "@/lib/types";

export const STUDENT_PAY_PATH = "/auditoria/pay";
export const STUDENT_CHECKOUT_PATH = "/auditoria/pay/checkout";
export const STUDENT_CHECKOUT_RETURN_PATH = "/auditoria/pay/complete";

export const CHECKOUT_PAYMENT_SESSION_KEY = "auditoria:lastCheckoutPaymentId";

export const RETURN_NOT_PAID_HINT =
  "Возврат со страницы банка не означает успешную оплату. Статус обновится после проверки в системе.";

export const CHANGE_TARIFF_HINT =
  "Нужна помощь с выбором пакета? Напишите куратору — подберём тариф и вариант занятий.";

export type PaymentFlowStatus =
  | "none"
  | "pending"
  | "paid"
  | "rejected"
  | "failed"
  | "cancelled"
  | "refunded"
  | "expired";

export type CheckoutStepState = "todo" | "current" | "done" | "failed";

const LESSON_ORDER_STATUS_RU: Record<LessonOrderStatus, string> = {
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  cancelled: "Отменён",
  expired: "Истёк",
  refunded: "Возврат",
  disputed: "Спор",
};

const PAYMENT_STATUS_RU: Record<PaymentRecordStatus, string> = {
  pending: "Ожидает подтверждения",
  paid: "Оплачен",
  failed: "Ошибка",
  cancelled: "Отменён",
  expired: "Истёк",
  refunded: "Возврат",
};

export function lessonOrderStatusLabel(
  status: LessonOrderStatus | string | null | undefined
): string {
  if (!status) return "—";
  return (
    LESSON_ORDER_STATUS_RU[status as LessonOrderStatus] ?? String(status)
  );
}

export function paymentRecordStatusLabel(
  status: PaymentRecordStatus | string | null | undefined
): string {
  if (!status) return "—";
  return PAYMENT_STATUS_RU[status as PaymentRecordStatus] ?? String(status);
}

export function paymentFlowStatus(
  status: string | null | undefined
): PaymentFlowStatus {
  if (
    status === "pending" ||
    status === "paid" ||
    status === "rejected" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "expired"
  ) {
    return status;
  }
  return "none";
}

export function paymentFlowFromRecord(
  payment: PaymentRecord | null | undefined,
  order?: LessonOrder | null
): PaymentFlowStatus {
  if (!payment) return order?.status === "awaiting_payment" ? "pending" : "none";
  if (payment.status === "paid") return "paid";
  if (payment.status === "refunded") return "refunded";
  if (payment.status === "failed") return "failed";
  if (payment.status === "cancelled" || payment.status === "expired") {
    return "cancelled";
  }
  if (payment.status === "pending") return "pending";
  return "none";
}

/** Этап «Оплата» не считается завершённым, пока платёж не подтверждён. */
export function checkoutSteps(
  status: PaymentFlowStatus,
  hasSelection: boolean
): [CheckoutStepState, CheckoutStepState, CheckoutStepState] {
  if (status === "paid") return ["done", "done", "done"];
  if (
    status === "rejected" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "expired"
  ) {
    return ["done", "failed", "todo"];
  }
  if (status === "pending") return ["done", "current", "todo"];
  if (!hasSelection) return ["current", "todo", "todo"];
  return ["done", "current", "todo"];
}

export function latestPendingPayment(
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

export function latestStudentPayment(
  payments: PaymentRecord[],
  studentId: string
): PaymentRecord | null {
  return (
    [...payments]
      .filter((p) => p.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null
  );
}

export function orderForPayment(
  orders: LessonOrder[],
  payment: PaymentRecord | null | undefined
): LessonOrder | null {
  if (!payment) return null;
  return orders.find((o) => o.id === payment.orderId) ?? null;
}

export function studentOrderHistory(
  orders: LessonOrder[],
  studentId: string
): LessonOrder[] {
  return [...orders]
    .filter((o) => o.studentId === studentId)
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
    );
}

export function checkoutBannerStatus(
  payments: PaymentRecord[],
  _orders: LessonOrder[],
  studentId: string
): PaymentFlowStatus {
  const pending = latestPendingPayment(payments, studentId);
  if (pending) return "pending";

  const latestPaid = [...payments]
    .filter((p) => p.studentId === studentId && p.status === "paid")
    .sort(
      (a, b) =>
        new Date(b.paidAt ?? b.createdAt).getTime() -
        new Date(a.paidAt ?? a.createdAt).getTime()
    )[0];
  if (latestPaid) {
    const order = orderForPayment(_orders, latestPaid);
    if (order?.status === "paid" && latestPaid.paidAt) {
      const paidAt = new Date(latestPaid.paidAt).getTime();
      if (Date.now() - paidAt < 1000 * 60 * 60 * 24 * 3) return "paid";
    }
  }

  const latest = latestStudentPayment(payments, studentId);
  if (
    latest &&
    (latest.status === "failed" ||
      latest.status === "cancelled" ||
      latest.status === "expired")
  ) {
    return paymentFlowFromRecord(latest);
  }

  return "none";
}

export function checkoutBannerPayment(
  payments: PaymentRecord[],
  orders: LessonOrder[],
  studentId: string
): PaymentRecord | null {
  const status = checkoutBannerStatus(payments, orders, studentId);
  if (status === "none") return null;
  if (status === "pending") return latestPendingPayment(payments, studentId);
  return latestStudentPayment(payments, studentId);
}

export function resolveCheckoutUrl(
  checkoutUrl: string | null | undefined
): string | null {
  const trimmed = checkoutUrl?.trim();
  return trimmed || null;
}

export function unitPriceLabel(totalPrice: number, lessonsCount: number): string {
  if (!lessonsCount) return "—";
  const unit = Math.round((totalPrice / lessonsCount) * 100) / 100;
  return `${unit.toLocaleString("ru-RU")} ₽ / зан.`;
}