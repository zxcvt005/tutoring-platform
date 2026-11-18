import { and, asc, eq } from "drizzle-orm";

import {
  type GraphicsTabletRow,
  type GraphicsTabletStatus,
  isGraphicsTabletStatus,
} from "@/lib/graphics-tablets";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  studentGraphicsTablets,
  students,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, notFound, validationError } from "@/server/errors";

const MAX_ADDRESS = 2000;

function requireTableEditor(ctx: AuthContext) {
  requireRoles(ctx, ["press"]);
}

function toRow(
  student: typeof students.$inferSelect,
  tablet: typeof studentGraphicsTablets.$inferSelect | null
): GraphicsTabletRow {
  return {
    studentId: student.id,
    studentFullName: student.fullName,
    studentStatus: student.status as GraphicsTabletRow["studentStatus"],
    trialCompleted: tablet?.trialCompleted ?? false,
    address: tablet?.address ?? "",
    tabletStatus: isGraphicsTabletStatus(tablet?.tabletStatus)
      ? tablet!.tabletStatus
      : "not_needed",
    updatedAt: tablet?.updatedAt.toISOString() ?? null,
  };
}

function sanitizeAddress(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw validationError("Адрес: ожидается текст");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ADDRESS) {
    throw validationError("Адрес: слишком длинное значение");
  }
  return trimmed;
}

function parseTabletStatus(value: unknown): GraphicsTabletStatus {
  if (!isGraphicsTabletStatus(value)) {
    throw validationError("Недопустимый статус планшета");
  }
  return value;
}

function sameInstant(a: Date, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return a.getTime() === t;
}

/**
 * Все ученики организации + ручные поля планшетов (LEFT JOIN).
 * Новые ученики появляются автоматически без отдельной записи.
 */
export async function listGraphicsTablets(
  db: AppDb,
  ctx: AuthContext
): Promise<GraphicsTabletRow[]> {
  requireTableEditor(ctx);
  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, ctx.organizationId))
    .orderBy(asc(students.fullName));

  const tabletRows = await db
    .select()
    .from(studentGraphicsTablets)
    .where(eq(studentGraphicsTablets.organizationId, ctx.organizationId));
  const byStudent = new Map(tabletRows.map((r) => [r.studentId, r]));

  return studentRows.map((s) => toRow(s, byStudent.get(s.id) ?? null));
}

export type UpdateGraphicsTabletInput = {
  studentId: string;
  /** ISO updatedAt; null/"" — ещё не было строки в БД */
  expectedUpdatedAt: string | null;
  trialCompleted?: boolean;
  address?: string;
  tabletStatus?: GraphicsTabletStatus | string;
};

export async function updateGraphicsTablet(
  db: AppDb,
  ctx: AuthContext,
  input: UpdateGraphicsTabletInput
): Promise<GraphicsTabletRow> {
  requireTableEditor(ctx);
  const studentId = String(input.studentId ?? "").trim();
  if (!studentId) throw validationError("Укажите ученика");

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

  const [existing] = await db
    .select()
    .from(studentGraphicsTablets)
    .where(eq(studentGraphicsTablets.studentId, studentId))
    .limit(1);

  const expected = input.expectedUpdatedAt?.trim() || null;
  if (existing) {
    if (!expected || !sameInstant(existing.updatedAt, expected)) {
      throw conflict("Запись изменена на другом устройстве");
    }
  } else if (expected) {
    throw conflict("Запись изменена на другом устройстве");
  }

  const now = new Date();
  const nextTrial =
    input.trialCompleted === undefined
      ? (existing?.trialCompleted ?? false)
      : Boolean(input.trialCompleted);
  const nextAddress =
    input.address === undefined
      ? (existing?.address ?? "")
      : sanitizeAddress(input.address);
  const nextStatus =
    input.tabletStatus === undefined
      ? (isGraphicsTabletStatus(existing?.tabletStatus)
          ? existing!.tabletStatus
          : "not_needed")
      : parseTabletStatus(input.tabletStatus);

  if (existing) {
    await db
      .update(studentGraphicsTablets)
      .set({
        trialCompleted: nextTrial,
        address: nextAddress,
        tabletStatus: nextStatus,
        updatedAt: now,
      })
      .where(eq(studentGraphicsTablets.studentId, studentId));
  } else {
    await db.insert(studentGraphicsTablets).values({
      studentId,
      organizationId: ctx.organizationId,
      trialCompleted: nextTrial,
      address: nextAddress,
      tabletStatus: nextStatus,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [saved] = await db
    .select()
    .from(studentGraphicsTablets)
    .where(eq(studentGraphicsTablets.studentId, studentId))
    .limit(1);
  if (!saved) throw new Error("Не удалось сохранить запись планшета");
  return toRow(student, saved);
}
