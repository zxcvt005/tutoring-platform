import { and, eq, inArray } from "drizzle-orm";

import { attemptPercent, retryQuestionIds } from "@/lib/tests/attempts";
import {
  buildTestStats,
  type TestStatsAssignment,
} from "@/lib/tests/test-stats";
import type { StudentAnswer, TestQuestion } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  assertDirectorSeesTeacher,
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import { mergeQuestionsWithKeys } from "@/server/services/question-merge";
import {
  assignmentSnapshots,
  attemptAnswers,
  testAssignments,
  testAttempts,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest } from "@/server/errors";

function n(v: string | number | null | undefined): number | undefined {
  return v == null ? undefined : Number(v);
}

function toAnswer(row: {
  questionId: string;
  payload: Record<string, unknown>;
  autoScore: string | null;
  manualScore: string | null;
  needsManualReview: boolean;
  isCorrect: boolean | null;
}): StudentAnswer {
  return {
    questionId: row.questionId,
    selectedOptionIds: (row.payload.selectedOptionIds as string[]) ?? [],
    textAnswer: (row.payload.textAnswer as string) ?? "",
    matching: (row.payload.matching as Record<string, string>) ?? {},
    order: (row.payload.order as string[]) ?? [],
    autoScore: n(row.autoScore),
    manualScore: n(row.manualScore),
    needsManualReview: row.needsManualReview,
    isCorrect: row.isCorrect,
  };
}

export async function getTestGradesStats(
  db: AppDb,
  ctx: AuthContext,
  teacherId?: string
) {
  requireRoles(ctx, ["teacher", "director"]);
  let tid: string;
  if (ctx.role === "teacher") {
    tid = await requireTeacherProfile(ctx);
  } else {
    tid = teacherId?.trim() || "";
    if (!tid) throw badRequest("Укажите преподавателя");
    await assertDirectorSeesTeacher(db, ctx, tid);
  }

  const testRows = await db
    .select({
      id: tests.id,
      title: tests.title,
      purpose: tests.purpose,
      organizationId: tests.organizationId,
      teacherId: tests.teacherId,
    })
    .from(tests)
    .where(
      and(
        eq(tests.organizationId, ctx.organizationId),
        eq(tests.teacherId, tid),
        eq(tests.purpose, "homework")
      )
    );
  if (testRows.length === 0) return { tests: [] };

  const testIds = testRows.map((row) => row.id);
  const assignmentRows = await db
    .select()
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.organizationId, ctx.organizationId),
        eq(testAssignments.teacherId, tid),
        inArray(testAssignments.testId, testIds)
      )
    );

  const homeworkAssignments = assignmentRows.filter(
    (row) => row.sourceKind !== "theory" && row.sourceKind !== "intensive"
  );
  const assignmentIds = homeworkAssignments.map((row) => row.id);
  const snaps =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(assignmentSnapshots)
          .where(inArray(assignmentSnapshots.assignmentId, assignmentIds))
      : [];
  const snapById = new Map(snaps.map((row) => [row.assignmentId, row]));

  const attemptRows =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(testAttempts)
          .where(inArray(testAttempts.assignmentId, assignmentIds))
      : [];
  const attemptsByAssignment = new Map<string, typeof attemptRows>();
  for (const row of attemptRows) {
    const list = attemptsByAssignment.get(row.assignmentId) ?? [];
    list.push(row);
    attemptsByAssignment.set(row.assignmentId, list);
  }
  const attemptIds = attemptRows.map((row) => row.id);
  const answerRows =
    attemptIds.length > 0
      ? await db
          .select()
          .from(attemptAnswers)
          .where(inArray(attemptAnswers.attemptId, attemptIds))
      : [];
  const answersByAttempt = new Map<string, StudentAnswer[]>();
  for (const row of answerRows) {
    const list = answersByAttempt.get(row.attemptId) ?? [];
    list.push(toAnswer(row));
    answersByAttempt.set(row.attemptId, list);
  }

  const grouped = new Map<string, TestStatsAssignment[]>();
  for (const assignment of homeworkAssignments) {
    const snap = snapById.get(assignment.id);
    const keys = (snap?.answerKeys as Record<string, unknown>) ?? {};
    const publicQ = (snap?.questions as TestQuestion[]) ?? [];
    const questions = mergeQuestionsWithKeys(publicQ, keys).map((q, index) => ({
      ...q,
      index,
    }));
    const attempts = attemptsByAssignment.get(assignment.id) ?? [];
    const a1 = attempts.find((row) => row.attemptNumber === 1);
    const a2 = attempts.find((row) => row.attemptNumber === 2);
    const a1Answers = a1 ? answersByAttempt.get(a1.id) ?? [] : [];
    const a2Answers = a2 ? answersByAttempt.get(a2.id) ?? [] : [];
    const retryIds = retryQuestionIds(questions, a1Answers);
    const list = grouped.get(assignment.testId) ?? [];
    list.push({
      studentId: assignment.studentId,
      sourceKind: assignment.sourceKind as TestStatsAssignment["sourceKind"],
      questions,
      attempt1: {
        studentId: assignment.studentId,
        submitted: a1?.status === "submitted",
        percent:
          a1?.status === "submitted"
            ? assignment.attempt1Percent != null
              ? Number(assignment.attempt1Percent)
              : attemptPercent(questions, a1Answers)
            : null,
        answers: a1Answers,
      },
      attempt2: {
        studentId: assignment.studentId,
        submitted: a2?.status === "submitted",
        percent:
          a2?.status === "submitted"
            ? assignment.attempt2Percent != null
              ? Number(assignment.attempt2Percent)
              : attemptPercent(questions, a2Answers, retryIds)
            : null,
        answers: a2Answers,
      },
    });
    grouped.set(assignment.testId, list);
  }

  const stats = testRows
    .map((row) =>
      buildTestStats(row.id, row.title, grouped.get(row.id) ?? [])
    )
    .filter(
      (row) =>
        row.studentCount > 0 ||
        row.attempt1Average != null ||
        row.attempt2Average != null
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));

  return { tests: stats };
}
