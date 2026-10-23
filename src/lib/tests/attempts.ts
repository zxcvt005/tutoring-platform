import { gradeSubmission } from "@/lib/tests/grading";
import type {
  HomeworkAssignmentStatus,
  QuestionOutcome,
  QuestionOutcomeStatus,
  StudentAnswer,
  TestQuestion,
} from "@/lib/types";

/** Буквальный ответ кнопки «Не знаю» во второй попытке. */
export const DONT_KNOW_TEXT = "не знаю";

export function isDontKnowAnswer(answer?: StudentAnswer | null): boolean {
  return (answer?.textAnswer ?? "").trim().toLowerCase() === DONT_KNOW_TEXT;
}

export function applyDontKnow(answer: StudentAnswer): StudentAnswer {
  return {
    ...answer,
    textAnswer: DONT_KNOW_TEXT,
    selectedOptionIds: [],
    matching: {},
  };
}

export function isQuestionAnswered(
  question: TestQuestion,
  answer?: StudentAnswer | null
): boolean {
  if (!answer) return false;
  if (isDontKnowAnswer(answer)) return true;
  switch (question.type) {
    case "single_choice":
    case "multiple_choice":
      return (answer.selectedOptionIds ?? []).length > 0;
    case "short_answer":
    case "numeric":
    case "essay":
      return (answer.textAnswer ?? "").trim() !== "";
    case "matching":
      return Object.keys(answer.matching ?? {}).length > 0;
    case "ordering":
      return (answer.order ?? []).length > 0;
    default:
      return (answer.textAnswer ?? "").trim() !== "";
  }
}

function answersById(answers: StudentAnswer[]): Map<string, StudentAnswer> {
  return new Map(answers.map((a) => [a.questionId, a]));
}

/** Вопросы первой попытки, которые нужно пересдать (отвечены и неверны). */
export function retryQuestionIds(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[]
): string[] {
  const byId = answersById(attempt1Answers);
  return questions
    .filter((q) => {
      const a = byId.get(q.id);
      if (!isQuestionAnswered(q, a)) return false;
      if (q.type === "essay") return false;
      return a?.isCorrect === false;
    })
    .map((q) => q.id);
}

export function unansweredQuestionIds(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[]
): string[] {
  const byId = answersById(attempt1Answers);
  return questions
    .filter((q) => !isQuestionAnswered(q, byId.get(q.id)))
    .map((q) => q.id);
}

/**
 * Процент по завершённым ответам попытки.
 * Незаполненные и непроверенные развёрнутые не входят в знаменатель.
 * Нет данных → null, а не 0.
 */
export function attemptPercent(
  questions: TestQuestion[],
  answers: StudentAnswer[],
  onlyQuestionIds?: string[]
): number | null {
  const allow = onlyQuestionIds ? new Set(onlyQuestionIds) : null;
  const byId = answersById(answers);
  let got = 0;
  let max = 0;
  for (const q of questions) {
    if (allow && !allow.has(q.id)) continue;
    const a = byId.get(q.id);
    if (!isQuestionAnswered(q, a)) continue;
    if (q.type === "essay") {
      if (a?.manualScore == null) continue;
      got += a.manualScore;
      max += q.maxScore || 0;
      continue;
    }
    got += a?.autoScore ?? 0;
    max += q.maxScore || 0;
  }
  if (max <= 0) return null;
  return Math.round((got / max) * 1000) / 10;
}

export function questionOutcome(
  question: TestQuestion,
  attempt1?: StudentAnswer,
  attempt2?: StudentAnswer,
  bothAttemptsSubmitted = false
): QuestionOutcomeStatus {
  const a1Answered = isQuestionAnswered(question, attempt1);
  const a2Answered = isQuestionAnswered(question, attempt2);

  if (question.type === "essay") {
    const latest = a2Answered ? attempt2 : attempt1;
    if (!a1Answered && !a2Answered) {
      return bothAttemptsSubmitted ? "unanswered" : "unanswered";
    }
    if (latest?.manualScore == null) return "pending_review";
    if (attempt1?.manualScore != null && attempt1.isCorrect) {
      return "correct_first";
    }
    if (attempt2?.manualScore != null && attempt2.isCorrect) {
      return "corrected_second";
    }
    return latest?.isCorrect ? "correct_first" : "incorrect";
  }

  if (attempt1?.isCorrect === true) return "correct_first";
  if (attempt2?.isCorrect === true) return "corrected_second";
  if (a2Answered && attempt2?.isCorrect === false) return "incorrect";
  if (a1Answered && attempt1?.isCorrect === false && !a2Answered) {
    return bothAttemptsSubmitted ? "incorrect" : "incorrect";
  }
  if (!a1Answered) {
    return bothAttemptsSubmitted ? "incorrect" : "unanswered";
  }
  return "incorrect";
}

