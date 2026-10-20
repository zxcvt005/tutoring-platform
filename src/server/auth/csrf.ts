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
 * Проверка Origin/Referer для state-changing запросов.
 * В development без APP_BASE_URL пропускаем, если Origin отсутствует (удобство тестов).
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowed = allowedOrigins();

  if (origin) {
    if (!allowed.some((a) => origin === a || origin.startsWith(a))) {
      throw forbidden("Недопустимый Origin");
    }
    return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowed.some((a) => refOrigin === a || refOrigin.startsWith(a))) {
        throw forbidden("Недопустимый Referer");
      }
      return;
    } catch {
      throw forbidden("Недопустимый Referer");
    }
  }

  // Без Origin/Referer: в production — отказ (кроме same-site навигации с cookie; API fetch всегда шлёт Origin)
  if (isProductionRuntime()) {
    throw forbidden("Отсутствует Origin");
  }
}

function allowedOrigins(): string[] {
  const list: string[] = [];
  const base = getAppBaseUrl();
  if (base) {
    try {
      list.push(new URL(base).origin);
    } catch {
      /* ignore */
    }
  }
  // Локальная разработка
  list.push("http://127.0.0.1:43127", "http://localhost:43127");
  list.push("http://127.0.0.1:3000", "http://localhost:3000");
  const extra = process.env.ALLOWED_ORIGINS?.split(",") ?? [];
  for (const o of extra) {
    const t = o.trim();
    if (t) list.push(t.replace(/\/$/, ""));
  }
  return list;
}

/** CSRF + Origin для мутаций из браузера. */
export function assertMutatingRequest(request: Request): void {
  assertSameOrigin(request);
  assertCsrf(request);
}
