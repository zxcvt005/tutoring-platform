import type { TestQuestion } from "@/lib/types";

export type PublicQuestion = Omit<
  TestQuestion,
  "correctOptionIds" | "correctAnswers" | "numericTolerance"
>;

export type AnswerKeyPayload = {
  correctOptionIds?: string[];
  correctAnswers?: string[];
  numericTolerance?: number;
  /** Для matching: ожидаемое matching[pairId] === pairId */
  matchingPairIds?: string[];
  /** Для ordering: правильный порядок id */
  orderItemIds?: string[];
};

/** Отделяет ключи ответов от публичной части вопроса (для хранения в PG). */
export function splitQuestion(question: TestQuestion): {
  publicQuestion: PublicQuestion;
  answerKey: AnswerKeyPayload | null;
} {
  const {
    correctOptionIds,
    correctAnswers,
    numericTolerance,
    ...rest
  } = question;

  const publicQuestion = rest as PublicQuestion;

  const answerKey: AnswerKeyPayload = {};
  if (correctOptionIds?.length) answerKey.correctOptionIds = correctOptionIds;
  if (correctAnswers?.length) answerKey.correctAnswers = correctAnswers;
  if (numericTolerance != null) answerKey.numericTolerance = numericTolerance;
  if (question.matchingPairs?.length) {
    answerKey.matchingPairIds = question.matchingPairs.map((p) => p.id);
  }
  if (question.orderItems?.length) {
    answerKey.orderItemIds = question.orderItems.map((i) => i.id);
  }

  const hasKey = Object.keys(answerKey).length > 0;
  return {
    publicQuestion,
    answerKey: hasKey ? answerKey : null,
  };
}

export function splitQuestions(questions: TestQuestion[]): {
  publicQuestions: PublicQuestion[];
  answerKeys: Record<string, AnswerKeyPayload>;
} {
  const publicQuestions: PublicQuestion[] = [];
  const answerKeys: Record<string, AnswerKeyPayload> = {};
  for (const q of questions) {
    const { publicQuestion, answerKey } = splitQuestion(q);
    publicQuestions.push(publicQuestion);
    if (answerKey) answerKeys[q.id] = answerKey;
  }
  return { publicQuestions, answerKeys };
}
