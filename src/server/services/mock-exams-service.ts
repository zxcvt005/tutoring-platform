import { and, eq, inArray } from "drizzle-orm";

import {
  compareMockExams,
  parseExamDate,
  parseExamDescription,
  parseExamTitle,
  parseTestScore,
} from "@/lib/mock-exams/records";
import { newId } from "@/lib/format";
import type { MockExam, MockExamResult } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  assertTeacherOwnsStudent,
  requireTeacherProfile,
} from "@/server/authz/require";
import { mockExamResults, mockExams, students } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound } from "@/server/errors";

type ExamRow = typeof mockExams.$inferSelect;
type ResultRow = typeof mockExamResults.$inferSelect;

function toExam(row: ExamRow, includeDescription: boolean): MockExam {
  return {
    id: row.id,
    teacherId: row.teacherId,
    title: row.title,
    date: row.examDate,
    description:
      includeDescription && row.description ? row.description : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toResult(row: ResultRow): MockExamResult {
  return {
    id: row.id,
    mockExamId: row.mockExamId,
    studentId: row.studentId,
    testScore: row.testScore,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sortExams(rows: MockExam[]): MockExam[] {
  return rows.slice().sort(compareMockExams);
}

export async function loadMockExamsForBootstrap(
  db: AppDb,
  ctx: AuthContext
): Promise<{ mockExams: MockExam[]; mockExamResults: MockExamResult[] }> {
  if (ctx.role === "press" || (ctx.role === "student" && !ctx.studentId)) {
    return { mockExams: [], mockExamResults: [] };
  }

  if (ctx.role === "student" && ctx.studentId) {
    const resultRows = await db
      .select()
      .from(mockExamResults)
      .where(
        and(
          eq(mockExamResults.organizationId, ctx.organizationId),
          eq(mockExamResults.studentId, ctx.studentId)
        )
      );
    const examIds = [...new Set(resultRows.map((row) => row.mockExamId))];
    const examRows =
      examIds.length > 0
        ? await db
            .select()
            .from(mockExams)
            .where(
              and(
                eq(mockExams.organizationId, ctx.organizationId),
                inArray(mockExams.id, examIds)
              )
            )
        : [];
    const allowed = new Set(examRows.map((row) => row.id));
    return {
      mockExams: sortExams(examRows.map((row) => toExam(row, false))),
      mockExamResults: resultRows
        .filter((row) => allowed.has(row.mockExamId))
        .map(toResult),
    };
  }

  if (ctx.role === "teacher") {
    if (!ctx.teacherId) return { mockExams: [], mockExamResults: [] };
    const examRows = await db
      .select()
      .from(mockExams)
      .where(
        and(
          eq(mockExams.organizationId, ctx.organizationId),
          eq(mockExams.teacherId, ctx.teacherId)
        )
      );
    const roster = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.organizationId, ctx.organizationId),
          eq(students.primaryTeacherId, ctx.teacherId)
        )
      );
    const examIds = examRows.map((row) => row.id);
    const studentIds = roster.map((row) => row.id);
    const resultRows =
      examIds.length > 0 && studentIds.length > 0
        ? await db
            .select()
            .from(mockExamResults)
            .where(
              and(
                eq(mockExamResults.organizationId, ctx.organizationId),
                inArray(mockExamResults.mockExamId, examIds),
                inArray(mockExamResults.studentId, studentIds)
              )
            )
        : [];
    return {
      mockExams: sortExams(examRows.map((row) => toExam(row, true))),
      mockExamResults: resultRows.map(toResult),
    };
  }

  if (ctx.role === "director") {
    const examRows = await db
      .select()
      .from(mockExams)
      .where(eq(mockExams.organizationId, ctx.organizationId));
    const resultRows = await db
      .select()
      .from(mockExamResults)
      .where(eq(mockExamResults.organizationId, ctx.organizationId));
    return {
      mockExams: sortExams(examRows.map((row) => toExam(row, true))),
      mockExamResults: resultRows.map(toResult),
    };
  }

  return { mockExams: [], mockExamResults: [] };
}

async function loadOwnExam(db: AppDb, ctx: AuthContext, examId: string) {
  const teacherId = await requireTeacherProfile(ctx);
  if (!examId) throw badRequest("Не указан пробник");
  const [row] = await db
    .select()
    .from(mockExams)
    .where(eq(mockExams.id, examId))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) {
    throw notFound("Пробник не найден");
  }
  if (row.teacherId !== teacherId) throw forbidden("Нельзя изменить чужой пробник");
  return row;
}

function readExamFields(input: Record<string, unknown>) {
  const title = parseExamTitle(input.title);
  if (!title.ok) throw badRequest(title.message);
  const date = parseExamDate(input.date);
  if (!date.ok) throw badRequest(date.message);
  const description = parseExamDescription(input.description);
  if (!description.ok) throw badRequest(description.message);
  return {
    title: title.value,
    examDate: date.value,
    description: description.value,
  };
}

export async function createMockExam(
  db: AppDb,
  ctx: AuthContext,
  input: Record<string, unknown>
) {
  const teacherId = await requireTeacherProfile(ctx);
  const fields = readExamFields(input);
  const now = new Date();
  const id = newId("mex");
  await db.insert(mockExams).values({
    id,
    organizationId: ctx.organizationId,
    teacherId,
    title: fields.title,
    examDate: fields.examDate,
    description: fields.description,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function updateMockExam(
  db: AppDb,
  ctx: AuthContext,
  input: Record<string, unknown>
) {
  const row = await loadOwnExam(db, ctx, String(input.id ?? ""));
  const fields = readExamFields(input);
  await db
    .update(mockExams)
    .set({
      title: fields.title,
      examDate: fields.examDate,
      description: fields.description,
      updatedAt: new Date(),
    })
    .where(eq(mockExams.id, row.id));
  return { id: row.id };
}

export async function deleteMockExam(
  db: AppDb,
  ctx: AuthContext,
  examId: string
) {
  const row = await loadOwnExam(db, ctx, examId);
  await db.delete(mockExams).where(eq(mockExams.id, row.id));
  return { id: row.id };
}

export async function setMockExamResult(
  db: AppDb,
  ctx: AuthContext,
  input: Record<string, unknown>
) {
  const exam = await loadOwnExam(db, ctx, String(input.mockExamId ?? ""));
  const studentId = String(input.studentId ?? "");
  if (!studentId) throw badRequest("Не указан ученик");
  await assertTeacherOwnsStudent(db, ctx, studentId);

  if (input.testScore === null) {
    await db
      .delete(mockExamResults)
      .where(
        and(
          eq(mockExamResults.mockExamId, exam.id),
          eq(mockExamResults.studentId, studentId)
        )
      );
    return { id: null };
  }

  const score = parseTestScore(input.testScore);
  if (!score.ok) throw badRequest(score.message);

  const [existing] = await db
    .select()
    .from(mockExamResults)
    .where(
      and(
        eq(mockExamResults.mockExamId, exam.id),
        eq(mockExamResults.studentId, studentId)
      )
    )
    .limit(1);
  const now = new Date();
  if (existing) {
    if (existing.organizationId !== ctx.organizationId) {
      throw forbidden();
    }
    await db
      .update(mockExamResults)
      .set({ testScore: score.value, updatedAt: now })
      .where(eq(mockExamResults.id, existing.id));
    return { id: existing.id };
  }

  const id = newId("mer");
  await db.insert(mockExamResults).values({
    id,
    organizationId: exam.organizationId,
    mockExamId: exam.id,
    studentId,
    testScore: score.value,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}
