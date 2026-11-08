import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import { getAppBaseUrl } from "@/server/auth/env";
import { hashPassword } from "@/server/auth/password";
import { rateLimited } from "@/server/auth/rate-limit";
import { createSession } from "@/server/auth/session";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  accountInvitations,
  loginAttempts,
  memberships,
  organizations,
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

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 дней

export type AccessStatus = "unregistered" | "invited" | "activated";

export type InvitationAccessView = {
  accessStatus: AccessStatus;
  accountEmail: string | null;
  invitation: {
    id: string;
    expiresAt: string;
    createdAt: string;
  } | null;
};

export type PublicInvitationView = {
  status: "pending" | "used" | "revoked" | "expired";
  kind: "teacher" | "student";
  organizationName: string;
  inviteeName: string;
  cabinetLabel: "Кафедра" | "Аудитория";
};

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function normalizeEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e.includes("@") || e.length > 320) {
    throw validationError("Некорректный email");
  }
  return e;
}

function assertPasswordsMatch(password: string, passwordConfirm: string) {
  if (!password || !passwordConfirm) {
    throw validationError("Укажите пароль и подтверждение");
  }
  if (password !== passwordConfirm) {
    throw validationError("Пароль и подтверждение не совпадают");
  }
}

function buildInvitePath(rawToken: string) {
  return `/invite/${rawToken}`;
}

export function buildInviteUrl(rawToken: string): string {
  const base = getAppBaseUrl()?.replace(/\/$/, "");
  const path = buildInvitePath(rawToken);
  return base ? `${base}${path}` : path;
}

async function assertInviteAcceptNotRateLimited(
  db: AppDb,
  input: { ip?: string | null }
) {
  if (!input.ip) return;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const key = `invite:${input.ip}`;
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
  if (Number(row?.n ?? 0) >= 16) {
    throw rateLimited("Слишком много попыток. Подождите 15 минут.");
  }
}

