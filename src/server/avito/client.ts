import type { AvitoEnvConfig } from "@/server/avito/env";
import { ApiError, serviceUnavailable, validationError } from "@/server/errors";

const TOKEN_URL = "https://api.avito.ru/token/";
const API_BASE = "https://api.avito.ru";
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_429_RETRIES = 3;
const DEFAULT_429_WAIT_MS = 5_000;
const MAX_429_WAIT_MS = 60_000;

export type AvitoHttpFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type AvitoClientDeps = {
  fetchFn?: AvitoHttpFetch;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type TokenCache = {
  accessToken: string;
  /** unix ms when token should be refreshed */
  expiresAtMs: number;
};

type AvitoDiagCounters = {
  requests: number;
  tokenRequests: number;
  rateLimited: number;
  retries: number;
  lastRetryAfterMs: number | null;
};

let tokenCache: TokenCache | null = null;
let requestGate: Promise<void> = Promise.resolve();
const diag: AvitoDiagCounters = {
  requests: 0,
  tokenRequests: 0,
  rateLimited: 0,
  retries: 0,
  lastRetryAfterMs: null,
};

/** Test helper — clear in-memory token cache. */
export function resetAvitoTokenCache() {
  tokenCache = null;
}

/** Test / diagnostics helper. */
export function resetAvitoClientDiagnostics() {
  diag.requests = 0;
  diag.tokenRequests = 0;
  diag.rateLimited = 0;
  diag.retries = 0;
  diag.lastRetryAfterMs = null;
  requestGate = Promise.resolve();
}

export function getAvitoClientDiagnostics(): Readonly<AvitoDiagCounters> {
  return { ...diag };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Сериализует исходящие HTTP-вызовы к Avito в одном процессе,
 * чтобы параллельные sync не били API пачкой.
 */
async function withAvitoRequestSlot<T>(run: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const waitForTurn = requestGate;
  requestGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await waitForTurn;
  try {
    return await run();
  } finally {
    release();
  }
}

function withTimeout(
  fetchFn: AvitoHttpFetch,
  timeoutMs: number
): AvitoHttpFetch {
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
        throw serviceUnavailable("Таймаут запроса к Avito API");
      }
      throw serviceUnavailable("Avito API недоступен");
    } finally {
      clearTimeout(timer);
    }
  };
}

async function readJsonSafe(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const anyBody = body as {
    error?: string | { message?: string; code?: number };
    message?: string;
  };
  if (typeof anyBody.error === "string" && anyBody.error) return anyBody.error;
  if (
    anyBody.error &&
    typeof anyBody.error === "object" &&
    typeof anyBody.error.message === "string"
  ) {
    return anyBody.error.message;
  }
  if (typeof anyBody.message === "string" && anyBody.message) {
    return anyBody.message;
  }
  return fallback;
}

function parseRetryAfterMs(res: Response, attempt: number): number {
  const raw = res.headers.get("retry-after");
  if (raw) {
    const asInt = Number(raw);
    if (Number.isFinite(asInt) && asInt >= 0) {
      return Math.min(MAX_429_WAIT_MS, Math.max(0, asInt * 1000));
    }
    const asDate = Date.parse(raw);
    if (!Number.isNaN(asDate)) {
      const delta = asDate - Date.now();
      if (delta > 0) return Math.min(MAX_429_WAIT_MS, delta);
    }
  }
  const expo = DEFAULT_429_WAIT_MS * 2 ** attempt;
  return Math.min(MAX_429_WAIT_MS, expo);
}

function rateLimitedError(retryAfterMs: number): ApiError {
  return new ApiError(
    503,
    "service_unavailable",
    "Avito API: слишком много запросов, повторите позже",
    { retryAfterMs, code: "avito_rate_limited" }
  );
}

/** Получение токена. Вызывать только внутри withAvitoRequestSlot. */
async function fetchAccessTokenUnlocked(
  cfg: AvitoEnvConfig,
  deps: AvitoClientDeps
): Promise<string> {
  const now = deps.now ?? Date.now;
  if (tokenCache && tokenCache.expiresAtMs > now() + 60_000) {
    return tokenCache.accessToken;
  }

  diag.tokenRequests += 1;
  diag.requests += 1;
  const fetchFn = withTimeout(
    deps.fetchFn ?? fetch,
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await readJsonSafe(res)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (res.status === 429) {
    diag.rateLimited += 1;
    const waitMs = parseRetryAfterMs(res, 0);
    diag.lastRetryAfterMs = waitMs;
    throw rateLimitedError(waitMs);
  }

  if (!res.ok || !json.access_token) {
    const msg = errorMessageFromBody(json, "Ошибка авторизации Avito");
    if (res.status === 401 || res.status === 403) {
      throw validationError(`Avito OAuth: ${msg}`);
    }
    throw serviceUnavailable(`Avito OAuth: ${msg}`);
  }

  const expiresInSec =
    typeof json.expires_in === "number" && json.expires_in > 0
      ? json.expires_in
      : 24 * 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now() + expiresInSec * 1000,
  };
  return json.access_token;
}

