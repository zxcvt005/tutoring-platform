import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  CSRF_COOKIE,
  CSRF_HEADER,
} from "@/server/auth/constants";
import { getAppBaseUrl, isProductionRuntime } from "@/server/auth/env";
import { forbidden } from "@/server/errors";

export { CSRF_COOKIE, CSRF_HEADER };

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProductionRuntime(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };
}

function tokensEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Нормализует строку до canonical Origin (scheme + host + port).
 * Принимает только абсолютные URL со схемой http/https.
 */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // URL.origin — строгий scheme://host[:port] без path/query
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Список разрешённых Origin:
 * - APP_BASE_URL (основной, обязателен по смыслу в production)
 * - ALLOWED_ORIGINS (доп., через запятую)
 * - localhost только вне production
 */
export function getAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const set = new Set<string>();

  const base = env.APP_BASE_URL?.trim();
  if (base) {
    const origin = normalizeOrigin(base);
    if (origin) set.add(origin);
  }

  const extra = env.ALLOWED_ORIGINS?.split(",") ?? [];
  for (const item of extra) {
    const origin = normalizeOrigin(item);
    if (origin) set.add(origin);
  }

  // Локальные origin только вне production (env.NODE_ENV для тестов)
  const isProd =
    env.NODE_ENV != null
      ? env.NODE_ENV === "production"
      : isProductionRuntime();

  if (!isProd) {
    for (const local of [
      "http://127.0.0.1:43127",
      "http://localhost:43127",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]) {
      set.add(local);
    }
  }

  return [...set];
}

export function isOriginAllowed(
  originHeader: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const origin = normalizeOrigin(originHeader);
  if (!origin) return false;
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin);
}

/**
 * Double-submit CSRF: cookie tp_csrf должен совпасть с заголовком x-csrf-token.
 * Для GET не вызывается.
 */
export function assertCsrf(request: Request): void {
  const cookieToken = parseCookie(request.headers.get("cookie"), CSRF_COOKIE);
  const headerToken = request.headers.get(CSRF_HEADER)?.trim();
  if (!cookieToken || !headerToken || !tokensEqual(cookieToken, headerToken)) {
    throw forbidden("Недействительный CSRF-токен");
  }
}

/**
 * Строгая проверка Origin (или Referer.origin) по scheme+host+port.
 * CSRF отдельно не отключается.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowed = getAllowedOrigins();

  if (origin) {
    if (!isOriginAllowed(origin)) {
      throw forbidden("Недопустимый Origin");
    }
    return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowed.includes(refOrigin)) {
        throw forbidden("Недопустимый Referer");
      }
      return;
    } catch (err) {
      if (err instanceof Error && err.message === "Недопустимый Referer") {
        throw err;
      }
      throw forbidden("Недопустимый Referer");
    }
  }

  if (isProductionRuntime()) {
    throw forbidden("Отсутствует Origin");
  }
}

/** CSRF + Origin для мутаций из браузера. */
export function assertMutatingRequest(request: Request): void {
  assertSameOrigin(request);
  assertCsrf(request);
}
