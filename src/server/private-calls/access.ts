import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import {
  PRIVATE_GUEST_COOKIE,
  PRIVATE_HOST_COOKIE,
} from "@/server/auth/constants";
import { isProductionRuntime } from "@/server/auth/env";
import { loginAttempts } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { rateLimited } from "@/server/auth/rate-limit";
import { ApiError, unauthorized } from "@/server/errors";
import { newId } from "@/lib/format";

export { PRIVATE_GUEST_COOKIE, PRIVATE_HOST_COOKIE };

export const PRIVATE_HOST_TTL_MS = 12 * 60 * 60 * 1000;
export const PRIVATE_GUEST_TTL_MS = 12 * 60 * 60 * 1000;

const HOST_FAIL_WINDOW_MS = 15 * 60 * 1000;
const HOST_FAIL_LIMIT = 8;
const MIN_SECRET_LENGTH = 24;

export type PrivateGuestClaims = {
  roomId: string;
  sessionId: string;
  exp: number;
};

type HostClaims = { v: 1; kind: "host"; exp: number };
type GuestTokenClaims = {
  v: 1;
  kind: "guest";
  exp: number;
  roomId: string;
  sessionId: string;
};

function misconfigured() {
  return new ApiError(503, "service_unavailable", "Приём звонков не настроен");
}

export function requirePrivatePassword(): string {
  const value = process.env.PRIVATE_CALLS_PASSWORD?.trim() ?? "";
  if (value.length < MIN_SECRET_LENGTH) throw misconfigured();
  return value;
}

export function requirePrivateSecret(): string {
  const value = process.env.PRIVATE_CALLS_SECRET?.trim() ?? "";
  if (value.length < MIN_SECRET_LENGTH) throw misconfigured();
  return value;
}

function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function signPayload(payload: HostClaims | GuestTokenClaims): string {
  const secret = requirePrivateSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function readPayload(token: string | undefined | null): unknown | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  let secret: string;
  try {
    secret = requirePrivateSecret();
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const given = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function isFresh(exp: unknown): exp is number {
  return typeof exp === "number" && Number.isFinite(exp) && exp * 1000 > Date.now();
}

export function sealPrivateHost(expiresAt: Date): string {
  return signPayload({
    v: 1,
    kind: "host",
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
}

export function openPrivateHost(token: string | undefined | null): HostClaims | null {
  const payload = readPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Partial<HostClaims>;
  if (row.v !== 1 || row.kind !== "host" || !isFresh(row.exp)) return null;
  return { v: 1, kind: "host", exp: row.exp };
}

const ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;

export function sealPrivateGuest(
  claims: { roomId: string; sessionId: string },
  expiresAt: Date
): string {
  return signPayload({
    v: 1,
    kind: "guest",
    exp: Math.floor(expiresAt.getTime() / 1000),
    roomId: claims.roomId,
    sessionId: claims.sessionId,
  });
}

export function openPrivateGuest(
  token: string | undefined | null
): PrivateGuestClaims | null {
  const payload = readPayload(token);
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Partial<GuestTokenClaims>;
  if (row.v !== 1 || row.kind !== "guest" || !isFresh(row.exp)) return null;
  if (!row.roomId || !row.sessionId) return null;
  if (!ID_RE.test(row.roomId) || !ID_RE.test(row.sessionId)) return null;
  return { roomId: row.roomId, sessionId: row.sessionId, exp: row.exp };
}

export function privateCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function clearPrivateCookieOptions() {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function readRequestCookie(
  request: Request,
  name: string
): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function readCookie(request: Request, name: string): Promise<string | undefined> {
  try {
    const jar = await cookies();
    const fromJar = jar.get(name)?.value;
    if (fromJar) return fromJar;
  } catch {
    // cookies() недоступен вне request scope
  }
  return readRequestCookie(request, name);
}

export async function requirePrivateHost(request: Request): Promise<void> {
  const raw = await readCookie(request, PRIVATE_HOST_COOKIE);
  if (!openPrivateHost(raw)) throw unauthorized();
}

export async function readPrivateGuest(
  request: Request
): Promise<PrivateGuestClaims | null> {
  const raw = await readCookie(request, PRIVATE_GUEST_COOKIE);
  return openPrivateGuest(raw);
}

function hostKeys(ip: string | null): string[] {
  const keys = ["private-host"];
  if (ip) keys.push(`private-host-ip:${ip}`);
  return keys;
}

export async function loginPrivateHost(
  db: AppDb,
  password: string,
  ip: string | null,
  now = new Date()
): Promise<{ expiresAt: Date }> {
  const expected = requirePrivatePassword();
  const since = new Date(now.getTime() - HOST_FAIL_WINDOW_MS);
  for (const key of hostKeys(ip)) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.key, key),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, since)
        )
      );
    if (Number(row?.n ?? 0) >= HOST_FAIL_LIMIT) {
      throw rateLimited();
    }
  }

  const ok = passwordsMatch(password, expected);
  const rows = hostKeys(ip).map((key) => ({
    id: newId("la"),
    key,
    email: null,
    ip,
    success: ok,
    attemptedAt: now,
  }));
  await db.insert(loginAttempts).values(rows);
  if (ok) {
    for (const key of hostKeys(ip)) {
      await db
        .delete(loginAttempts)
        .where(and(eq(loginAttempts.key, key), eq(loginAttempts.success, false)));
    }
    return { expiresAt: new Date(now.getTime() + PRIVATE_HOST_TTL_MS) };
  }
  throw unauthorized("Неверный пароль");
}

export function newJoinCode(): string {
  return randomBytes(9).toString("base64url");
}
