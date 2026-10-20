import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  applyManualScores,
  gradeSubmission,
} from "@/lib/tests/grading";
import type { StudentAnswer } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  assertStudentOwnsAssignment,
  assertTeacherOwnsAssignment,
  loadAssignmentInOrg,
  requireStudentProfile,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  assignmentAnswers,
  assignmentSnapshots,
  gradeEvents,
  testAnswerKeys,
  testAssignments,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import {
  mergeQuestionsWithKeys,
  stripQuestionKeys,
} from "@/server/services/question-merge";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function num(n?: number | null) {
  return n == null ? null : String(n);
}

function answersFromRows(
  rows: {
    questionId: string;
    payload: Record<string, unknown>;
    autoScore: string | null;
    manualScore: string | null;
    needsManualReview: boolean;
    isCorrect: boolean | null;
    teacherComment: string | null;
  }[]
): StudentAnswer[] {
  return rows.map((r) => ({
    questionId: r.questionId,
    selectedOptionIds: (r.payload.selectedOptionIds as string[]) ?? [],
    textAnswer: (r.payload.textAnswer as string) ?? "",
    matching: (r.payload.matching as Record<string, string>) ?? {},
    order: (r.payload.order as string[]) ?? [],
    autoScore: r.autoScore != null ? Number(r.autoScore) : undefined,
    manualScore: r.manualScore != null ? Number(r.manualScore) : undefined,
    needsManualReview: r.needsManualReview,
    isCorrect: r.isCorrect,
    teacherComment: r.teacherComment ?? undefined,
  }));
}

async function loadSnapshot(db: AppDb, assignmentId: string) {
  const [snap] = await db
    .select()
    .from(assignmentSnapshots)
    .where(eq(assignmentSnapshots.assignmentId, assignmentId))
    .limit(1);
  if (!snap) throw notFound("Снимок теста не найден");
  return snap;
}

/** Ответ ученику: без ключей. Преподавателю/директору — с ключами по роли. */
export async function getAssignmentForViewer(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string
) {
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  const snap = await loadSnapshot(db, assignmentId);
  const answerRows = await db
    .select()
    .from(assignmentAnswers)
    .where(eq(assignmentAnswers.assignmentId, assignmentId));

  const isOwnerStudent =
    ctx.role === "student" && ctx.studentId === assignment.studentId;
  const isOwnerTeacher =
    ctx.role === "teacher" && ctx.teacherId === assignment.teacherId;
  const isDirector = ctx.role === "director";

  if (!isOwnerStudent && !isOwnerTeacher && !isDirector) {
    throw forbidden();
  }

  const includeKeys =
    isOwnerTeacher || isDirector || assignment.status === "reviewed";

  const questions = includeKeys
    ? mergeQuestionsWithKeys(
        snap.questions,
        snap.answerKeys as Record<string, unknown>
      )
    : stripQuestionKeys(snap.questions);

  // Даже при reviewed ученику не отдаём сырой answerKeys blob отдельно
  return {
    assignment: {
      id: assignment.id,
      testId: assignment.testId,
      topicId: assignment.topicId,
      teacherId: assignment.teacherId,
      studentId: assignment.studentId,
      lessonId: assignment.lessonId,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      status: assignment.status,
      score: assignment.score != null ? Number(assignment.score) : null,
      maxScore: assignment.maxScore != null ? Number(assignment.maxScore) : null,
      feedback: assignment.feedback,
      completedAt: assignment.completedAt?.toISOString() ?? null,
      reviewedAt: assignment.reviewedAt?.toISOString() ?? null,
    },
    snapshot: {
      title: snap.title,
      description: snap.description,
      maxScore: Number(snap.maxScore),
      questions,
      // Ключи только преподавателю/директору — никогда ученику до политики
      answerKeys:
        isOwnerTeacher || isDirector
          ? snap.answerKeys
          : undefined,
    },
    answers: answersFromRows(answerRows),
  };
}

export async function saveDraft(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string,
  answers: StudentAnswer[]
) {
  await requireStudentProfile(ctx);
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  assertStudentOwnsAssignment(ctx, assignment);

  if (
    assignment.status === "completed" ||
    assignment.status === "reviewed"
  ) {
    throw conflict("Отправленное задание нельзя изменить");
  }

  await replaceAnswers(db, assignmentId, answers);

  const status =
    assignment.status === "overdue" ? "overdue" : "in_progress";

  await db
    .update(testAssignments)
    .set({ status, updatedAt: new Date() })
    .where(eq(testAssignments.id, assignmentId));

  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "draft_saved",
    actorUserId: ctx.userId,
    payload: { answersCount: answers.length },
  });

  return { ok: true as const, status };
}

