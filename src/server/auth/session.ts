import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import {
  IMPERSONATOR_COOKIE,
  SESSION_COOKIE,
} from "@/server/auth/constants";
import { sessions, users } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export { SESSION_COOKIE, IMPERSONATOR_COOKIE };
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 дней

/** В cookie храним сырой токен; в БД — sha256(token). */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  db: AppDb,
  input: {
    userId: string;
    userAgent?: string | null;
    ip?: string | null;
    impersonatorUserId?: string | null;
  }
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = createSessionToken();
  const id = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    impersonatorUserId: input.impersonatorUserId ?? null,
    expiresAt,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
  });
  return { rawToken, expiresAt };
}

export async function revokeSession(
  db: AppDb,
  rawToken: string | undefined | null
): Promise<void> {
  if (!rawToken) return;
  const id = hashSessionToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function revokeAllUserSessions(
  db: AppDb,
  userId: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function findValidSessionUser(db: AppDb, rawToken: string) {
  const id = hashSessionToken(rawToken);
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
      impersonatorUserId: sessions.impersonatorUserId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);

  return rows[0] ?? null;
}

export function sessionCookieOptions(expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    // Не задаём Domain — cookie только для текущего хоста
  };
}

/** Очистка cookie с теми же флагами, что и при установке. */
export function clearSessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
