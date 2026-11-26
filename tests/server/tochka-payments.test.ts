import { describe, expect, it, vi } from "vitest";

import {
  TOCHKA_CUSTOMER_CODE_LEN,
  TOCHKA_MERCHANT_ID_LEN,
  TOCHKA_PAYMENT_LINK_ID_MAX_LEN,
  TOCHKA_PURPOSE_MAX_LEN,
  TOCHKA_SBP_PAYMENT_MODE,
  createPaymentOperation,
  formatTochkaApiError,
  truncateTochkaPaymentLinkId,
  truncateTochkaPurpose,
  type TochkaConfig,
} from "@/server/payments/tochka";

const cfg: TochkaConfig = {
  apiBase: "https://example.test/uapi",
  jwt: "test-jwt",
  customerCode: "123456789",
  merchantId: "123456789012345",
  redirectUrl: "https://app.test/ok",
  failRedirectUrl: "https://app.test/fail",
  ttlMinutes: 60,
};

describe("tochka OpenAPI limits", () => {
  it("exports SBP as the only payment mode", () => {
    expect([...TOCHKA_SBP_PAYMENT_MODE]).toEqual(["sbp"]);
  });

  it("truncates purpose to 140 chars", () => {
    const long = "а".repeat(TOCHKA_PURPOSE_MAX_LEN + 20);
    const out = truncateTochkaPurpose(long);
    expect(out.length).toBe(TOCHKA_PURPOSE_MAX_LEN);
    expect(out.endsWith("…")).toBe(true);
  });

  it("truncates paymentLinkId to 45 chars", () => {
    const long = `lord_${"a".repeat(80)}`;
    expect(truncateTochkaPaymentLinkId(long).length).toBe(
      TOCHKA_PAYMENT_LINK_ID_MAX_LEN
    );
  });

  it("formats Errors[] from Tochka error body", () => {
    const msg = formatTochkaApiError(400, {
      code: "400",
      message: "Validation Failed",
      Errors: [
        {
          errorCode: "invalid_param",
          message: "Field merchantId is invalid",
          url: "https://developers.tochka.com/",
        },
      ],
    });
    expect(msg).toContain("HTTP 400");
    expect(msg).toContain("Validation Failed");
    expect(msg).toContain("invalid_param");
    expect(msg).toContain("Field merchantId is invalid");
  });
});

describe("tochka createPaymentOperation", () => {
  it("sends OpenAPI-compliant payload and never includes card", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          Data: {
            operationId: "op_1",
            paymentLink: "https://pay.example/sbp",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const result = await createPaymentOperation(
      cfg,
      {
        amount: 1500,
        purpose: "Оплата: тест, 1 занятие",
        paymentLinkId: `lord_${"x".repeat(80)}`,
      },
      fetchFn as unknown as typeof fetch
    );

    expect(result.operationId).toBe("op_1");
    expect(result.paymentLink).toContain("http");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/uapi/acquiring/v1.0/payments");
    const body = JSON.parse(String(init?.body));
    expect(body.Data.paymentMode).toEqual(["sbp"]);
    expect(body.Data.paymentMode).not.toContain("card");
    expect(body.Data.paymentMode).not.toContain("tinkoff");
    expect(body.Data.amount).toBe(1500);
    expect(body.Data.customerCode).toHaveLength(TOCHKA_CUSTOMER_CODE_LEN);
    expect(body.Data.merchantId).toHaveLength(TOCHKA_MERCHANT_ID_LEN);
    expect(body.Data.paymentLinkId.length).toBeLessThanOrEqual(
      TOCHKA_PAYMENT_LINK_ID_MAX_LEN
    );
    expect(body.Data.purpose.length).toBeLessThanOrEqual(TOCHKA_PURPOSE_MAX_LEN);
  });

  it("rejects invalid customerCode length before HTTP", async () => {
    const fetchFn = vi.fn();
    await expect(
      createPaymentOperation(
        { ...cfg, customerCode: "short" },
        {
          amount: 100,
          purpose: "test",
          paymentLinkId: "link1",
        },
        fetchFn as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      message: expect.stringMatching(/TOCHKA_CUSTOMER_CODE/),
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("surfaces Tochka Errors[] on HTTP failure", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: "Validation Failed",
          Errors: [
            {
              errorCode: "bad_request",
              message: "paymentMode is not available for merchant",
              url: "https://developers.tochka.com/",
            },
          ],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    });

    await expect(
      createPaymentOperation(
        cfg,
        {
          amount: 100,
          purpose: "test",
          paymentLinkId: "link1",
        },
        fetchFn as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /Точка Банк: HTTP 400 Validation Failed — bad_request: paymentMode is not available/
      ),
    });
  });

  it("rejects non-URL paymentLink from bank", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          Data: {
            operationId: "op_1",
            paymentLink: "not-a-url",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    await expect(
      createPaymentOperation(
        cfg,
        {
          amount: 100,
          purpose: "test",
          paymentLinkId: "link1",
        },
        fetchFn as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      message: expect.stringMatching(/некорректная платёжная ссылка/i),
    });
  });
});