export async function fetchAvitoAccessToken(
  cfg: AvitoEnvConfig,
  deps: AvitoClientDeps = {}
): Promise<string> {
  const now = deps.now ?? Date.now;
  if (tokenCache && tokenCache.expiresAtMs > now() + 60_000) {
    return tokenCache.accessToken;
  }
  return withAvitoRequestSlot(() => fetchAccessTokenUnlocked(cfg, deps));
}

async function avitoJsonOnce(
  cfg: AvitoEnvConfig,
  path: string,
  init: RequestInit,
  deps: AvitoClientDeps,
  retriedAuth: boolean
): Promise<{ json: unknown } | { authRetry: true } | { rateLimited: true; waitMs: number }> {
  const started = Date.now();
  const kind = path.includes("/spendings")
    ? "spendings"
    : path.includes("/items")
      ? "items"
      : "other";

  return withAvitoRequestSlot(async () => {
    diag.requests += 1;
    const fetchFn = withTimeout(
      deps.fetchFn ?? fetch,
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    const token = await fetchAccessTokenUnlocked(cfg, deps);
    const res = await fetchFn(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const json = await readJsonSafe(res);
    const durationMs = Date.now() - started;

    if (res.status === 401 && !retriedAuth) {
      resetAvitoTokenCache();
      return { authRetry: true as const };
    }

    if (res.status === 429) {
      diag.rateLimited += 1;
      const waitMs = parseRetryAfterMs(res, 0);
      diag.lastRetryAfterMs = waitMs;
      console.info(
        "[avito]",
        JSON.stringify({
          event: "rate_limited",
          kind,
          status: 429,
          retryAfterMs: waitMs,
          durationMs,
        })
      );
      return { rateLimited: true as const, waitMs };
    }

    if (!res.ok) {
      const msg = errorMessageFromBody(json, `HTTP ${res.status}`);
      console.info(
        "[avito]",
        JSON.stringify({
          event: "error",
          kind,
          status: res.status,
          durationMs,
        })
      );
      if (res.status === 400) throw validationError(`Avito API: ${msg}`);
      if (res.status === 401 || res.status === 403) {
        throw validationError(`Avito API: доступ запрещён (${msg})`);
      }
      throw serviceUnavailable(`Avito API: ${msg}`);
    }

    console.info(
      "[avito]",
      JSON.stringify({
        event: "ok",
        kind,
        status: res.status,
        durationMs,
      })
    );
    return { json };
  });
}

async function avitoJson(
  cfg: AvitoEnvConfig,
  path: string,
  init: RequestInit,
  deps: AvitoClientDeps
): Promise<unknown> {
  const sleep = deps.sleep ?? defaultSleep;
  let retriedAuth = false;
  let rateAttempt = 0;

  for (;;) {
    const result = await avitoJsonOnce(cfg, path, init, deps, retriedAuth);
    if ("authRetry" in result) {
      diag.retries += 1;
      retriedAuth = true;
      continue;
    }
    if ("rateLimited" in result) {
      if (rateAttempt >= MAX_429_RETRIES) {
        throw rateLimitedError(result.waitMs);
      }
      // Prefer Retry-After from Avito; otherwise exponential backoff.
      const waitMs = Math.min(
        MAX_429_WAIT_MS,
        result.waitMs > 0
          ? result.waitMs
          : DEFAULT_429_WAIT_MS * 2 ** rateAttempt
      );
      diag.retries += 1;
      rateAttempt += 1;
      diag.lastRetryAfterMs = waitMs;
      await sleep(waitMs);
      continue;
    }
    return result.json;
  }
}

export async function fetchAvitoSpendings(
  cfg: AvitoEnvConfig,
  input: { dateFrom: string; dateTo: string },
  deps: AvitoClientDeps = {}
): Promise<unknown> {
  return avitoJson(
    cfg,
    `/stats/v2/accounts/${cfg.userId}/spendings`,
    {
      method: "POST",
      body: JSON.stringify({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        grouping: "day",
        spendingTypes: ["promotion"],
      }),
    },
    deps
  );
}

export async function fetchAvitoItemStatsPage(
  cfg: AvitoEnvConfig,
  input: {
    dateFrom: string;
    dateTo: string;
    limit: number;
    offset: number;
  },
  deps: AvitoClientDeps = {}
): Promise<unknown> {
  return avitoJson(
    cfg,
    `/stats/v2/accounts/${cfg.userId}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        grouping: "day",
        metrics: ["impressions", "views", "contacts"],
        limit: input.limit,
        offset: input.offset,
      }),
    },
    deps
  );
}
