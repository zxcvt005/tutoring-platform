import type { AvitoEnvConfig } from "@/server/avito/env";
import { serviceUnavailable, validationError } from "@/server/errors";

const TOKEN_URL = "https://api.avito.ru/token/";
const API_BASE = "https://api.avito.ru";
const DEFAULT_TIMEOUT_MS = 25_000;

export type AvitoHttpFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type AvitoClientDeps = {
  fetchFn?: AvitoHttpFetch;
  timeoutMs?: number;
  now?: () => number;
};

type TokenCache = {
  accessToken: string;
  /** unix ms when token should be refreshed */
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

/** Test helper — clear in-memory token cache. */
export function resetAvitoTokenCache() {
  tokenCache = null;
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

export async function fetchAvitoAccessToken(
  cfg: AvitoEnvConfig,
  deps: AvitoClientDeps = {}
): Promise<string> {
  const now = deps.now ?? Date.now;
  if (tokenCache && tokenCache.expiresAtMs > now() + 60_000) {
    return tokenCache.accessToken;
  }

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

async function avitoJson(
  cfg: AvitoEnvConfig,
  path: string,
  init: RequestInit,
  deps: AvitoClientDeps,
  retried = false
): Promise<unknown> {
  const fetchFn = withTimeout(
    deps.fetchFn ?? fetch,
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const token = await fetchAvitoAccessToken(cfg, deps);
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

  if (res.status === 401 && !retried) {
    resetAvitoTokenCache();
    return avitoJson(cfg, path, init, deps, true);
  }

  if (!res.ok) {
    const msg = errorMessageFromBody(json, `HTTP ${res.status}`);
    if (res.status === 400) throw validationError(`Avito API: ${msg}`);
    if (res.status === 401 || res.status === 403) {
      throw validationError(`Avito API: доступ запрещён (${msg})`);
    }
    if (res.status === 429) {
      throw serviceUnavailable("Avito API: слишком много запросов, повторите позже");
    }
    throw serviceUnavailable(`Avito API: ${msg}`);
  }
  return json;
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
