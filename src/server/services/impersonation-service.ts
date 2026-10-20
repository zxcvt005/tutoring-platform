import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  createSession,
  findValidSessionUser,
  revokeSession,
} from "@/server/auth/session";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  auditLog,
  memberships,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  validationError,
} from "@/server/errors";

function auditId() {
  return `audit_${randomBytes(8).toString("hex")}`;
}

async function writeAudit(
  db: AppDb,
  input: {
    organizationId: string;
    actorUserId: string;
    action: "impersonation_start" | "impersonation_stop";
    targetUserId: string;
    payload?: Record<string, unknown>;
  }
) {
  await db.insert(auditLog).values({
    id: auditId(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "user",
    entityId: input.targetUserId,
    payload: {
      targetUserId: input.targetUserId,
      at: new Date().toISOString(),
      ...input.payload,
    },
  });
}

/**
 * Администратор (director) открывает кабинет целевого пользователя.
 * Не трогает пароль цели. Исходный admin-токен клиент сохраняет в отдельной cookie.
 */
export async function startImpersonation(
  db: AppDb,
  ctx: AuthContext,
  input: {
    targetUserId: string;
    userAgent?: string | null;
    ip?: string | null;
  }
) {
  requireRoles(ctx, ["director"]);
  if (ctx.impersonation) {
    throw badRequest("Сначала завершите текущий просмотр кабинета");
  }

  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) throw validationError("Укажите пользователя");

  if (targetUserId === ctx.userId) {
    throw badRequest("Нельзя открыть кабинет самого себя");
  }

  const [mem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, targetUserId),
        eq(memberships.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!mem) throw notFound("Пользователь не найден в организации");
  if (mem.role !== "teacher" && mem.role !== "student") {
    throw forbidden("Можно открывать только кабинеты преподавателей и учеников");
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target || target.status !== "active") {
    throw forbidden("Учётная запись недоступна");
  }

  if (mem.role === "teacher") {
    const [t] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(
        and(
          eq(teachers.organizationId, ctx.organizationId),
          eq(teachers.userId, targetUserId)
        )
      )
      .limit(1);
    if (!t) throw notFound("Профиль преподавателя не найден");
  }

  if (mem.role === "student") {
    const [s] = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.organizationId, ctx.organizationId),
          eq(students.userId, targetUserId)
        )
      )
      .limit(1);
    if (!s) throw notFound("Профиль ученика не найден");
  }

  const session = await createSession(db, {
    userId: targetUserId,
    impersonatorUserId: ctx.userId,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  await writeAudit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "impersonation_start",
    targetUserId,
    payload: { targetRole: mem.role },
  });

  return {
    session,
    target: {
      userId: target.id,
      email: target.email,
      fullName: target.fullName,
      role: mem.role as "teacher" | "student",
    },
  };
}

/**
 * Завершает impersonation-сеанс и проверяет сохранённый admin-токен.
 */
export async function stopImpersonation(
  db: AppDb,
  input: {
    impersonationRawToken: string | undefined | null;
    adminRawToken: string | undefined | null;
  }
) {
  if (!input.impersonationRawToken) {
    throw unauthorized("Нет активного просмотра");
  }
  if (!input.adminRawToken) {
    throw unauthorized("Исходная сессия администратора не найдена");
  }

  const impSession = await findValidSessionUser(db, input.impersonationRawToken);
  if (!impSession?.impersonatorUserId) {
    throw badRequest("Текущий сеанс не является просмотром кабинета");
  }

  const adminSession = await findValidSessionUser(db, input.adminRawToken);
  if (!adminSession) {
    throw unauthorized("Исходная сессия администратора истекла");
  }
  if (adminSession.userId !== impSession.impersonatorUserId) {
    throw forbidden("Сессия администратора не совпадает с записью просмотра");
  }
  if (adminSession.impersonatorUserId) {
    throw forbidden("Некорректная сессия администратора");
  }

  const [adminMem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, adminSession.userId),
        eq(memberships.role, "director")
      )
    )
    .limit(1);
  if (!adminMem) throw forbidden("Недостаточно прав");

  const targetUserId = impSession.userId;
  await revokeSession(db, input.impersonationRawToken);

  await writeAudit(db, {
    organizationId: adminMem.organizationId,
    actorUserId: adminSession.userId,
    action: "impersonation_stop",
    targetUserId,
  });

  return {
    adminRawToken: input.adminRawToken,
    adminExpiresAt: adminSession.expiresAt,
    adminUserId: adminSession.userId,
  };
}

export async function resolveTargetUserIdFromProfile(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId?: string; studentId?: string; userId?: string }
): Promise<string> {
  requireRoles(ctx, ["director"]);
  if (input.userId) return input.userId.trim();

  if (input.teacherId) {
    const [t] = await db
      .select({ userId: teachers.userId })
      .from(teachers)
      .where(
        and(
          eq(teachers.id, input.teacherId),
          eq(teachers.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!t) throw notFound("Преподаватель не найден");
    if (!t.userId) {
      throw badRequest("У преподавателя нет учётной записи для входа");
    }
    return t.userId;
  }

  if (input.studentId) {
    const [s] = await db
      .select({ userId: students.userId })
      .from(students)
      .where(
        and(
          eq(students.id, input.studentId),
          eq(students.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!s) throw notFound("Ученик не найден");
    if (!s.userId) {
      throw badRequest("У ученика нет учётной записи для входа");
    }
    return s.userId;
  }

  throw validationError("Укажите userId, teacherId или studentId");
}
