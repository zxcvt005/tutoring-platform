import { describe, expect, it } from "vitest";

import {
  checkoutSteps,
  paymentFlowStatus,
  STUDENT_CHECKOUT_RETURN_PATH,
} from "@/lib/payment-checkout";

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
