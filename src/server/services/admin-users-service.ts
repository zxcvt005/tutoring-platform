import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { hashPassword } from "@/server/auth/password";
import { revokeAllUserSessions } from "@/server/auth/session";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  memberships,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";

export type CreateUserInput = {
  email: string;
  password: string;
  fullName: string;
  role: "director" | "teacher" | "student";
  /** Привязать к существующему профилю преподавателя в org */
  teacherId?: string;
  /** Привязать к существующему профилю ученика в org */
  studentId?: string;
  phone?: string;
};

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export async function listOrgUsers(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      status: users.status,
      role: memberships.role,
      membershipId: memberships.id,
      createdAt: users.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, ctx.organizationId));

  return rows.map((r) => ({
    id: r.userId,
    email: r.email,
    fullName: r.fullName,
    phone: r.phone,
    status: r.status,
    role: r.role,
    membershipId: r.membershipId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createOrgUser(
  db: AppDb,
  ctx: AuthContext,
  input: CreateUserInput
) {
  requireRoles(ctx, ["director"]);
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw validationError("Некорректный email");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw conflict("Пользователь с таким email уже есть");

  const userId = newId("user");
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    status: "active",
  });

  await db.insert(memberships).values({
    id: newId("mem"),
    organizationId: ctx.organizationId,
    userId,
    role: input.role,
  });

  if (input.role === "teacher") {
    if (input.teacherId) {
      const [t] = await db
        .select()
        .from(teachers)
        .where(
          and(
            eq(teachers.id, input.teacherId),
            eq(teachers.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      if (!t) throw notFound("Преподаватель не найден");
      if (t.userId) throw conflict("У профиля преподавателя уже есть аккаунт");
      await db
        .update(teachers)
        .set({ userId, email, updatedAt: new Date() })
        .where(eq(teachers.id, t.id));
    } else {
      await db.insert(teachers).values({
        id: newId("t"),
        organizationId: ctx.organizationId,
        userId,
        fullName: input.fullName.trim(),
        email,
        subjects: [],
        status: "active",
      });
    }
  }

  if (input.role === "student") {
    if (input.studentId) {
      const [s] = await db
        .select()
        .from(students)
        .where(
          and(
            eq(students.id, input.studentId),
            eq(students.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      if (!s) throw notFound("Ученик не найден");
      if (s.userId) throw conflict("У профиля ученика уже есть аккаунт");
      await db
        .update(students)
        .set({ userId, updatedAt: new Date() })
        .where(eq(students.id, s.id));
    } else {
      await db.insert(students).values({
        id: newId("s"),
        organizationId: ctx.organizationId,
        userId,
        fullName: input.fullName.trim(),
        status: "active",
      });
    }
  }

  return { id: userId, email, role: input.role };
}

export async function setUserStatus(
  db: AppDb,
  ctx: AuthContext,
  userId: string,
  status: "active" | "paused" | "disabled"
) {
  requireRoles(ctx, ["director"]);
  if (userId === ctx.userId && status !== "active") {
    throw badRequest("Нельзя отключить собственный аккаунт");
  }

  const [mem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!mem) throw notFound("Пользователь не в этой организации");

  await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId));

  if (status !== "active") {
    await revokeAllUserSessions(db, userId);
  }
  return { ok: true };
}

export async function resetUserPassword(
  db: AppDb,
  ctx: AuthContext,
  userId: string,
  newPassword: string
) {
  requireRoles(ctx, ["director"]);
  const [mem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!mem) throw notFound("Пользователь не в этой организации");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(newPassword);
  } catch (e) {
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await revokeAllUserSessions(db, userId);
  return { ok: true };
}

export async function assertUserInSameOrg(
  db: AppDb,
  ctx: AuthContext,
  userId: string
) {
  const [mem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!mem) throw forbidden();
  return mem;
}
