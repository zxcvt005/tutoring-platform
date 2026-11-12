import { describe, expect, it } from "vitest";

import {
  checkoutBannerPayment,
  checkoutBannerStatus,
  checkoutSteps,
  paymentFlowStatus,
  STUDENT_CHECKOUT_RETURN_PATH,
} from "@/lib/payment-checkout";
import type { PaymentRecord, StudentTariffAssignment } from "@/lib/types";

function payment(
  overrides: Partial<PaymentRecord> & Pick<PaymentRecord, "id" | "status">
): PaymentRecord {
  return {
    studentId: "s1",
    assignmentId: "a1",
    amount: 16000,
    currency: "RUB",
    provider: "tochka_link",
    createdAt: "2026-01-10T10:00:00.000Z",
    ...overrides,
  };
}

function assignment(
  overrides: Partial<StudentTariffAssignment> &
    Pick<StudentTariffAssignment, "id" | "status" | "paymentStatus">
): StudentTariffAssignment {
  return {
    studentId: "s1",
    tariffId: "t1",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-01-29T00:00:00.000Z",
    priceSnapshot: 16000,
    currency: "RUB",
    tariffName: "Ты не один. ЕГЭ",
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
    expect(checkoutSteps("rejected", true)[1]).toBe("failed");
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

describe("checkoutBannerStatus ignores stale history", () => {
  it("shows pending only for an actual pending request", () => {
    const payments = [
      payment({ id: "p-old", status: "rejected", createdAt: "2026-01-01T00:00:00.000Z" }),
      payment({
        id: "p-pending",
        status: "pending",
        assignmentId: "a-open",
        createdAt: "2026-01-12T00:00:00.000Z",
      }),
    ];
    const assignments = [
      assignment({ id: "a-old", status: "cancelled", paymentStatus: "unpaid" }),
      assignment({
        id: "a-open",
        status: "pending_payment",
        paymentStatus: "unpaid",
        startsAt: "2026-01-12T00:00:00.000Z",
      }),
    ];
    expect(checkoutBannerStatus(payments, assignments, "s1")).toBe("pending");
    expect(checkoutBannerPayment(payments, assignments, "s1")?.id).toBe(
      "p-pending"
    );
  });

  it("does not show paid banner for an old active tariff while renewing", () => {
    const payments = [
      payment({
        id: "p-paid",
        status: "paid",
        assignmentId: "a-active",
        createdAt: "2025-12-01T00:00:00.000Z",
      }),
    ];
    const assignments = [
      assignment({
        id: "a-active",
        status: "active",
        paymentStatus: "paid",
        startsAt: "2025-12-01T00:00:00.000Z",
      }),
    ];
    expect(checkoutBannerStatus(payments, assignments, "s1")).toBe("none");
    expect(checkoutBannerPayment(payments, assignments, "s1")).toBeNull();
  });

  it("shows rejected only for the latest failed attempt", () => {
    const payments = [
      payment({
        id: "p-rejected",
        status: "rejected",
        assignmentId: "a-cancelled",
        failureReason: "Отклонено администратором",
      }),
    ];
    const assignments = [
      assignment({
        id: "a-cancelled",
        status: "cancelled",
        paymentStatus: "unpaid",
      }),
    ];
    expect(checkoutBannerStatus(payments, assignments, "s1")).toBe("rejected");
  });

  it("shows paid when a queued package was just confirmed", () => {
    const payments = [
      payment({
        id: "p-current",
        status: "paid",
        assignmentId: "a-current",
        createdAt: "2025-12-01T00:00:00.000Z",
      }),
      payment({
        id: "p-queued",
        status: "paid",
        assignmentId: "a-queued",
        createdAt: "2026-01-10T00:00:00.000Z",
      }),
    ];
    const assignments = [
      assignment({
        id: "a-current",
        status: "active",
        paymentStatus: "paid",
        startsAt: "2025-12-01T00:00:00.000Z",
      }),
      assignment({
        id: "a-queued",
        status: "queued",
        paymentStatus: "paid",
        startsAt: "2026-02-01T00:00:00.000Z",
      }),
    ];
    expect(checkoutBannerStatus(payments, assignments, "s1")).toBe("paid");
  });
});