async function recordInviteAttempt(
  db: AppDb,
  input: { ip?: string | null; success: boolean; email?: string }
) {
  if (!input.ip) return;
  await db.insert(loginAttempts).values({
    id: `la_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    key: `invite:${input.ip}`,
    email: input.email ?? null,
    ip: input.ip,
    success: input.success,
  });
}

function invitationPublicStatus(row: {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): PublicInvitationView["status"] {
  if (row.usedAt) return "used";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

export async function getProfileAccessStatus(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId?: string; studentId?: string }
): Promise<InvitationAccessView> {
  requireRoles(ctx, ["director"]);
  if (Boolean(input.teacherId) === Boolean(input.studentId)) {
    throw badRequest("Укажите teacherId или studentId");
  }

  if (input.teacherId) {
    const [teacher] = await db
      .select({
        id: teachers.id,
        userId: teachers.userId,
      })
      .from(teachers)
      .where(
        and(
          eq(teachers.id, input.teacherId),
          eq(teachers.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!teacher) throw notFound("Преподаватель не найден");

    let accountEmail: string | null = null;
    if (teacher.userId) {
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, teacher.userId))
        .limit(1);
      accountEmail = u?.email ?? null;
      return {
        accessStatus: "activated",
        accountEmail,
        invitation: null,
      };
    }

    const [invite] = await db
      .select({
        id: accountInvitations.id,
        expiresAt: accountInvitations.expiresAt,
        createdAt: accountInvitations.createdAt,
      })
      .from(accountInvitations)
      .where(
        and(
          eq(accountInvitations.organizationId, ctx.organizationId),
          eq(accountInvitations.teacherId, teacher.id),
          isNull(accountInvitations.usedAt),
          isNull(accountInvitations.revokedAt),
          gt(accountInvitations.expiresAt, new Date())
        )
      )
      .limit(1);

    return {
      accessStatus: invite ? "invited" : "unregistered",
      accountEmail: null,
      invitation: invite
        ? {
            id: invite.id,
            expiresAt: invite.expiresAt.toISOString(),
            createdAt: invite.createdAt.toISOString(),
          }
        : null,
    };
  }

  const studentId = input.studentId!;
  const [student] = await db
    .select({
      id: students.id,
      userId: students.userId,
    })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student) throw notFound("Ученик не найден");

  if (student.userId) {
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, student.userId))
      .limit(1);
    return {
      accessStatus: "activated",
      accountEmail: u?.email ?? null,
      invitation: null,
    };
  }

  const [invite] = await db
    .select({
      id: accountInvitations.id,
      expiresAt: accountInvitations.expiresAt,
      createdAt: accountInvitations.createdAt,
    })
    .from(accountInvitations)
    .where(
      and(
        eq(accountInvitations.organizationId, ctx.organizationId),
        eq(accountInvitations.studentId, student.id),
        isNull(accountInvitations.usedAt),
        isNull(accountInvitations.revokedAt),
        gt(accountInvitations.expiresAt, new Date())
      )
    )
    .limit(1);

  return {
    accessStatus: invite ? "invited" : "unregistered",
    accountEmail: null,
    invitation: invite
      ? {
          id: invite.id,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt.toISOString(),
        }
      : null,
  };
}

export async function createProfileInvitation(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId?: string; studentId?: string }
): Promise<InvitationAccessView & { inviteUrl: string; rawToken: string }> {
  requireRoles(ctx, ["director"]);
  if (Boolean(input.teacherId) === Boolean(input.studentId)) {
    throw badRequest("Укажите teacherId или studentId");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const rawToken = createInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const inviteId = newId("inv");

  if (input.teacherId) {
    const [teacher] = await db
      .select()
      .from(teachers)
      .where(
        and(
          eq(teachers.id, input.teacherId),
          eq(teachers.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!teacher) throw notFound("Преподаватель не найден");
    if (teacher.userId) {
      throw conflict("У профиля преподавателя уже есть аккаунт");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(accountInvitations)
        .set({ revokedAt: now })
        .where(
          and(
            eq(accountInvitations.organizationId, ctx.organizationId),
            eq(accountInvitations.teacherId, teacher.id),
            isNull(accountInvitations.usedAt),
            isNull(accountInvitations.revokedAt)
          )
        );

      await tx.insert(accountInvitations).values({
        id: inviteId,
        organizationId: ctx.organizationId,
        kind: "teacher",
        teacherId: teacher.id,
        studentId: null,
        tokenHash,
        createdByUserId: ctx.userId,
        expiresAt,
      });
    });
  } else {
    const studentId = input.studentId!;
    const [student] = await db
      .select()
      .from(students)
      .where(
        and(
          eq(students.id, studentId),
          eq(students.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!student) throw notFound("Ученик не найден");
    if (student.userId) {
      throw conflict("У профиля ученика уже есть аккаунт");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(accountInvitations)
        .set({ revokedAt: now })
        .where(
          and(
            eq(accountInvitations.organizationId, ctx.organizationId),
            eq(accountInvitations.studentId, student.id),
            isNull(accountInvitations.usedAt),
            isNull(accountInvitations.revokedAt)
          )
        );

      await tx.insert(accountInvitations).values({
        id: inviteId,
        organizationId: ctx.organizationId,
        kind: "student",
        teacherId: null,
        studentId: student.id,
        tokenHash,
        createdByUserId: ctx.userId,
        expiresAt,
      });
    });
  }

  return {
    accessStatus: "invited",
    accountEmail: null,
    invitation: {
      id: inviteId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    },
    inviteUrl: buildInviteUrl(rawToken),
    rawToken,
  };
}

export async function revokeProfileInvitation(
  db: AppDb,
  ctx: AuthContext,
  invitationId: string
): Promise<InvitationAccessView> {
  requireRoles(ctx, ["director"]);
  const [invite] = await db
    .select()
    .from(accountInvitations)
    .where(
      and(
        eq(accountInvitations.id, invitationId),
        eq(accountInvitations.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!invite) throw notFound("Приглашение не найдено");
  if (invite.usedAt) throw conflict("Приглашение уже использовано");
  if (!invite.revokedAt) {
    await db
      .update(accountInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(accountInvitations.id, invite.id));
  }

  return getProfileAccessStatus(db, ctx, {
    teacherId: invite.teacherId ?? undefined,
    studentId: invite.studentId ?? undefined,
  });
}

export async function getPublicInvitation(
  db: AppDb,
  rawToken: string
): Promise<PublicInvitationView> {
  const token = rawToken.trim();
  if (!token || token.length > 200) {
    throw notFound("Приглашение не найдено");
  }
  const tokenHash = hashInviteToken(token);
  const [row] = await db
    .select({
      kind: accountInvitations.kind,
      usedAt: accountInvitations.usedAt,
      revokedAt: accountInvitations.revokedAt,
      expiresAt: accountInvitations.expiresAt,
      organizationId: accountInvitations.organizationId,
      teacherId: accountInvitations.teacherId,
      studentId: accountInvitations.studentId,
      orgName: organizations.name,
    })
    .from(accountInvitations)
    .innerJoin(
      organizations,
      eq(accountInvitations.organizationId, organizations.id)
    )
    .where(eq(accountInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw notFound("Приглашение не найдено");

  let inviteeName = "";
  if (row.kind === "teacher" && row.teacherId) {
    const [t] = await db
      .select({ fullName: teachers.fullName })
      .from(teachers)
      .where(eq(teachers.id, row.teacherId))
      .limit(1);
    inviteeName = t?.fullName ?? "";
  } else if (row.studentId) {
    const [s] = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(eq(students.id, row.studentId))
      .limit(1);
    inviteeName = s?.fullName ?? "";
  }

  const kind = row.kind === "teacher" ? "teacher" : "student";
  return {
    status: invitationPublicStatus(row),
    kind,
    organizationName: row.orgName,
    inviteeName,
    cabinetLabel: kind === "teacher" ? "Кафедра" : "Аудитория",
  };
}

export type AcceptInvitationInput = {
  rawToken: string;
  email: string;
  password: string;
  passwordConfirm: string;
  userAgent?: string | null;
  ip?: string | null;
};

export async function acceptInvitation(db: AppDb, input: AcceptInvitationInput) {
  assertPasswordsMatch(input.password, input.passwordConfirm);
  const email = normalizeEmail(input.email);
  await assertInviteAcceptNotRateLimited(db, { ip: input.ip });

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    await recordInviteAttempt(db, {
      ip: input.ip,
      success: false,
      email,
    });
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  const tokenHash = hashInviteToken(input.rawToken.trim());
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const txDb = tx as unknown as AppDb;
      const [invite] = await txDb
        .select()
        .from(accountInvitations)
        .where(eq(accountInvitations.tokenHash, tokenHash))
        .limit(1);

      if (!invite) throw notFound("Приглашение не найдено");
      if (invite.usedAt) throw conflict("Приглашение уже использовано");
      if (invite.revokedAt) throw forbidden("Приглашение отозвано");
      if (invite.expiresAt.getTime() <= now.getTime()) {
        throw forbidden("Срок действия приглашения истёк");
      }

      const [existingEmail] = await txDb
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingEmail) {
        throw conflict("Пользователь с таким email уже зарегистрирован");
      }

      let fullName = "";
      if (invite.kind === "teacher") {
        if (!invite.teacherId) throw badRequest("Некорректное приглашение");
        const [teacher] = await txDb
          .select()
          .from(teachers)
          .where(
            and(
              eq(teachers.id, invite.teacherId),
              eq(teachers.organizationId, invite.organizationId)
            )
          )
          .limit(1);
        if (!teacher) throw notFound("Профиль преподавателя не найден");
        if (teacher.userId) {
          throw conflict("У профиля преподавателя уже есть аккаунт");
        }
        fullName = teacher.fullName;
      } else {
        if (!invite.studentId) throw badRequest("Некорректное приглашение");
        const [student] = await txDb
          .select()
          .from(students)
          .where(
            and(
              eq(students.id, invite.studentId),
              eq(students.organizationId, invite.organizationId)
            )
          )
          .limit(1);
        if (!student) throw notFound("Профиль ученика не найден");
        if (student.userId) {
          throw conflict("У профиля ученика уже есть аккаунт");
        }
        fullName = student.fullName;
      }

      const userId = newId("user");
      await txDb.insert(users).values({
        id: userId,
        email,
        passwordHash,
        fullName,
        status: "active",
      });

      // Роль только из приглашения — клиент не выбирает.
      const role = invite.kind === "teacher" ? "teacher" : "student";
      await txDb.insert(memberships).values({
        id: newId("mem"),
        organizationId: invite.organizationId,
        userId,
        role,
      });

      if (invite.kind === "teacher" && invite.teacherId) {
        const linked = await txDb
          .update(teachers)
          .set({
            userId,
            email,
            updatedAt: now,
          })
          .where(
            and(
              eq(teachers.id, invite.teacherId),
              isNull(teachers.userId)
            )
          )
          .returning();
        if (linked.length === 0) {
          throw conflict("У профиля преподавателя уже есть аккаунт");
        }
      } else if (invite.studentId) {
        const linked = await txDb
          .update(students)
          .set({
            userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(students.id, invite.studentId),
              isNull(students.userId)
            )
          )
          .returning();
        if (linked.length === 0) {
          throw conflict("У профиля ученика уже есть аккаунт");
        }
      }

      const claimed = await txDb
        .update(accountInvitations)
        .set({
          usedAt: now,
          usedByUserId: userId,
        })
        .where(
          and(
            eq(accountInvitations.id, invite.id),
            isNull(accountInvitations.usedAt),
            isNull(accountInvitations.revokedAt),
            gt(accountInvitations.expiresAt, now)
          )
        )
        .returning();

      if (claimed.length === 0) {
        throw conflict("Приглашение уже использовано или недоступно");
      }

      return {
        userId,
        email,
        fullName,
        role: role as "teacher" | "student",
        teacherId: invite.teacherId,
        studentId: invite.studentId,
        organizationId: invite.organizationId,
      };
    });

    await recordInviteAttempt(db, {
      ip: input.ip,
      success: true,
      email,
    });

    const session = await createSession(db, {
      userId: result.userId,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    return {
      user: {
        id: result.userId,
        email: result.email,
        fullName: result.fullName,
      },
      role: result.role,
      teacherId: result.teacherId,
      studentId: result.studentId,
      organizationId: result.organizationId,
      session,
    };
  } catch (err) {
    await recordInviteAttempt(db, {
      ip: input.ip,
      success: false,
      email,
    }).catch(() => undefined);
    throw err;
  }
}
