import { and, eq } from "drizzle-orm";

import { unauthorized } from "@/server/errors";
import { findValidSessionUser } from "@/server/auth/session";
import {
  memberships,
  students,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export type MembershipRole = "director" | "teacher" | "student";

export type AuthContext = {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: MembershipRole;
  /** Профиль преподавателя в текущей org, если role=teacher */
  teacherId: string | null;
  /** Профиль ученика в текущей org, если role=student */
  studentId: string | null;
  sessionId: string;
};

/**
 * Строит контекст из cookie-токена.
 * organizationId берётся из membership (не из клиента).
 * При нескольких membership — используем первую активную; позже можно выбрать org явно.
 */
export async function resolveAuthContext(
  db: AppDb,
  rawToken: string | undefined | null,
  preferredOrganizationId?: string | null
): Promise<AuthContext> {
  if (!rawToken) throw unauthorized();

  const sessionUser = await findValidSessionUser(db, rawToken);
  if (!sessionUser) throw unauthorized("Сессия недействительна или истекла");
  if (sessionUser.status !== "active") {
    throw unauthorized("Учётная запись отключена");
  }

  const memRows = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, sessionUser.userId));

  if (memRows.length === 0) {
    throw unauthorized("Нет доступа к организации");
  }

  const membership =
    (preferredOrganizationId
      ? memRows.find((m) => m.organizationId === preferredOrganizationId)
      : null) ?? memRows[0]!;

  const role = membership.role as MembershipRole;

  let teacherId: string | null = null;
  let studentId: string | null = null;

  if (role === "teacher") {
    const [t] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(
        and(
          eq(teachers.organizationId, membership.organizationId),
          eq(teachers.userId, sessionUser.userId)
        )
      )
      .limit(1);
    teacherId = t?.id ?? null;
  }

  if (role === "student") {
    const [s] = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.organizationId, membership.organizationId),
          eq(students.userId, sessionUser.userId)
        )
      )
      .limit(1);
    studentId = s?.id ?? null;
  }

  return {
    userId: sessionUser.userId,
    email: sessionUser.email,
    fullName: sessionUser.fullName,
    organizationId: membership.organizationId,
    role,
    teacherId,
    studentId,
    sessionId: sessionUser.sessionId,
  };
}
