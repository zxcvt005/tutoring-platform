import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { applyManualScores, computeFinalScore } from "@/lib/tests/grading";
import {
  attemptPercent,
  buildQuestionOutcomes,
  canRevealKeys,
  deriveAssignmentStatus,
  isQuestionAnswered,
  mergeLatestAnswers,
  retryQuestionIds,
  unansweredQuestionIds,
} from "@/lib/tests/attempts";
import { gradeSubmission } from "@/lib/tests/grading";
import type { HomeworkAssignmentStatus, StudentAnswer } from "@/lib/types";
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
  attemptAnswers,
  gradeEvents,
  testAnswerKeys,
  testAssignments,
  testAttempts,
  tests,
  theoryAssignments,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { recordChatSystemEventSafe } from "@/server/services/chat-events";
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

function stripClientScores(answers: StudentAnswer[]): StudentAnswer[] {
  return answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
    textAnswer: a.textAnswer,
    matching: a.matching,
    order: a.order,
  }));
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

async function assertTheoryTestReady(
  db: AppDb,
  assignment: { id: string; sourceKind?: string | null }
) {
  if (assignment.sourceKind !== "theory") return;
  const [row] = await db
    .select()
    .from(theoryAssignments)
    .where(eq(theoryAssignments.testAssignmentId, assignment.id))
    .limit(1);
  if (!row) throw notFound("Назначение теории не найдено");
  if (!row.viewedAt) {
    throw badRequest("Сначала отметьте просмотр ролика");
  }
}

async function syncTheoryAfterTest(
  db: AppDb,
  assignment: { id: string; sourceKind?: string | null },
  status: string
) {
  if (assignment.sourceKind !== "theory") return;
  const { syncTheoryProgressFromTest } = await import(
    "@/server/services/theory-service"
  );
  await syncTheoryProgressFromTest(db, assignment.id, status);
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

async function loadAttempts(db: AppDb, assignmentId: string) {
  const rows = await db
    .select()
    .from(testAttempts)
    .where(eq(testAttempts.assignmentId, assignmentId));
  const a1 = rows.find((r) => r.attemptNumber === 1) ?? null;
  const a2 = rows.find((r) => r.attemptNumber === 2) ?? null;
  return { a1, a2, rows };
}

async function loadAttemptAnswerMap(
  db: AppDb,
  attemptId: string | null
): Promise<StudentAnswer[]> {
  if (!attemptId) return [];
  const rows = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId));
  return answersFromRows(rows);
}

async function getOrCreateAttempt(
  db: AppDb,
  assignmentId: string,
  attemptNumber: 1 | 2
) {
  const [existing] = await db
    .select()
    .from(testAttempts)
    .where(
      and(
        eq(testAttempts.assignmentId, assignmentId),
        eq(testAttempts.attemptNumber, attemptNumber)
      )
    )
    .limit(1);
  if (existing) return existing;
  const id = newId("att");
  await db.insert(testAttempts).values({
    id,
    assignmentId,
    attemptNumber,
    status: "in_progress",
  });
  const [created] = await db
    .select()
    .from(testAttempts)
    .where(eq(testAttempts.id, id))
    .limit(1);
  return created!;
}

async function upsertAttemptAnswers(
  db: AppDb,
  attemptId: string,
  answers: StudentAnswer[]
) {
  for (const a of answers) {
    const [existing] = await db
      .select()
      .from(attemptAnswers)
      .where(
        and(
          eq(attemptAnswers.attemptId, attemptId),
          eq(attemptAnswers.questionId, a.questionId)
        )
      )
      .limit(1);
    const values = {
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
      updatedAt: new Date(),
    };
    if (existing) {
      await db
        .update(attemptAnswers)
        .set(values)
        .where(eq(attemptAnswers.id, existing.id));
    } else {
      await db.insert(attemptAnswers).values({
        id: newId("aa"),
        attemptId,
        questionId: a.questionId,
        ...values,
      });
    }
  }
}