export async function submitAssignment(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string,
  answers: StudentAnswer[]
) {
  await requireStudentProfile(ctx);
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  assertStudentOwnsAssignment(ctx, assignment);

  if (
    assignment.status === "completed" ||
    assignment.status === "reviewed"
  ) {
    throw conflict("Работа уже отправлена");
  }

  const snap = await loadSnapshot(db, assignmentId);
  const questions = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );
  if (questions.length === 0) {
    throw badRequest("В тесте нет заданий");
  }

  const graded = gradeSubmission(questions, answers);
  const status = graded.needsManualReview ? "completed" : "reviewed";
  const now = new Date();

  await replaceAnswers(db, assignmentId, graded.answers);

  await db
    .update(testAssignments)
    .set({
      status,
      score: graded.needsManualReview ? null : num(graded.autoScore),
      maxScore: num(graded.maxScore),
      completedAt: now,
      reviewedAt: status === "reviewed" ? now : null,
      updatedAt: now,
    })
    .where(eq(testAssignments.id, assignmentId));

  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "submitted",
    actorUserId: ctx.userId,
    payload: { status },
  });
  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "auto_graded",
    actorUserId: ctx.userId,
    payload: {
      autoScore: graded.autoScore,
      needsManualReview: graded.needsManualReview,
    },
  });

  return {
    ok: true as const,
    status,
    score: graded.needsManualReview ? null : graded.autoScore,
    maxScore: graded.maxScore,
    needsManualReview: graded.needsManualReview,
  };
}

export async function reviewAssignment(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string,
  updates: {
    questionId: string;
    manualScore: number;
    teacherComment?: string;
  }[],
  overallFeedback?: string
) {
  await requireTeacherProfile(ctx);
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  assertTeacherOwnsAssignment(ctx, assignment);

  const snap = await loadSnapshot(db, assignmentId);
  const answerRows = await db
    .select()
    .from(assignmentAnswers)
    .where(eq(assignmentAnswers.assignmentId, assignmentId));

  const questions = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );

  const currentAnswers = answersFromRows(answerRows);
  const pseudo = {
    id: assignment.id,
    homeworkId: assignment.testId,
    topicId: assignment.topicId,
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    status: assignment.status as
      | "assigned"
      | "in_progress"
      | "completed"
      | "reviewed"
      | "overdue",
    score: assignment.score != null ? Number(assignment.score) : undefined,
    maxScore:
      assignment.maxScore != null ? Number(assignment.maxScore) : undefined,
    feedback: assignment.feedback ?? undefined,
    testSnapshot: {
      title: snap.title,
      description: snap.description ?? undefined,
      questions,
      maxScore: Number(snap.maxScore),
    },
    answers: currentAnswers,
  };

  const next = applyManualScores(pseudo, updates, overallFeedback);
  await replaceAnswers(db, assignmentId, next.answers ?? []);

  await db
    .update(testAssignments)
    .set({
      status: next.status,
      score: num(next.score),
      maxScore: num(next.maxScore),
      feedback: next.feedback ?? null,
      reviewedAt: next.reviewedAt ? new Date(next.reviewedAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(testAssignments.id, assignmentId));

  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "reviewed",
    actorUserId: ctx.userId,
    payload: { score: next.score, status: next.status },
  });

  return {
    ok: true as const,
    status: next.status,
    score: next.score ?? null,
  };
}

async function replaceAnswers(
  db: AppDb,
  assignmentId: string,
  answers: StudentAnswer[]
) {
  await db
    .delete(assignmentAnswers)
    .where(eq(assignmentAnswers.assignmentId, assignmentId));

  if (answers.length === 0) return;

  await db.insert(assignmentAnswers).values(
    answers.map((a) => ({
      id: newId("ans"),
      assignmentId,
      questionId: a.questionId,
      payload: {
        selectedOptionIds: a.selectedOptionIds ?? [],
        textAnswer: a.textAnswer ?? "",
        matching: a.matching ?? {},
        order: a.order ?? [],
      },
      autoScore: num(a.autoScore),
      manualScore: num(a.manualScore),
      needsManualReview: Boolean(a.needsManualReview),
      isCorrect: a.isCorrect ?? null,
      teacherComment: a.teacherComment ?? null,
    }))
  );
}

/** Ученик не должен получить ключи шаблона теста. */
export async function getTestForViewer(
  db: AppDb,
  ctx: AuthContext,
  testId: string
) {
  const [test] = await db
    .select()
    .from(tests)
    .where(
      and(eq(tests.id, testId), eq(tests.organizationId, ctx.organizationId))
    )
    .limit(1);
  if (!test) throw notFound("Тест не найден");

  const isTeacherOwner =
    ctx.role === "teacher" && ctx.teacherId === test.teacherId;
  const isDirector = ctx.role === "director";

  if (!isTeacherOwner && !isDirector && ctx.role !== "student") {
    throw forbidden();
  }

  // Студент видит только published и только публичные вопросы
  if (ctx.role === "student") {
    if (test.status !== "published") throw forbidden();
    return {
      id: test.id,
      topicId: test.topicId,
      teacherId: test.teacherId,
      title: test.title,
      description: test.description,
      status: test.status,
      maxScore: test.maxScore != null ? Number(test.maxScore) : null,
      questions: stripQuestionKeys(test.questionsPublic as unknown[]),
    };
  }

  const keys = await db
    .select()
    .from(testAnswerKeys)
    .where(eq(testAnswerKeys.testId, testId));

  return {
    id: test.id,
    topicId: test.topicId,
    teacherId: test.teacherId,
    title: test.title,
    description: test.description,
    status: test.status,
    maxScore: test.maxScore != null ? Number(test.maxScore) : null,
    questions: test.questionsPublic,
    answerKeys: Object.fromEntries(
      keys.map((k) => [k.questionId, k.payload])
    ),
  };
}
