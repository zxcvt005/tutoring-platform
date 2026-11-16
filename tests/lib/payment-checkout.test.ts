import { describe, expect, it } from "vitest";

import {
  checkoutBannerPayment,
  checkoutBannerStatus,
  checkoutSteps,
  lessonOrderStatusLabel,
  paymentFlowStatus,
  paymentRecordStatusLabel,
  STUDENT_CHECKOUT_RETURN_PATH,
} from "@/lib/payment-checkout";
import type { LessonOrder, PaymentRecord } from "@/lib/types";

function payment(
  overrides: Partial<PaymentRecord> & Pick<PaymentRecord, "id" | "status">
): PaymentRecord {
  return {
    studentId: "s1",
    orderId: "ord1",
    amount: 16000,
    currency: "RUB",
    provider: "tochka",
    createdAt: "2026-01-10T10:00:00.000Z",
    ...overrides,
  };
}

function order(
  overrides: Partial<LessonOrder> & Pick<LessonOrder, "id" | "status">
): LessonOrder {
  return {
    studentId: "s1",
    payerUserId: "u1",
    tariffId: "t1",
    directionId: "d1",
    tariffNameSnapshot: "Тариф",
    lessonsCount: 8,
    totalAmount: 16000,
    unitPrice: 2000,
    currency: "RUB",
    featuresSnapshot: ["individual_lessons", "homework"],
    productIdsSnapshot: [],
    ...overrides,
  };
}

describe("checkout steps follow the server payment status", () => {
  it("does not mark payment done while the request is still pending", () => {
    expect(checkoutSteps("pending", true)).toEqual(["done", "current", "todo"]);
    expect(checkoutSteps("none", true)[1]).toBe("current");
    expect(checkoutSteps("paid", true)).toEqual(["done", "done", "done"]);
  });

  it("keeps a failed payment apart from waiting for review", () => {
    expect(checkoutSteps("failed", true)[1]).toBe("failed");
    expect(checkoutSteps("cancelled", true)[1]).toBe("failed");
    expect(checkoutSteps("none", false)).toEqual(["current", "todo", "todo"]);
  });

  it("does not treat an unknown status as success", () => {
    expect(paymentFlowStatus("success")).toBe("none");
    expect(paymentFlowStatus("paid")).toBe("paid");
    expect(STUDENT_CHECKOUT_RETURN_PATH).toBe("/auditoria/pay/complete");
  });
});

describe("status labels in Russian", () => {
  it("maps order and payment statuses", () => {
    expect(lessonOrderStatusLabel("awaiting_payment")).toBe("Ожидает оплаты");
    expect(paymentRecordStatusLabel("refunded")).toBe("Возврат");
  });
});

describe("checkoutBannerStatus for lesson orders", () => {
  it("shows pending when a payment is pending", () => {
    const payments = [
      payment({ id: "p1", status: "pending", orderId: "o1" }),
    ];
    const orders = [order({ id: "o1", status: "awaiting_payment" })];
    expect(checkoutBannerStatus(payments, orders, "s1")).toBe("pending");
    expect(checkoutBannerPayment(payments, orders, "s1")?.id).toBe("p1");
  });

  it("returns none without pending or recent failures", () => {
    expect(checkoutBannerStatus([], [], "s1")).toBe("none");
    expect(checkoutBannerPayment([], [], "s1")).toBeNull();
  });
});