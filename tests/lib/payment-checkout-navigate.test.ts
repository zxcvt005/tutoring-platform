import { describe, expect, it, vi } from "vitest";

import {
  assignBankCheckoutUrl,
  openBankCheckoutUrl,
} from "@/lib/payment-checkout-navigate";

describe("openBankCheckoutUrl", () => {
  it("rejects empty or non-URL values without opening anything", () => {
    const open = vi.fn();
    const assign = vi.fn();
    expect(openBankCheckoutUrl("", { open, assign })).toEqual({
      ok: false,
      method: "manual",
      url: "",
      reason: "invalid_url",
    });
    expect(openBankCheckoutUrl("/relative", { open, assign })).toEqual({
      ok: false,
      method: "manual",
      url: "",
      reason: "invalid_url",
    });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens the absolute bank URL in a new tab and never uses about:blank", () => {
    const open = vi.fn(() => ({ closed: false }) as Window);
    const url = "https://merch.securepaytb.ru/order/?uuid=abc";
    const result = openBankCheckoutUrl(url, { open, preferred: "new-tab" });
    expect(result).toEqual({ ok: true, method: "new-tab", url });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]).toBe(url);
    expect(open.mock.calls[0]?.[0]).not.toBe("about:blank");
    expect(open.mock.calls[0]?.[1]).toBe("_blank");
  });

  it("returns manual fallback when popup is blocked — without window.close", () => {
    const open = vi.fn(() => null);
    const url = "https://merch.securepaytb.ru/order/?uuid=abc";
    const result = openBankCheckoutUrl(url, { open, preferred: "new-tab" });
    expect(result).toEqual({
      ok: false,
      method: "manual",
      url,
      reason: "popup_blocked",
    });
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
  });

  it("same-tab assign navigates to the bank URL", () => {
    const assign = vi.fn();
    const url = "https://merch.securepaytb.ru/order/?uuid=abc";
    expect(assignBankCheckoutUrl(url, assign)).toEqual({
      ok: true,
      method: "same-tab",
      url,
    });
    expect(assign).toHaveBeenCalledWith(url);
  });
});

describe("checkout button navigation contract", () => {
  it("simulates async create then open without blank+close", async () => {
    const open = vi.fn(() => null);
    const closedWindows: string[] = [];
    const apiCreate = vi.fn(async () => ({
      checkoutUrl: "https://merch.securepaytb.ru/order/?uuid=e2e",
      paymentId: "pay_1",
    }));

    // Emulate goToSchoolPayment without about:blank prelude.
    const res = await apiCreate();
    const opened = openBankCheckoutUrl(res.checkoutUrl, {
      open,
      preferred: "new-tab",
    });

    expect(apiCreate).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]).toBe(res.checkoutUrl);
    expect(opened.ok === false && opened.reason === "popup_blocked").toBe(true);
    expect(closedWindows).toEqual([]);
  });

  it("does not navigate when API returns empty checkoutUrl", async () => {
    const open = vi.fn();
    const assign = vi.fn();
    const res = { checkoutUrl: "" };
    const opened = openBankCheckoutUrl(res.checkoutUrl, { open, assign });
    expect(opened.reason).toBe("invalid_url");
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("guards against double submit via inflight flag", async () => {
    let inflight = false;
    let calls = 0;
    async function go() {
      if (inflight) return;
      inflight = true;
      calls += 1;
      await Promise.resolve();
      inflight = false;
    }
    await Promise.all([go(), go(), go()]);
    expect(calls).toBe(1);
  });
});
