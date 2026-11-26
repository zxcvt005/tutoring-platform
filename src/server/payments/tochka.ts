import { serviceUnavailable, validationError } from "@/server/errors";

const DEFAULT_API_BASE = "https://enter.tochka.com/uapi";
const SANDBOX_API_BASE = "https://enter.tochka.com/sandbox/v2";
const DEFAULT_TIMEOUT_MS = 25_000;

/** Официальный OpenAPI Tochka.API: Create Payment Operation. */
export const TOCHKA_CUSTOMER_CODE_LEN = 9;
export const TOCHKA_MERCHANT_ID_LEN = 15;
export const TOCHKA_PURPOSE_MAX_LEN = 140;
export const TOCHKA_PAYMENT_LINK_ID_MAX_LEN = 45;
export const TOCHKA_TTL_MIN = 1;
export const TOCHKA_TTL_MAX = 44_640;
export const TOCHKA_SBP_PAYMENT_MODE = ["sbp"] as const;

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

function assertTochkaConfig(cfg: TochkaConfig) {
  if (cfg.customerCode.length !== TOCHKA_CUSTOMER_CODE_LEN) {
    throw validationError(
      `TOCHKA_CUSTOMER_CODE должен быть ровно ${TOCHKA_CUSTOMER_CODE_LEN} символов (OpenAPI Tochka)`
    );
  }
  if (cfg.merchantId.length !== TOCHKA_MERCHANT_ID_LEN) {
    throw validationError(
      `TOCHKA_MERCHANT_ID должен быть ровно ${TOCHKA_MERCHANT_ID_LEN} символов (OpenAPI Tochka)`
    );
  }
  if (cfg.ttlMinutes < TOCHKA_TTL_MIN || cfg.ttlMinutes > TOCHKA_TTL_MAX) {
    throw validationError(
      `TOCHKA_PAYMENT_TTL_MINUTES вне диапазона ${TOCHKA_TTL_MIN}…${TOCHKA_TTL_MAX}`
    );
  }
  try {
    const redirect = new URL(cfg.redirectUrl);
    const fail = new URL(cfg.failRedirectUrl);
    if (!/^https?:$/i.test(redirect.protocol) || !/^https?:$/i.test(fail.protocol)) {
      throw new Error("bad protocol");
    }
  } catch {
    throw validationError(
      "redirectUrl/failRedirectUrl невалидны: проверьте APP_BASE_URL и TOCHKA_*_REDIRECT_PATH"
    );
  }
}

