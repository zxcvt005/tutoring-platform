import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { computeMaxScore, snapshotFromHomework } from "@/lib/tests/helpers";
import type { Homework, TestQuestion } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { splitQuestions } from "@/server/db/question-split";
import {
  assignmentSnapshots,
  gradeEvents,
  testAnswerKeys,
  testAssignments,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, notFound } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function num(n?: number | null) {
  return n == null ? null : String(n);
}

export async function createTestAssignmentWithSnapshot(
  db: AppDb,
  ctx: AuthContext,
  input: {
    testId: string;
    teacherId: string;
    studentId: string;
    sourceKind: "homework" | "theory";
    topicId?: string | null;
    lessonId?: string | null;
    dueAt?: Date | null;
    status?: "assigned" | "overdue";
  }
): Promise<string> {
  const [hw] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, input.testId))
    .limit(1);
  if (!hw || hw.organizationId !== ctx.organizationId) {
    throw notFound("Тест не найден");
  }
  if (hw.status !== "published") {
    throw badRequest("Назначить можно только опубликованный тест");
  }

  const keys = await db
    .select()
    .from(testAnswerKeys)
    .where(eq(testAnswerKeys.testId, hw.id));
  const answerKeys = Object.fromEntries(
    keys.map((k) => [k.questionId, k.payload])
  );
  const questions = (hw.questionsPublic as TestQuestion[]) ?? [];
  if (!questions.length) throw badRequest("В тесте нет заданий");

  const topicId = input.topicId || hw.topicId || null;
  const fullForSnapshot: Homework = {
    id: hw.id,
    topicId,
    sectionId: hw.sectionId,
    teacherId: hw.teacherId,
    title: hw.title,
    description: hw.description ?? undefined,
    status: hw.status as Homework["status"],
    purpose: (hw.purpose as Homework["purpose"]) ?? "homework",
    questions: questions.map((q) => {
      const k = answerKeys[q.id] as
        | {
            correctOptionIds?: string[];
            correctAnswers?: string[];
            numericTolerance?: number;
            explanation?: string;
          }
        | undefined;
      return {
        ...q,
        correctOptionIds: k?.correctOptionIds,
        correctAnswers: k?.correctAnswers,
        numericTolerance: k?.numericTolerance,
        explanation: k?.explanation,
      };
    }),
    maxScore:
      hw.maxScore != null ? Number(hw.maxScore) : computeMaxScore(questions),
  };
  const snapshot = snapshotFromHomework(fullForSnapshot);
  const { publicQuestions, answerKeys: snapKeys } = splitQuestions(
    snapshot.questions
  );

  const assignmentId = newId(input.sourceKind === "theory" ? "tta" : "ha");
  await db.insert(testAssignments).values({
    id: assignmentId,
    organizationId: ctx.organizationId,
    testId: input.testId,
    topicId,
    teacherId: input.teacherId,
    studentId: input.studentId,
    lessonId: input.lessonId ?? null,
    dueAt: input.dueAt ?? null,
    sourceKind: input.sourceKind,
    status: input.status ?? "assigned",
    maxScore: num(snapshot.maxScore),
  });
  await db.insert(assignmentSnapshots).values({
    assignmentId,
    title: snapshot.title,
    description: snapshot.description ?? null,
    questions: publicQuestions,
    maxScore: num(snapshot.maxScore)!,
    answerKeys: snapKeys,
  });
  await db.insert(gradeEvents).values({
    id: newId("ge"),
    organizationId: ctx.organizationId,
    assignmentId,
    eventType: "assigned",
    actorUserId: ctx.userId,
    payload: {
      source:
        input.sourceKind === "theory" ? "assignTheory" : "assignHomework",
    },
  });
  return assignmentId;
}
