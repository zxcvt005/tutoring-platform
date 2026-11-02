import { isQuestionAnswered } from "@/lib/tests/attempts";
import type { StudentAnswer, TestQuestion } from "@/lib/types";

export type ScoredAttempt = {
  studentId: string;
  submitted: boolean;
  percent: number | null;
  answers: StudentAnswer[];
};

export type TestQuestionSnapshot = TestQuestion & { index: number };

export type TestStatsAssignment = {
  studentId: string;
  sourceKind?: "homework" | "theory" | "intensive";
  attempt1: ScoredAttempt;
  attempt2: ScoredAttempt;
  questions: TestQuestionSnapshot[];
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function averageOrNull(values: number[]): number | null {
  if (!values.length) return null;
  return round1(values.reduce((sum, n) => sum + n, 0) / values.length);
}

/** Балл за задание в попытке: незавершённое и непроверенное эссе не считаются нулём. */
export function scoredQuestionPoints(
  question: TestQuestion,
  answer: StudentAnswer | undefined
): number | null {
  if (!isQuestionAnswered(question, answer)) return null;
  if (question.type === "essay") {
    if (answer?.manualScore == null) return null;
    return answer.manualScore;
  }
  if (answer?.needsManualReview && answer.manualScore == null) return null;
  return answer?.autoScore ?? 0;
}

export function questionCorrectFlag(
  question: TestQuestion,
  answer: StudentAnswer | undefined
): boolean | null {
  if (scoredQuestionPoints(question, answer) == null) return null;
  if (typeof answer?.isCorrect === "boolean") return answer.isCorrect;
  return null;
}

function questionKey(question: TestQuestion) {
  return `${question.id}\u0000${(question.prompt ?? "").trim()}`;
}

export type QuestionStat = {
  questionId: string;
  index: number;
  prompt: string;
  maxScore: number;
  attempt1Average: number | null;
  attempt2Average: number | null;
  attempt1Count: number;
  attempt2Count: number;
  attempt1CorrectPercent: number | null;
  attempt2CorrectPercent: number | null;
};

export type TestStatRow = {
  testId: string;
  title: string;
  studentCount: number;
  attempt1Average: number | null;
  attempt2Average: number | null;
  questions: QuestionStat[];
};

function correctPercent(flags: boolean[]): number | null {
  if (!flags.length) return null;
  const yes = flags.filter(Boolean).length;
  return round1((yes / flags.length) * 100);
}

export function buildTestStats(
  testId: string,
  title: string,
  assignments: TestStatsAssignment[]
): TestStatRow {
  const counted = assignments.filter(
    (row) =>
      row.sourceKind !== "theory" &&
      row.sourceKind !== "intensive" &&
      row.attempt1.submitted
  );
  const students = new Set(counted.map((row) => row.studentId));
  const attempt1 = counted
    .map((row) => row.attempt1.percent)
    .filter((n): n is number => n != null);
  const attempt2 = counted
    .filter((row) => row.attempt2.submitted)
    .map((row) => row.attempt2.percent)
    .filter((n): n is number => n != null);

  const buckets = new Map<
    string,
    {
      questionId: string;
      index: number;
      prompt: string;
      maxScore: number;
      a1: number[];
      a2: number[];
      a1ok: boolean[];
      a2ok: boolean[];
    }
  >();

  for (const row of counted) {
    for (const question of row.questions) {
      const key = questionKey(question);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          questionId: question.id,
          index: question.index,
          prompt: question.prompt,
          maxScore: question.maxScore ?? 0,
          a1: [],
          a2: [],
          a1ok: [],
          a2ok: [],
        };
        buckets.set(key, bucket);
      }
      bucket.index = Math.min(bucket.index, question.index);
      const a1 = row.attempt1.answers.find((a) => a.questionId === question.id);
      const p1 = scoredQuestionPoints(question, a1);
      if (p1 != null) {
        bucket.a1.push(p1);
        const ok = questionCorrectFlag(question, a1);
        if (ok != null) bucket.a1ok.push(ok);
      }
      if (!row.attempt2.submitted) continue;
      const a2 = row.attempt2.answers.find((a) => a.questionId === question.id);
      const p2 = scoredQuestionPoints(question, a2);
      if (p2 != null) {
        bucket.a2.push(p2);
        const ok = questionCorrectFlag(question, a2);
        if (ok != null) bucket.a2ok.push(ok);
      }
    }
  }

  const questions = [...buckets.values()]
    .sort((a, b) => a.index - b.index || a.prompt.localeCompare(b.prompt, "ru"))
    .map((bucket) => ({
      questionId: bucket.questionId,
      index: bucket.index + 1,
      prompt: bucket.prompt,
      maxScore: bucket.maxScore,
      attempt1Average: averageOrNull(bucket.a1),
      attempt2Average: averageOrNull(bucket.a2),
      attempt1Count: bucket.a1.length,
      attempt2Count: bucket.a2.length,
      attempt1CorrectPercent: correctPercent(bucket.a1ok),
      attempt2CorrectPercent: correctPercent(bucket.a2ok),
    }));

  return {
    testId,
    title,
    studentCount: students.size,
    attempt1Average: averageOrNull(attempt1),
    attempt2Average: averageOrNull(attempt2),
    questions,
  };
}