async function syncAssignmentAnswers(
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

function pendingManual(
  questions: { type: string; id: string }[],
  answers: StudentAnswer[]
) {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return questions.some((q) => {
    if (q.type !== "essay") return false;
    const a = byId.get(q.id);
    return a != null && a.manualScore == null;
  });
}

/** Ответ ученику: без ключей до завершения второй попытки (или если второй не будет). */
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
  const { a1, a2 } = await loadAttempts(db, assignmentId);
  const attempt1Answers = await loadAttemptAnswerMap(db, a1?.id ?? null);
  const attempt2Answers = await loadAttemptAnswerMap(db, a2?.id ?? null);

  const isOwnerStudent =
    ctx.role === "student" && ctx.studentId === assignment.studentId;
  const isOwnerTeacher =
    ctx.role === "teacher" && ctx.teacherId === assignment.teacherId;
  const isDirector = ctx.role === "director";

  if (!isOwnerStudent && !isOwnerTeacher && !isDirector) {
    throw forbidden();
  }

  const questionsWithKeys = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );
  const retryIds = retryQuestionIds(questionsWithKeys, attempt1Answers);
  const reveal = canRevealKeys({
    attempt1Submitted: a1?.status === "submitted",
    attempt2Submitted: a2?.status === "submitted",
    retryCount: retryIds.length,
  });
  const includeKeys = isOwnerTeacher || isDirector || (isOwnerStudent && reveal);

  const questions = includeKeys
    ? questionsWithKeys
    : stripQuestionKeys(snap.questions);

  const bothDone = a2?.status === "submitted";
  const outcomes = buildQuestionOutcomes(
    questionsWithKeys,
    attempt1Answers,
    attempt2Answers,
    Boolean(bothDone)
  );

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
      attempt1Percent:
        assignment.attempt1Percent != null
          ? Number(assignment.attempt1Percent)
          : attemptPercent(questionsWithKeys, attempt1Answers),
      attempt2Percent:
        assignment.attempt2Percent != null
          ? Number(assignment.attempt2Percent)
          : attemptPercent(questionsWithKeys, attempt2Answers, retryIds),
      attempt1Submitted: a1?.status === "submitted",
      attempt2Submitted: a2?.status === "submitted",
      unansweredQuestionIds: unansweredQuestionIds(
        questionsWithKeys,
        attempt1Answers
      ),
      retryQuestionIds: retryIds,
      questionOutcomes: outcomes,
      revealKeys: includeKeys,
    },
    snapshot: {
      title: snap.title,
      description: snap.description,
      maxScore: Number(snap.maxScore),
      questions,
      answerKeys:
        isOwnerTeacher || isDirector ? snap.answerKeys : undefined,
    },
    answers: mergeLatestAnswers(
      questionsWithKeys,
      attempt1Answers,
      attempt2Answers
    ),
    attempt1Answers,
    attempt2Answers,
  };
}

