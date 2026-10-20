import { and, eq } from "drizzle-orm";

import type { AuthContext, MembershipRole } from "@/server/authz/context";
import { forbidden, notFound } from "@/server/errors";
import {
  students,
  teachers,
  testAssignments,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export function requireRoles(
  ctx: AuthContext,
  allowed: MembershipRole[]
): void {
  if (!allowed.includes(ctx.role)) {
    throw forbidden();
  }
}

export async function requireTeacherProfile(ctx: AuthContext): Promise<string> {
  requireRoles(ctx, ["teacher"]);
  if (!ctx.teacherId) throw forbidden("Профиль преподавателя не найден");
  return ctx.teacherId;
}

export async function requireStudentProfile(ctx: AuthContext): Promise<string> {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden("Профиль ученика не найден");
  return ctx.studentId;
}

export async function loadAssignmentInOrg(
  db: AppDb,
  organizationId: string,
  assignmentId: string
) {
  const [row] = await db
    .select()
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.id, assignmentId),
        eq(testAssignments.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Назначение не найдено");
  return row;
}

/** Ученик может работать только со своим назначением. */
export function assertStudentOwnsAssignment(
  ctx: AuthContext,
  assignment: { studentId: string }
) {
  if (ctx.role !== "student" || ctx.studentId !== assignment.studentId) {
    throw forbidden();
  }
}

/** Преподаватель — только со своими назначениями. */
export function assertTeacherOwnsAssignment(
  ctx: AuthContext,
  assignment: { teacherId: string }
) {
  if (ctx.role !== "teacher" || ctx.teacherId !== assignment.teacherId) {
    throw forbidden();
  }
}

export async function assertTeacherOwnsTest(
  db: AppDb,
  ctx: AuthContext,
  testId: string
) {
  const teacherId = await requireTeacherProfile(ctx);
  const [row] = await db
    .select({ id: tests.id, teacherId: tests.teacherId })
    .from(tests)
    .where(
      and(
        eq(tests.id, testId),
        eq(tests.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Тест не найден");
  if (row.teacherId !== teacherId) throw forbidden();
  return row;
}

export async function assertTeacherOwnsStudent(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  const teacherId = await requireTeacherProfile(ctx);
  const [row] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Ученик не найден");
  if (row.primaryTeacherId !== teacherId) throw forbidden();
  return row;
}

export async function assertDirectorSeesTeacher(
  db: AppDb,
  ctx: AuthContext,
  teacherId: string
) {
  requireRoles(ctx, ["director"]);
  const [row] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(
      and(
        eq(teachers.id, teacherId),
        eq(teachers.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Преподаватель не найден");
  return row;
}
