import { eq } from "drizzle-orm";

import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  revokeSession,
  revokeAllUserSessions,
} from "@/server/auth/session";
import type { AuthContext } from "@/server/authz/context";
import { users } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { unauthorized, validationError } from "@/server/errors";

export async function loginWithPassword(
  db: AppDb,
  input: {
    email: string;
    password: string;
    userAgent?: string | null;
    ip?: string | null;
  }
) {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    throw validationError("Укажите email и пароль");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.status !== "active") {
    throw unauthorized("Неверный email или пароль");
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw unauthorized("Неверный email или пароль");
  }

  const session = await createSession(db, {
    userId: user.id,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
    session,
  };
}

export async function logout(db: AppDb, rawToken: string | undefined) {
  await revokeSession(db, rawToken);
}

export async function logoutAll(db: AppDb, ctx: AuthContext) {
  await revokeAllUserSessions(db, ctx.userId);
}

export function mePayload(ctx: AuthContext) {
  return {
    user: {
      id: ctx.userId,
      email: ctx.email,
      fullName: ctx.fullName,
    },
    organizationId: ctx.organizationId,
    role: ctx.role,
    teacherId: ctx.teacherId,
    studentId: ctx.studentId,
    impersonation: ctx.impersonation,
  };
}

/** Хелпер для seed/админки: выставить валидный bcrypt-хеш. */
export async function setUserPassword(
  db: AppDb,
  userId: string,
  plainPassword: string
) {
  const passwordHash = await hashPassword(plainPassword);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
