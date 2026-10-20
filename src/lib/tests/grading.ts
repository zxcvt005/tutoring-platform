import {
  normalizeTextAnswer,
  parseNumericAnswer,
} from "@/lib/tests/helpers";
import type {
  HomeworkAssignment,
  StudentAnswer,
  TestQuestion,
} from "@/lib/types";

function sameIdSet(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function gradeOne(
  question: TestQuestion,
  answer: StudentAnswer | undefined
): StudentAnswer {
  const base: StudentAnswer = {
    questionId: question.id,
    selectedOptionIds: answer?.selectedOptionIds ?? [],
    textAnswer: answer?.textAnswer ?? "",
    matching: answer?.matching ?? {},
    order: answer?.order ?? [],
    teacherComment: answer?.teacherComment,
    manualScore: answer?.manualScore,
  };

  switch (question.type) {
    case "single_choice": {
      const correct = question.correctOptionIds ?? [];
      const selected = base.selectedOptionIds ?? [];
      const ok = sameIdSet(selected, correct) && selected.length === 1;
      return {
        ...base,
        autoScore: ok ? question.maxScore : 0,
        isCorrect: ok,
        needsManualReview: false,
      };
    }
    case "multiple_choice": {
      const correct = question.correctOptionIds ?? [];
      const selected = base.selectedOptionIds ?? [];
      const ok = sameIdSet(selected, correct);
      return {
        ...base,
        autoScore: ok ? question.maxScore : 0,
        isCorrect: ok,
        needsManualReview: false,
      };
    }
    case "short_answer": {
      const raw = base.textAnswer ?? "";
      if (question.answerKind === "number") {
        const studentNum = parseNumericAnswer(raw);
        const tolerance = question.numericTolerance ?? 0;
        let ok = false;
        if (studentNum != null) {
          for (const cand of question.correctAnswers ?? []) {
            const expected = parseNumericAnswer(cand);
            if (expected == null) continue;
            if (Math.abs(studentNum - expected) <= tolerance) {
              ok = true;
              break;
            }
          }
        }
        return {
          ...base,
          autoScore: ok ? question.maxScore : 0,
          isCorrect: ok,
          needsManualReview: false,
        };
      }
      const normalized = normalizeTextAnswer(raw);
      const ok = (question.correctAnswers ?? []).some(
        (c) => normalizeTextAnswer(c) === normalized && normalized !== ""
      );
      return {
        ...base,
        autoScore: ok ? question.maxScore : 0,
        isCorrect: ok,
        needsManualReview: false,
      };
    }
    case "essay": {
      return {
        ...base,
        autoScore: undefined,
        isCorrect: null,
        needsManualReview: true,
        manualScore: base.manualScore,
      };
    }
    case "matching": {
      const pairs = question.matchingPairs ?? [];
      if (pairs.length === 0) {
        return {
          ...base,
          autoScore: 0,
          isCorrect: false,
          needsManualReview: false,
        };
      }
      let hits = 0;
      for (const pair of pairs) {
        if (base.matching?.[pair.id] === pair.id) hits += 1;
      }
      const ratio = hits / pairs.length;
      const score = Math.round(ratio * question.maxScore * 100) / 100;
      return {
        ...base,
        autoScore: score,
        isCorrect: hits === pairs.length,
        needsManualReview: false,
      };
    }
    case "ordering": {
      const correct = (question.orderItems ?? []).map((i) => i.id);
      const student = base.order ?? [];
      const ok =
        correct.length > 0 &&
        correct.length === student.length &&
        correct.every((id, i) => student[i] === id);
      return {
        ...base,
        autoScore: ok ? question.maxScore : 0,
        isCorrect: ok,
        needsManualReview: false,
      };
    }
  }
}

/** Автопроверка всех объективных заданий; essay остаётся на ручную проверку */
export function gradeSubmission(
  questions: TestQuestion[],
  answers: StudentAnswer[]
): {
  answers: StudentAnswer[];
  autoScore: number;
  maxScore: number;
  needsManualReview: boolean;
} {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const graded = questions.map((q) => gradeOne(q, byId.get(q.id)));
  const needsManualReview = graded.some((a) => a.needsManualReview);
  const autoScore = graded.reduce((sum, a) => sum + (a.autoScore ?? 0), 0);
  const maxScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0);
  return { answers: graded, autoScore, maxScore, needsManualReview };
}

/** Итоговый балл с учётом ручных оценок; null если ещё есть непроверенные essay */
export function computeFinalScore(
  questions: TestQuestion[],
  answers: StudentAnswer[]
): { score: number | null; complete: boolean; pendingManual: number } {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let pendingManual = 0;
  for (const q of questions) {
    const a = byId.get(q.id);
    if (q.type === "essay") {
      if (a?.manualScore == null) {
        pendingManual += 1;
      } else {
        score += a.manualScore;
      }
    } else {
      score += a?.autoScore ?? 0;
    }
  }
  return {
    score: pendingManual > 0 ? null : Math.round(score * 100) / 100,
    complete: pendingManual === 0,
    pendingManual,
  };
}

export function applyManualScores(
  assignment: HomeworkAssignment,
  updates: {
    questionId: string;
    manualScore: number;
    teacherComment?: string;
  }[],
  overallFeedback?: string
): HomeworkAssignment {
  const questions = assignment.testSnapshot?.questions ?? [];
  const byId = new Map(
    (assignment.answers ?? []).map((a) => [a.questionId, { ...a }])
  );
  for (const u of updates) {
    const existing = byId.get(u.questionId) ?? { questionId: u.questionId };
    const q = questions.find((x) => x.id === u.questionId);
    const capped = Math.max(
      0,
      Math.min(u.manualScore, q?.maxScore ?? u.manualScore)
    );
    byId.set(u.questionId, {
      ...existing,
      manualScore: capped,
      teacherComment: u.teacherComment,
      needsManualReview: false,
      isCorrect: capped >= (q?.maxScore ?? 0) * 0.999,
      autoScore: existing.autoScore,
    });
  }
  const answers = questions.map(
    (q) => byId.get(q.id) ?? { questionId: q.id }
  );
  const final = computeFinalScore(questions, answers);
  return {
    ...assignment,
    answers,
    feedback: overallFeedback ?? assignment.feedback,
    score: final.score ?? undefined,
    maxScore: assignment.maxScore ?? assignment.testSnapshot?.maxScore,
    status: final.complete ? "reviewed" : "completed",
    reviewedAt: final.complete
      ? new Date().toISOString()
      : assignment.reviewedAt,
  };
}

export function hasPendingManual(assignment: HomeworkAssignment): boolean {
  return (assignment.answers ?? []).some(
    (a) => a.needsManualReview && a.manualScore == null
  );
}