export async function saveDraft(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string,
  answers: StudentAnswer[],
  attemptNumber: 1 | 2 = 1
) {
  await requireStudentProfile(ctx);
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  assertStudentOwnsAssignment(ctx, assignment);
  await assertTheoryTestReady(db, assignment);
  answers = stripClientScores(answers);

  if (assignment.status === "completed" || assignment.status === "reviewed") {
    throw conflict("Отправленное задание нельзя изменить");
  }
  if (attemptNumber !== 1 && attemptNumber !== 2) {
    throw badRequest("Доступны только две попытки");
  }

  const snap = await loadSnapshot(db, assignmentId);
  const questions = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );
  const { a1, a2 } = await loadAttempts(db, assignmentId);

  if (attemptNumber === 2 && a2?.status === "submitted") {
    throw conflict("Вторая попытка уже отправлена");
  }
  if (attemptNumber === 3 as never) {
    throw conflict("Третья попытка недоступна");
  }

  if (attemptNumber === 2) {
    if (a1?.status !== "submitted") {
      throw badRequest("Сначала завершите первую попытку");
    }
    const a1Answers = await loadAttemptAnswerMap(db, a1.id);
    const retryIds = new Set(retryQuestionIds(questions, a1Answers));
    if (retryIds.size === 0) {
      throw badRequest("Нет вопросов для второй попытки");
    }
    answers = answers.filter((a) => retryIds.has(a.questionId));
  }

  if (attemptNumber === 1 && a1?.status === "submitted") {
    const existing = await loadAttemptAnswerMap(db, a1.id);
    const locked = new Set(
      questions
        .filter((q) => isQuestionAnswered(q, existing.find((x) => x.questionId === q.id)))
        .map((q) => q.id)
    );
    answers = answers.filter((a) => !locked.has(a.questionId));
    if (answers.length === 0) {
      return { ok: true as const, status: assignment.status };
    }
  }

  const attempt = await getOrCreateAttempt(db, assignmentId, attemptNumber);
  if (attempt.status === "submitted" && attemptNumber === 2) {
    throw conflict("Вторая попытка уже отправлена");
  }

  await upsertAttemptAnswers(db, attempt.id, answers);

  const a1Now = attemptNumber === 1 ? attempt : a1;
  const a2Now = attemptNumber === 2 ? attempt : a2;
  const a1Answers = await loadAttemptAnswerMap(db, a1Now?.id ?? null);
  const a2Answers = await loadAttemptAnswerMap(db, a2Now?.id ?? null);
  await syncAssignmentAnswers(
    db,
    assignmentId,
    mergeLatestAnswers(questions, a1Answers, a2Answers)
  );

  const status: HomeworkAssignmentStatus =
    attemptNumber === 2
      ? "attempt2_in_progress"
      : a1Now?.status === "submitted"
        ? unansweredQuestionIds(questions, a1Answers).length > 0
          ? "remaining_questions"
          : "attempt1_submitted"
        : "in_progress";

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
    payload: { answersCount: answers.length, attemptNumber },
  });
  await syncTheoryAfterTest(db, assignment, status);

  return { ok: true as const, status };
}