export function buildQuestionOutcomes(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[],
  attempt2Answers: StudentAnswer[],
  bothAttemptsSubmitted: boolean
): QuestionOutcome[] {
  const a1 = answersById(attempt1Answers);
  const a2 = answersById(attempt2Answers);
  return questions.map((q) => ({
    questionId: q.id,
    status: questionOutcome(q, a1.get(q.id), a2.get(q.id), bothAttemptsSubmitted),
  }));
}

export function mergeLatestAnswers(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[],
  attempt2Answers: StudentAnswer[]
): StudentAnswer[] {
  const a1 = answersById(attempt1Answers);
  const a2 = answersById(attempt2Answers);
  return questions.map((q) => a2.get(q.id) ?? a1.get(q.id) ?? { questionId: q.id });
}

export function deriveAssignmentStatus(input: {
  previous: HomeworkAssignmentStatus;
  attempt1Submitted: boolean;
  attempt2Submitted: boolean;
  unansweredCount: number;
  retryCount: number;
  pendingManual: boolean;
}): HomeworkAssignmentStatus {
  void input.previous;
  if (input.attempt2Submitted) {
    return input.pendingManual ? "completed" : "reviewed";
  }
  if (input.attempt1Submitted && input.retryCount > 0 && !input.attempt2Submitted) {
    if (input.unansweredCount > 0) return "remaining_questions";
    return "attempt1_submitted";
  }
  if (input.attempt1Submitted && input.retryCount === 0) {
    if (input.unansweredCount > 0) return "remaining_questions";
    return input.pendingManual ? "completed" : "reviewed";
  }
  return "in_progress";
}

export function nextOpenAttempt(input: {
  attempt1Submitted: boolean;
  attempt2Submitted: boolean;
  retryCount: number;
}): 1 | 2 | null {
  if (!input.attempt1Submitted) return 1;
  if (input.attempt2Submitted) return null;
  if (input.retryCount > 0) return 2;
  return null;
}

export function gradeAttemptAnswers(
  questions: TestQuestion[],
  answers: StudentAnswer[]
) {
  return gradeSubmission(questions, answers);
}

export type AttemptSummary = {
  attempt1Percent: number | null;
  attempt2Percent: number | null;
  correctFirst: number;
  correctedSecond: number;
  incorrectOrPending: number;
  unanswered: number;
  outcomes: QuestionOutcome[];
};

export function summarizeAttempts(
  questions: TestQuestion[],
  attempt1Answers: StudentAnswer[],
  attempt2Answers: StudentAnswer[],
  attempt2Submitted: boolean
): AttemptSummary {
  const retryIds = retryQuestionIds(questions, attempt1Answers);
  const outcomes = buildQuestionOutcomes(
    questions,
    attempt1Answers,
    attempt2Answers,
    attempt2Submitted
  );
  return {
    attempt1Percent: attemptPercent(questions, attempt1Answers),
    attempt2Percent: attemptPercent(questions, attempt2Answers, retryIds),
    correctFirst: outcomes.filter((o) => o.status === "correct_first").length,
    correctedSecond: outcomes.filter((o) => o.status === "corrected_second").length,
    incorrectOrPending: outcomes.filter(
      (o) => o.status === "incorrect" || o.status === "pending_review"
    ).length,
    unanswered: outcomes.filter((o) => o.status === "unanswered").length,
    outcomes,
  };
}

export function canRevealKeys(input: {
  attempt1Submitted: boolean;
  attempt2Submitted: boolean;
  retryCount: number;
}): boolean {
  if (input.attempt2Submitted) return true;
  return input.attempt1Submitted && input.retryCount === 0;
}

/** Средний % второй попытки: только определённые результаты, без нулей за пропуски. */
export function averageFinishedAttempt2(
  assignments: {
    status: HomeworkAssignmentStatus;
    attempt2Percent?: number | null;
  }[]
): number | null {
  const vals = assignments
    .filter(
      (a) =>
        (a.status === "reviewed" || a.status === "completed") &&
        a.attempt2Percent != null
    )
    .map((a) => a.attempt2Percent as number);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
}

export function studentHomeworkStats(
  assignments: {
    status: HomeworkAssignmentStatus;
    attempt1Percent?: number | null;
    attempt2Percent?: number | null;
  }[]
): {
  completedCount: number;
  avgAttempt1: number | null;
  avgAttempt2: number | null;
} {
  const done = assignments.filter(
    (a) => a.status === "completed" || a.status === "reviewed"
  );
  const a1 = done
    .map((a) => a.attempt1Percent)
    .filter((n): n is number => n != null);
  const a2 = done
    .map((a) => a.attempt2Percent)
    .filter((n): n is number => n != null);
  return {
    completedCount: done.length,
    avgAttempt1: a1.length
      ? Math.round((a1.reduce((s, n) => s + n, 0) / a1.length) * 10) / 10
      : null,
    avgAttempt2: a2.length
      ? Math.round((a2.reduce((s, n) => s + n, 0) / a2.length) * 10) / 10
      : null,
  };
}