export function truncateTochkaPurpose(purpose: string): string {
  const trimmed = purpose.trim();
  if (!trimmed) {
    throw validationError("Назначение платежа (purpose) не может быть пустым");
  }
  if (trimmed.length <= TOCHKA_PURPOSE_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, TOCHKA_PURPOSE_MAX_LEN - 1)}…`;
}

export function truncateTochkaPaymentLinkId(paymentLinkId: string): string {
  const trimmed = paymentLinkId.trim();
  if (!trimmed) {
    throw validationError("paymentLinkId не может быть пустым");
  }
  return trimmed.slice(0, TOCHKA_PAYMENT_LINK_ID_MAX_LEN);
}

/** Безопасное сообщение по телу ошибки Точки (без токенов и PII). */
export function formatTochkaApiError(status: number, body: unknown): string {
  if (!body || typeof body !== "object") {
    return `HTTP ${status}`;
  }
  const obj = body as {
    message?: unknown;
    Errors?: unknown;
    errors?: unknown;
  };
  const category =
    typeof obj.message === "string" && obj.message.trim()
      ? obj.message.trim()
      : "";
  const list = Array.isArray(obj.Errors)
    ? obj.Errors
    : Array.isArray(obj.errors)
      ? obj.errors
      : [];
  const details: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { errorCode?: unknown; message?: unknown };
    const code =
      typeof row.errorCode === "string" && row.errorCode.trim()
        ? row.errorCode.trim()
        : "";
    const msg =
      typeof row.message === "string" && row.message.trim()
        ? row.message.trim()
        : "";
    if (code && msg) details.push(`${code}: ${msg}`);
    else if (msg) details.push(msg);
    else if (code) details.push(code);
  }
  const detail = details[0] ?? "";
  if (category && detail) return `HTTP ${status} ${category} — ${detail}`;
  if (detail) return `HTTP ${status} — ${detail}`;
  if (category) return `HTTP ${status} ${category}`;
  return `HTTP ${status}`;
}

function isTlsTransportError(err: unknown): boolean {
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause : err;
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "")
      : "";
  if (
    /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID|DEPTH_ZERO_SELF_SIGNED_CERT/i.test(
      code
    )
  ) {
    return true;
  }
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  return /self[- ]signed certificate|unable to verify|certificate chain|unable to get local issuer/i.test(
    message
  );
}

function logSafeTochkaDiag(fields: Record<string, string | number | boolean>) {
  // Только технические поля: без JWT, без сумм/ссылок/тел/ФИО.
  console.warn("[tochka]", fields);
}

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
        logSafeTochkaDiag({ stage: "transport", kind: "timeout" });
        throw serviceUnavailable("Таймаут запроса к API Точка Банк");
      }
      if (isTlsTransportError(err)) {
        const cause =
          err instanceof Error && err.cause instanceof Error ? err.cause : err;
        const code =
          cause && typeof cause === "object" && "code" in cause
            ? String((cause as { code?: unknown }).code ?? "")
            : "";
        logSafeTochkaDiag({
          stage: "tls",
          kind: "handshake",
          code: code || "tls_error",
          hasNodeExtraCa: Boolean(process.env.NODE_EXTRA_CA_CERTS?.trim()),
        });
        throw serviceUnavailable(
          "API Точка Банк: ошибка TLS (нужны сертификаты Минцифры, NODE_EXTRA_CA_CERTS)"
        );
      }
      const cause =
        err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code?: unknown }).code ?? "")
          : "";
      logSafeTochkaDiag({
        stage: "transport",
        kind: "network",
        code: code || "network_error",
      });
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
    const formatted = formatTochkaApiError(res.status, json);
    logSafeTochkaDiag({
      stage: "http",
      method,
      path,
      status: res.status,
      detail: formatted.slice(0, 240),
    });
    throw serviceUnavailable(`Точка Банк: ${formatted}`);
  }
  return json;
}

export async function createPaymentOperation(
  cfg: TochkaConfig,
  input: CreatePaymentOperationInput,
  fetchFn?: HttpFetch
): Promise<CreatePaymentOperationResult> {
  assertTochkaConfig(cfg);
  if (!(input.amount > 0)) throw validationError("Сумма оплаты должна быть больше 0");
  const paymentLinkId = truncateTochkaPaymentLinkId(input.paymentLinkId);
  const purpose = truncateTochkaPurpose(input.purpose);
  const body = {
    Data: {
      customerCode: cfg.customerCode,
      amount: Number(input.amount.toFixed(2)),
      purpose,
      paymentMode: [...TOCHKA_SBP_PAYMENT_MODE],
      paymentLinkId,
      merchantId: cfg.merchantId,
      redirectUrl: cfg.redirectUrl,
      failRedirectUrl: cfg.failRedirectUrl,
      ttl: cfg.ttlMinutes,
    },
  };
  logSafeTochkaDiag({
    stage: "create_payment",
    path: "/acquiring/v1.0/payments",
    paymentMode: TOCHKA_SBP_PAYMENT_MODE.join(","),
    purposeLen: purpose.length,
    paymentLinkIdLen: paymentLinkId.length,
  });
  const raw = await tochkaRequest(
    cfg,
    "POST",
    "/acquiring/v1.0/payments",
    body,
    fetchFn
  );
  const data = digData(raw);
  if (!data) {
    logSafeTochkaDiag({ stage: "parse", kind: "missing_data" });
    throw serviceUnavailable("Точка Банк: неожиданный ответ при создании платежа");
  }
  const operationId =
    readString(data, "operationId", "operation_id", "id") ?? "";
  const paymentLink =
    readString(data, "paymentLink", "payment_link", "link", "url") ?? "";
  if (!operationId || !paymentLink) {
    logSafeTochkaDiag({
      stage: "parse",
      kind: "missing_fields",
      hasOperationId: Boolean(operationId),
      hasPaymentLink: Boolean(paymentLink),
    });
    throw serviceUnavailable(
      "Точка Банк: в ответе нет operationId или paymentLink"
    );
  }
  try {
    // Ссылка должна быть абсолютным URL — иначе UI откроет не туда.
    const parsed = new URL(paymentLink);
    if (!/^https?:$/i.test(parsed.protocol)) {
      throw new Error("bad protocol");
    }
  } catch {
    logSafeTochkaDiag({ stage: "parse", kind: "invalid_payment_link" });
    throw serviceUnavailable("Точка Банк: некорректная платёжная ссылка в ответе");
  }
  logSafeTochkaDiag({
    stage: "create_payment",
    kind: "ok",
    hasOperationId: true,
    hasPaymentLink: true,
  });
  return { operationId, paymentLink, raw };
}

export async function getPaymentOperationInfo(
  cfg: TochkaConfig,
  operationId: string,
  fetchFn?: HttpFetch
): Promise<PaymentOperationInfo> {
  assertTochkaConfig(cfg);
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
  assertTochkaConfig(cfg);
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
