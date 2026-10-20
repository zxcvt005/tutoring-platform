import type { TestQuestion } from "@/lib/types";
import type { AnswerKeyPayload } from "@/server/db/question-split";

/** Собирает вопросы со снимка + серверные ключи для автопроверки. */
export function mergeQuestionsWithKeys(
  publicQuestions: unknown[],
  answerKeys: Record<string, unknown>
): TestQuestion[] {
  return (publicQuestions as TestQuestion[]).map((q) => {
    const key = answerKeys[q.id] as AnswerKeyPayload | undefined;
    if (!key) return { ...q };
    return {
      ...q,
      correctOptionIds: key.correctOptionIds ?? q.correctOptionIds,
      correctAnswers: key.correctAnswers ?? q.correctAnswers,
      numericTolerance: key.numericTolerance ?? q.numericTolerance,
    };
  });
}

/** Убирает ключи из вопросов перед отдачей ученику. */
export function stripQuestionKeys(
  questions: unknown[]
): Record<string, unknown>[] {
  return (questions as Record<string, unknown>[]).map((q) => {
    const rest = { ...q };
    delete rest.correctOptionIds;
    delete rest.correctAnswers;
    delete rest.numericTolerance;
    return rest;
  });
}