export async function submitAssignment(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string,
  answers: StudentAnswer[],
  attemptNumber: 1 | 2 = 1
) {
  await requireStudentProfile(ctx);
  const assignment = await loadAssignmentInOrg(
    db,
    ctx.organizationId,
    assignmentId
  );
  assertStudentOwnsAssignment(ctx, assignment);
  await assertTheoryTestReady(db, assignment);
  answers = stripClientScores(answers);

  if (assignment.status === "completed" || assignment.status === "reviewed") {
    throw conflict("Работа уже отправлена");
  }
  if (attemptNumber !== 1 && attemptNumber !== 2) {
    throw conflict("Третья попытка недоступна");
  }

  const snap = await loadSnapshot(db, assignmentId);
  const questions = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );
  if (questions.length === 0) {
    throw badRequest("В тесте нет заданий");
  }

  const { a1, a2 } = await loadAttempts(db, assignmentId);

  if (attemptNumber === 1 && a1?.status === "submitted") {
    const existing = await loadAttemptAnswerMap(db, a1.id);
    const locked = new Set(
      questions
        .filter((q) =>
          isQuestionAnswered(q, existing.find((x) => x.questionId === q.id))
        )
        .map((q) => q.id)
    );
    const incoming = answers.filter((a) => !locked.has(a.questionId));
    if (incoming.length === 0) {
      throw conflict("Первая попытка уже отправлена");
    }
    answers = incoming;
  }

  if (attemptNumber === 2) {
    if (a1?.status !== "submitted") {
      throw badRequest("Сначала завершите первую попытку");
    }
    if (a2?.status === "submitted") {
      throw conflict("Вторая попытка уже отправлена");
    }
    const a1Answers = await loadAttemptAnswerMap(db, a1.id);
    const retryIds = new Set(retryQuestionIds(questions, a1Answers));
    if (retryIds.size === 0) {
      throw badRequest("Нет вопросов для второй попытки");
    }
    answers = answers.filter((a) => retryIds.has(a.questionId));
  }

  const attempt = await getOrCreateAttempt(db, assignmentId, attemptNumber);
  const existingAnswers = await loadAttemptAnswerMap(db, attempt.id);
  const mergedInput = mergeLatestAnswers(questions, existingAnswers, answers);
  const scopedQuestions =
    attemptNumber === 2
      ? questions.filter((q) => answers.some((a) => a.questionId === q.id) || existingAnswers.some((a) => a.questionId === q.id))
      : questions;
  const graded = gradeSubmission(
    attemptNumber === 2 ? scopedQuestions : questions,
    mergedInput
  );

  await upsertAttemptAnswers(db, attempt.id, graded.answers);
  await db
    .update(testAttempts)
    .set({
      status: "submitted",
      score: num(graded.autoScore),
      maxScore: num(graded.maxScore),
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(testAttempts.id, attempt.id));

  const a1Final =
    attemptNumber === 1
      ? { ...attempt, status: "submitted" as const, id: attempt.id }
      : a1;
  const a2Final =
    attemptNumber === 2
      ? { ...attempt, status: "submitted" as const, id: attempt.id }
      : a2;
  const a1Answers = await loadAttemptAnswerMap(db, a1Final?.id ?? null);
  const a2Answers = await loadAttemptAnswerMap(db, a2Final?.id ?? null);
  const latest = mergeLatestAnswers(questions, a1Answers, a2Answers);
  await syncAssignmentAnswers(db, assignmentId, latest);

  const retryIds = retryQuestionIds(questions, a1Answers);
  const unanswered = unansweredQuestionIds(questions, a1Answers);
  const a1Pct = attemptPercent(questions, a1Answers);
  const a2Pct = attemptPercent(questions, a2Answers, retryIds);
  const pending = pendingManual(questions, latest);
  const status = deriveAssignmentStatus({
    previous: assignment.status as HomeworkAssignmentStatus,
    attempt1Submitted: true,
    attempt2Submitted: a2Final?.status === "submitted",
    unansweredCount: unanswered.length,
    retryCount: retryIds.length,
    pendingManual: pending,
  });

  const finalScore = computeFinalScore(questions, latest);
  const now = new Date();
  const fullyDone =
    status === "completed" || status === "reviewed";

  await db
    .update(testAssignments)
    .set({
      status,
      score: finalScore.complete ? num(finalScore.score) : null,
      maxScore: num(graded.maxScore ?? Number(snap.maxScore)),
      attempt1Percent: num(a1Pct),
      attempt2Percent: num(a2Pct),
      completedAt: fullyDone ? now : assignment.completedAt,
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
    payload: { status, attemptNumber },
  });
  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "auto_graded",
    actorUserId: ctx.userId,
    payload: {
      autoScore: graded.autoScore,
      attemptNumber,
      needsManualReview: pending,
    },
  });

  if (assignment.sourceKind !== "theory") {
    if (status === "completed" && pending) {
      await recordChatSystemEventSafe(db, {
        organizationId: ctx.organizationId,
        studentId: assignment.studentId,
        teacherId: assignment.teacherId,
        eventType: "homework_awaiting_review",
        eventKey: `homework_awaiting_review:${assignmentId}`,
        title: "Домашнее задание ожидает проверки",
        assignmentId,
        homeworkTitle: snap.title,
      });
    } else if (status === "reviewed") {
      await recordChatSystemEventSafe(db, {
        organizationId: ctx.organizationId,
        studentId: assignment.studentId,
        teacherId: assignment.teacherId,
        eventType: "homework_completed",
        eventKey: `homework_completed:${assignmentId}`,
        title: "Домашнее задание выполнено",
        assignmentId,
        homeworkTitle: snap.title,
      });
    }
  }
  await syncTheoryAfterTest(db, assignment, status);

  return {
    ok: true as const,
    status,
    score: finalScore.complete ? finalScore.score : null,
    maxScore: Number(snap.maxScore),
    needsManualReview: pending,
    attempt1Percent: a1Pct,
    attempt2Percent: a2Pct,
    revealKeys: canRevealKeys({
      attempt1Submitted: true,
      attempt2Submitted: a2Final?.status === "submitted",
      retryCount: retryIds.length,
    }),
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
  const questions = mergeQuestionsWithKeys(
    snap.questions,
    snap.answerKeys as Record<string, unknown>
  );
  const { a1, a2 } = await loadAttempts(db, assignmentId);
  const attempt1Answers = await loadAttemptAnswerMap(db, a1?.id ?? null);
  const attempt2Answers = await loadAttemptAnswerMap(db, a2?.id ?? null);
  const currentAnswers = mergeLatestAnswers(
    questions,
    attempt1Answers,
    attempt2Answers
  );

  const pseudo = {
    id: assignment.id,
    homeworkId: assignment.testId,
    topicId: assignment.topicId ?? undefined,
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    status: assignment.status as HomeworkAssignmentStatus,
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
  const latest = next.answers ?? [];
  await syncAssignmentAnswers(db, assignmentId, latest);

  const targetAttempt = a2 ?? a1;
  if (targetAttempt) {
    await upsertAttemptAnswers(db, targetAttempt.id, latest);
  }

  const retryIds = retryQuestionIds(questions, attempt1Answers);
  const a1Pct = attemptPercent(questions, attempt1Answers);
  const a2ForPercent =
    attempt2Answers.length > 0
      ? latest.filter((a) => retryIds.includes(a.questionId))
      : attempt2Answers;
  const a2Pct = attemptPercent(questions, a2ForPercent, retryIds);

  await db
    .update(testAssignments)
    .set({
      status: next.status,
      score: num(next.score),
      maxScore: num(next.maxScore),
      feedback: next.feedback ?? null,
      attempt1Percent: num(a1Pct),
      attempt2Percent: num(a2Pct),
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

  if (next.status === "reviewed" && assignment.sourceKind !== "theory") {
    await recordChatSystemEventSafe(db, {
      organizationId: ctx.organizationId,
      studentId: assignment.studentId,
      teacherId: assignment.teacherId,
      eventType: "homework_completed",
      eventKey: `homework_completed:${assignmentId}`,
      title: "Домашнее задание выполнено",
      assignmentId,
      homeworkTitle: snap.title,
    });
  }
  await syncTheoryAfterTest(db, assignment, next.status);

  return {
    ok: true as const,
    status: next.status,
    score: next.score ?? null,
  };
}

/** Ученик не должен получить ключи шаблона теста. */
export async function getTestForViewer(
  db: AppDb,
  ctx: AuthContext,
  testId: string
) {
  const [row] = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();

  const isOwnerTeacher =
    ctx.role === "teacher" && ctx.teacherId === row.teacherId;
  const isDirector = ctx.role === "director";
  if (!isOwnerTeacher && !isDirector) {
    if (ctx.role !== "student" || row.status !== "published") {
      throw forbidden();
    }
  }

  const includeKeys = isOwnerTeacher || isDirector;
  const keys = includeKeys
    ? await db
        .select()
        .from(testAnswerKeys)
        .where(eq(testAnswerKeys.testId, testId))
    : [];
  const answerKeys = Object.fromEntries(keys.map((k) => [k.questionId, k.payload]));
  const questions = includeKeys
    ? mergeQuestionsWithKeys(row.questionsPublic, answerKeys)
    : stripQuestionKeys(row.questionsPublic);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    teacherId: row.teacherId,
    topicId: row.topicId,
    sectionId: row.sectionId,
    maxScore: row.maxScore != null ? Number(row.maxScore) : null,
    questions,
  };
}
