import {
  latestPaymentForAssignment,
  pendingReviewPaymentForStudent,
  queuedAssignmentForStudent,
} from "@/lib/tariff-history";
import type { PaymentRecord, StudentTariffAssignment } from "@/lib/types";

/** Внешняя страница оплаты. Сайт не получает от неё подтверждение. */
export const TOCHKA_CHECKOUT_URL =
  "https://tochkaplace.com/ia/36fd4eea-e4d2-41a3-8e7c-ebc749c5a87e/order";

export const STUDENT_PAY_PATH = "/auditoria/pay";
export const STUDENT_CHECKOUT_PATH = "/auditoria/pay/checkout";
export const STUDENT_CHECKOUT_RETURN_PATH = "/auditoria/pay/complete";

export const MANUAL_REVIEW_WARNING =
  "Платёж проверяет администрация вручную. Переход к оплате ещё не означает, что деньги поступили.";

export const CHANGE_TARIFF_HINT =
  "Хотите сменить тариф? Обратитесь к куратору. Он обсудит с вами подходящий вариант и согласует изменение с администрацией школы.";

export type PaymentFlowStatus =
  | "none"
  | "pending"
  | "paid"
  | "rejected"
  | "failed"
  | "cancelled";

export type CheckoutStepState = "todo" | "current" | "done" | "failed";

/** Этап «Оплата» не считается завершённым, пока платёж не подтверждён. */
export function checkoutSteps(
  status: PaymentFlowStatus,
  hasTariff: boolean
): [CheckoutStepState, CheckoutStepState, CheckoutStepState] {
  if (status === "paid") return ["done", "done", "done"];
  if (status === "rejected" || status === "failed" || status === "cancelled") {
    return ["done", "failed", "todo"];
  }
  if (status === "pending") return ["done", "current", "todo"];
  if (!hasTariff) return ["current", "todo", "todo"];
  return ["done", "current", "todo"];
}

export function paymentFlowStatus(
  status: string | null | undefined
): PaymentFlowStatus {
  if (
    status === "pending" ||
    status === "paid" ||
    status === "rejected" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "none";
}

/**
 * Статус баннера на экране checkout: только актуальная заявка.
 * Старые paid/rejected из истории не создают ложных уведомлений при продлении.
 */
export function checkoutBannerStatus(
  payments: PaymentRecord[],
  assignments: StudentTariffAssignment[],
  studentId: string
): PaymentFlowStatus {
  const pending = pendingReviewPaymentForStudent(payments, studentId);
  if (pending) return "pending";

  const queued = queuedAssignmentForStudent(assignments, studentId);
  if (queued) {
    const queuedPay = latestPaymentForAssignment(payments, queued.id);
    if (queuedPay?.status === "paid") return "paid";
  }

  const openAssignment = latestOpenCheckoutAssignment(assignments, studentId);
  if (openAssignment) {
    const openPay = latestPaymentForAssignment(payments, openAssignment.id);
    return paymentFlowStatus(openPay?.status);
  }

  const latest = latestStudentPayment(payments, studentId);
  if (!latest) return "none";

  if (
    latest.status === "rejected" ||
    latest.status === "failed" ||
    latest.status === "cancelled"
  ) {
    const linked = assignments.find(
      (assignment) => assignment.id === latest.assignmentId
    );
    if (
      linked &&
      (linked.status === "cancelled" || linked.status === "pending_payment")
    ) {
      return paymentFlowStatus(latest.status);
    }
  }

  return "none";
}

/** Платёж, к которому относится баннер checkout (для деталей/имени тарифа). */
export function checkoutBannerPayment(
  payments: PaymentRecord[],
  assignments: StudentTariffAssignment[],
  studentId: string
): PaymentRecord | null {
  const status = checkoutBannerStatus(payments, assignments, studentId);
  if (status === "none") return null;

  if (status === "pending") {
    return pendingReviewPaymentForStudent(payments, studentId);
  }

  if (status === "paid") {
    const queued = queuedAssignmentForStudent(assignments, studentId);
    if (queued) return latestPaymentForAssignment(payments, queued.id);
  }

  const openAssignment = latestOpenCheckoutAssignment(assignments, studentId);
  if (openAssignment) {
    return latestPaymentForAssignment(payments, openAssignment.id);
  }

  return latestStudentPayment(payments, studentId);
}

function latestOpenCheckoutAssignment(
  assignments: StudentTariffAssignment[],
  studentId: string
): StudentTariffAssignment | null {
  return (
    [...assignments]
      .filter(
        (assignment) =>
          assignment.studentId === studentId &&
          assignment.status === "pending_payment"
      )
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )[0] ?? null
  );
}

function latestStudentPayment(
  payments: PaymentRecord[],
  studentId: string
): PaymentRecord | null {
  return (
    [...payments]
      .filter((payment) => payment.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null
  );
}
