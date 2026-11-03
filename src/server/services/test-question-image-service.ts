import { and, eq } from "drizzle-orm";

import { canManageSchoolKnowledgeBase } from "@/lib/auth/school-knowledge";
import type { TestQuestion } from "@/lib/types";
import {
  sniffQuestionImage,
  type QuestionImageMime,
} from "@/lib/tests/question-image";
import type { AuthContext } from "@/server/authz/context";
import { assertDirectorSeesTeacher, requireRoles } from "@/server/authz/require";
import { testAssignments, tests } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound } from "@/server/errors";
import {
  deleteTestQuestionObject,
  getTestQuestionObject,
  putTestQuestionObject,
  testQuestionObjectKey,
} from "@/server/media/test-question-storage";

function questionsFromRow(row: { questionsPublic: unknown }): TestQuestion[] {
  return (row.questionsPublic as TestQuestion[]) ?? [];
}

async function loadTest(db: AppDb, organizationId: string, testId: string) {
  const [row] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.id, testId), eq(tests.organizationId, organizationId)))
    .limit(1);
  if (!row) throw notFound("Тест не найден");
  return row;
}

async function assertCanManageTest(db: AppDb, ctx: AuthContext, testId: string) {
  requireRoles(ctx, ["teacher", "director", "assistant"]);
  const row = await loadTest(db, ctx.organizationId, testId);
  if (row.libraryScope === "school") {
    if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
  } else if (ctx.role === "teacher") {
    if (!ctx.teacherId || row.teacherId !== ctx.teacherId) throw forbidden();
  } else if (row.teacherId) {
    await assertDirectorSeesTeacher(db, ctx, row.teacherId);
  }
  return row;
}

async function studentCanViewTest(
  db: AppDb,
  ctx: AuthContext,
  testId: string
): Promise<boolean> {
  if (ctx.role !== "student" || !ctx.studentId) return false;
  const [row] = await db
    .select({ id: testAssignments.id })
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.organizationId, ctx.organizationId),
        eq(testAssignments.studentId, ctx.studentId),
        eq(testAssignments.testId, testId)
      )
    )
    .limit(1);
  return Boolean(row);
}

async function teacherCanViewTest(
  db: AppDb,
  ctx: AuthContext,
  testId: string
): Promise<boolean> {
  if (ctx.role !== "teacher" || !ctx.teacherId) return false;
  const row = await loadTest(db, ctx.organizationId, testId);
  if (row.teacherId === ctx.teacherId) return true;
  const [assigned] = await db
    .select({ id: testAssignments.id })
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.organizationId, ctx.organizationId),
        eq(testAssignments.teacherId, ctx.teacherId),
        eq(testAssignments.testId, testId)
      )
    )
    .limit(1);
  return Boolean(assigned);
}

async function resolveQuestionImageKey(
  db: AppDb,
  ctx: AuthContext,
  testId: string,
  questionId: string
): Promise<{ key: string; mime: QuestionImageMime }> {
  const row = await loadTest(db, ctx.organizationId, testId);
  const question = questionsFromRow(row).find((q) => q.id === questionId);
  const key = question?.imageObjectKey?.trim();
  if (!key) throw notFound("Изображение не найдено");

  let allowed = false;
  try {
    await assertCanManageTest(db, ctx, testId);
    allowed = true;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    const canView =
      (await studentCanViewTest(db, ctx, testId)) ||
      (await teacherCanViewTest(db, ctx, testId)) ||
      (ctx.role === "director" && row.organizationId === ctx.organizationId) ||
      (ctx.role === "assistant" && row.organizationId === ctx.organizationId);
    if (!canView) throw forbidden();
  }

  const ext = key.split(".").pop()?.toLowerCase();
  const mime: QuestionImageMime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";
  return { key, mime };
}

export async function uploadTestQuestionImage(
  db: AppDb,
  ctx: AuthContext,
  testId: string,
  questionId: string,
  file: { bytes: Buffer; filename: string }
) {
  const row = await assertCanManageTest(db, ctx, testId);
  const questions = questionsFromRow(row);
  if (!questions.some((q) => q.id === questionId)) {
    throw badRequest("Вопрос не найден в этом тесте");
  }
  const mime = sniffQuestionImage(file.bytes, file.filename);
  const previous = questions.find((q) => q.id === questionId)?.imageObjectKey;
  const objectKey = testQuestionObjectKey(
    ctx.organizationId,
    testId,
    questionId,
    mime
  );
  await putTestQuestionObject(objectKey, file.bytes, mime);
  if (previous && previous !== objectKey) {
    await deleteTestQuestionObject(previous).catch(() => undefined);
  }
  return { imageObjectKey: objectKey, mimeType: mime };
}

export async function deleteTestQuestionImage(
  db: AppDb,
  ctx: AuthContext,
  testId: string,
  questionId: string
) {
  await assertCanManageTest(db, ctx, testId);
  const row = await loadTest(db, ctx.organizationId, testId);
  const questions = questionsFromRow(row);
  const question = questions.find((q) => q.id === questionId);
  const key = question?.imageObjectKey;
  if (key) {
    await deleteTestQuestionObject(key).catch(() => undefined);
  }
  return { ok: true as const };
}

export async function getTestQuestionImage(
  db: AppDb,
  ctx: AuthContext,
  testId: string,
  questionId: string
) {
  const { key, mime } = await resolveQuestionImageKey(db, ctx, testId, questionId);
  const bytes = await getTestQuestionObject(key);
  return { bytes, mimeType: mime };
}

export async function collectOrphanQuestionImageKeys(
  db: AppDb,
  organizationId: string,
  previous: TestQuestion[],
  next: TestQuestion[]
): Promise<string[]> {
  const nextKeys = new Set(
    next.map((q) => q.imageObjectKey).filter((k): k is string => Boolean(k))
  );
  const removed = previous
    .map((q) => q.imageObjectKey)
    .filter((k): k is string => Boolean(k && !nextKeys.has(k)));
  if (!removed.length) return [];

  const rows = await db
    .select({ questionsPublic: tests.questionsPublic })
    .from(tests)
    .where(eq(tests.organizationId, organizationId));
  const stillUsed = new Set<string>();
  for (const row of rows) {
    for (const q of questionsFromRow(row)) {
      if (q.imageObjectKey) stillUsed.add(q.imageObjectKey);
    }
  }
  return removed.filter((k) => !stillUsed.has(k));
}

export async function copyTestQuestionImages(
  db: AppDb,
  organizationId: string,
  sourceTestId: string,
  targetTestId: string,
  questions: TestQuestion[]
): Promise<TestQuestion[]> {
  const out: TestQuestion[] = [];
  for (const q of questions) {
    const key = q.imageObjectKey?.trim();
    if (!key) {
      out.push(q);
      continue;
    }
    const bytes = await getTestQuestionObject(key);
    const ext = key.split(".").pop()?.toLowerCase();
    const mime: QuestionImageMime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    const nextKey = testQuestionObjectKey(
      organizationId,
      targetTestId,
      q.id,
      mime
    );
    await putTestQuestionObject(nextKey, bytes, mime);
    out.push({ ...q, imageObjectKey: nextKey });
  }
  return out;
}
