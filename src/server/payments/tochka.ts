import { serviceUnavailable, validationError } from "@/server/errors";

const DEFAULT_API_BASE = "https://enter.tochka.com/uapi";
const SANDBOX_API_BASE = "https://enter.tochka.com/sandbox/v2";
const DEFAULT_TIMEOUT_MS = 25_000;

export type TochkaConfig = {
  apiBase: string;
  jwt: string;
  customerCode: string;
  merchantId: string;
  redirectUrl: string;
  failRedirectUrl: string;
  ttlMinutes: number;
};

export function readTochkaConfig(): TochkaConfig | null {
  const jwt = process.env.TOCHKA_JWT?.trim();
  const customerCode = process.env.TOCHKA_CUSTOMER_CODE?.trim();
  const merchantId = process.env.TOCHKA_MERCHANT_ID?.trim();
  if (!jwt || !customerCode || !merchantId) return null;

  const sandbox = process.env.TOCHKA_SANDBOX === "1";
  const apiBase =
    process.env.TOCHKA_API_BASE?.trim() ||
    (sandbox ? SANDBOX_API_BASE : DEFAULT_API_BASE);
  const appBase =
    process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000";
  const redirectPath =
    process.env.TOCHKA_REDIRECT_PATH?.trim() || "/auditoria/pay/complete";
  const failPath =
    process.env.TOCHKA_FAIL_REDIRECT_PATH?.trim() || "/auditoria/pay/checkout";
  const redirectUrl = `${appBase.replace(/\/$/, "")}${redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`}`;
  const failRedirectUrl = `${appBase.replace(/\/$/, "")}${failPath.startsWith("/") ? failPath : `/${failPath}`}`;
  const ttlMinutes = Number(process.env.TOCHKA_PAYMENT_TTL_MINUTES ?? "1440");

  return {
    apiBase: apiBase.replace(/\/$/, ""),
    jwt,
    customerCode,
    merchantId,
    redirectUrl,
    failRedirectUrl,
    ttlMinutes: Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 1440,
  };
}

export const TOCHKA_NOT_CONFIGURED =
  "Точка Банк не настроена: задайте TOCHKA_JWT, TOCHKA_CUSTOMER_CODE, TOCHKA_MERCHANT_ID";

export type CreatePaymentOperationInput = {
  amount: number;
  purpose: string;
  paymentLinkId: string;
};

export type CreatePaymentOperationResult = {
  operationId: string;
  paymentLink: string;
  raw: unknown;
};

export type PaymentOperationInfo = {
  operationId: string;
  status: string;
  amount?: number;
  raw: unknown;
};

type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

function withTimeout(fetchFn: HttpFetch, timeoutMs: number): HttpFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw serviceUnavailable("Таймаут запроса к API Точка Банк");
      }
      const cause =
        err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code?: unknown }).code ?? "")
          : "";
      if (
        /CERT|SSL|TLS|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(code) ||
        /certificate|SSL|TLS/i.test(
          cause instanceof Error ? cause.message : String(cause ?? "")
        )
      ) {
        throw serviceUnavailable(
          "API Точка Банк: ошибка TLS (нужны сертификаты Минцифры, NODE_EXTRA_CA_CERTS)"
        );
      }
      throw serviceUnavailable("API Точка Банк недоступен");
    } finally {
      clearTimeout(timer);
    }
  };
}

function digData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const anyBody = body as { Data?: unknown; data?: unknown };
  const data = anyBody.Data ?? anyBody.data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return body as Record<string, unknown>;
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function readNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

async function tochkaRequest(
  cfg: TochkaConfig,
  method: string,
  path: string,
  body?: unknown,
  fetchFn?: HttpFetch
): Promise<unknown> {
  const http = withTimeout(fetchFn ?? fetch, DEFAULT_TIMEOUT_MS);
  const url = `${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await http(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String((json as { message?: unknown }).message)
        : `HTTP ${res.status}`;
    throw serviceUnavailable(`Точка Банк: ${message}`);
  }
  return json;
}

export async function createPaymentOperation(
  cfg: TochkaConfig,
  input: CreatePaymentOperationInput,
  fetchFn?: HttpFetch
): Promise<CreatePaymentOperationResult> {
  if (!(input.amount > 0)) throw validationError("Сумма оплаты должна быть больше 0");
  const paymentLinkId = input.paymentLinkId.slice(0, 64);
  const body = {
    Data: {
      customerCode: cfg.customerCode,
      amount: Number(input.amount.toFixed(2)),
      purpose: input.purpose,
      paymentMode: ["sbp"],
      paymentLinkId,
      merchantId: cfg.merchantId,
      redirectUrl: cfg.redirectUrl,
      failRedirectUrl: cfg.failRedirectUrl,
      ttl: cfg.ttlMinutes,
    },
  };
  const raw = await tochkaRequest(
    cfg,
    "POST",
    "/acquiring/v1.0/payments",
    body,
    fetchFn
  );
  const data = digData(raw);
  if (!data) {
    throw serviceUnavailable("Точка Банк: неожиданный ответ при создании платежа");
  }
  const operationId =
    readString(data, "operationId", "operation_id", "id") ?? "";
  const paymentLink =
    readString(data, "paymentLink", "payment_link", "link", "url") ?? "";
  if (!operationId || !paymentLink) {
    throw serviceUnavailable(
      "Точка Банк: в ответе нет operationId или paymentLink"
    );
  }
  return { operationId, paymentLink, raw };
}

export async function getPaymentOperationInfo(
  cfg: TochkaConfig,
  operationId: string,
  fetchFn?: HttpFetch
): Promise<PaymentOperationInfo> {
  const raw = await tochkaRequest(
    cfg,
    "GET",
    `/acquiring/v1.0/payments/${encodeURIComponent(operationId)}`,
    undefined,
    fetchFn
  );
  const data = digData(raw) ?? {};
  const status =
    readString(data, "status", "paymentStatus", "payment_status") ?? "UNKNOWN";
  const amount = readNumber(data, "amount", "paymentAmount", "payment_amount");
  return {
    operationId:
      readString(data, "operationId", "operation_id", "id") ?? operationId,
    status,
    amount,
    raw,
  };
}

export async function refundPaymentOperation(
  cfg: TochkaConfig,
  operationId: string,
  amount?: number,
  fetchFn?: HttpFetch
): Promise<unknown> {
  const body =
    amount != null
      ? { Data: { amount: Number(amount.toFixed(2)) } }
      : { Data: {} };
  return tochkaRequest(
    cfg,
    "POST",
    `/acquiring/v1.0/payments/${encodeURIComponent(operationId)}/refund`,
    body,
    fetchFn
  );
}