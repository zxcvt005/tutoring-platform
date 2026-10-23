import {
  attemptPercent,
  isQuestionAnswered,
  retryQuestionIds,
  unansweredQuestionIds,
} from "@/lib/tests/attempts";
import type {
  HomeworkAssignmentStatus,
  StudentAnswer,
  TestQuestion,
} from "@/lib/types";

export type HomeworkTakePhase =
  | "attempt1"
  | "first_attempt_summary"
  | "attempt2"
  | "no_retry"
  | "results";

export type FirstAttemptStats = {
  total: number;
  answered: number;
  correct: number;
  retryCount: number;
  unanswered: number;
  pendingReview: number;
  percent: number | null;
  percentIsPreliminary: boolean;
};

export function lastQuestionNavAction(
  index: number,
  questionCount: number
): "next" | "submit" {
  if (questionCount <= 0) return "submit";
  return index >= questionCount - 1 ? "submit" : "next";
}

export function unansweredBeforeSubmit(
  questions: TestQuestion[],
  answers: StudentAnswer[]
): number {
  return questions.filter(
    (q) => !isQuestionAnswered(q, answers.find((a) => a.questionId === q.id))
  ).length;
}

/** Предупреждение не блокирует досрочную сдачу. */
export function allowEarlySubmitWithUnanswered(unansweredCount: number): boolean {
  return unansweredCount >= 0;
}

export function firstAttemptStats(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[]
): FirstAttemptStats {
  const answered = questions.filter((q) =>
    isQuestionAnswered(q, attempt1Answers.find((a) => a.questionId === q.id))
  ).length;
  const correct = attempt1Answers.filter((a) => a.isCorrect === true).length;
  const retryCount = retryQuestionIds(questions, attempt1Answers).length;
  const unanswered = unansweredQuestionIds(questions, attempt1Answers).length;
  const pendingReview = questions.filter((q) => {
    if (q.type !== "essay") return false;
    const a = attempt1Answers.find((x) => x.questionId === q.id);
    if (!isQuestionAnswered(q, a)) return false;
    return a?.manualScore == null;
  }).length;
  const percent = attemptPercent(questions, attempt1Answers);
  return {
    total: questions.length,
    answered,
    correct,
    retryCount,
    unanswered,
    pendingReview,
    percent,
    percentIsPreliminary: pendingReview > 0,
  };
}

export function resolveHomeworkTakePhase(input: {
  status: HomeworkAssignmentStatus;
  attempt1Submitted: boolean;
  attempt2Submitted: boolean;
  retryCount: number;
  unansweredCount: number;
  startAttempt2: boolean;
}): HomeworkTakePhase {
  if (
    input.status === "completed" ||
    input.status === "reviewed" ||
    input.attempt2Submitted
  ) {
    return "results";
  }
  if (!input.attempt1Submitted) return "attempt1";
  if (
    input.unansweredCount > 0 &&
    (input.status === "remaining_questions" || input.status === "overdue")
  ) {
    return "attempt1";
  }
  if (
    input.status === "attempt2_in_progress" ||
    (input.status === "overdue" && input.startAttempt2)
  ) {
    return "attempt2";
  }
  if (input.retryCount <= 0) return "no_retry";
  if (input.startAttempt2) return "attempt2";
  return "first_attempt_summary";
}

export function createSubmitLock() {
  let busy = false;
  return {
    tryStart(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    release(): void {
      busy = false;
    },
    get busy() {
      return busy;
    },
  };
}
