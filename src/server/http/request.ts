import { cookies } from "next/headers";
import { z } from "zod";

import { SESSION_COOKIE } from "@/server/auth/session";
import { resolveAuthContext, type AuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { validationError } from "@/server/errors";

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("Ожидался JSON в теле запроса");
  }
}

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError("Некорректные данные", result.error.flatten());
  }
  return result.data;
}

export async function getSessionTokenFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export function getSessionTokenFromHeader(
  request: Request
): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/** Для Route Handlers: cookie из Next cookies() или из заголовка (тесты). */
export async function getRawSessionToken(
  request: Request
): Promise<string | undefined> {
  try {
    const fromJar = await getSessionTokenFromCookies();
    if (fromJar) return fromJar;
  } catch {
    // cookies() недоступен вне request scope — fallback
  }
  return getSessionTokenFromHeader(request);
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const db = getDb();
  const token = await getRawSessionToken(request);
  const orgHeader = request.headers.get("x-organization-id");
  return resolveAuthContext(db, token, orgHeader);
}

export function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key")?.trim();
  return key || null;
}

export function getClientMeta(request: Request) {
  return {
    userAgent: request.headers.get("user-agent"),
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
  };
}
