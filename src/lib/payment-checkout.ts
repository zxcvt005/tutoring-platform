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
