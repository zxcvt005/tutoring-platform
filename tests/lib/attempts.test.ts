import { describe, expect, it } from "vitest";

import {
  applyDontKnow,
  attemptPercent,
  averageFinishedAttempt2,
  canRevealKeys,
  deriveAssignmentStatus,
  DONT_KNOW_TEXT,
  questionOutcome,
  retryQuestionIds,
  studentHomeworkStats,
  summarizeAttempts,
  unansweredQuestionIds,
} from "@/lib/tests/attempts";
import { gradeSubmission } from "@/lib/tests/grading";
import type { TestQuestion } from "@/lib/types";

const q1: TestQuestion = {
  id: "q1",
  type: "single_choice",
  prompt: "2+2",
  maxScore: 1,
  options: [
    { id: "a", text: "4" },
    { id: "b", text: "5" },
  ],
  correctOptionIds: ["a"],
};
const q2: TestQuestion = {
  id: "q2",
  type: "numeric",
  prompt: "pi ~",
  maxScore: 1,
  answerKind: "number",
  correctAnswers: ["3.14"],
  numericTolerance: 0.01,
};
const q3: TestQuestion = {
  id: "q3",
  type: "essay",
  prompt: "Explain",
  maxScore: 5,
};

describe("attempts scoring", () => {
  it("auto-grades objective questions and leaves essay pending", () => {
    const graded = gradeSubmission(
      [q1, q2, q3],
      [
        { questionId: "q1", selectedOptionIds: ["a"] },
        { questionId: "q2", textAnswer: "3.14" },
        { questionId: "q3", textAnswer: "long text" },
      ]
    );
    expect(graded.answers.find((a) => a.questionId === "q1")?.isCorrect).toBe(true);
    expect(graded.answers.find((a) => a.questionId === "q2")?.isCorrect).toBe(true);
    expect(graded.answers.find((a) => a.questionId === "q3")?.needsManualReview).toBe(
      true
    );
    expect(graded.needsManualReview).toBe(true);
  });

  it("does not treat 1/2 and 0.5 as equal", () => {
    const graded = gradeSubmission(
      [q2],
      [{ questionId: "q2", textAnswer: "1/2" }]
    );
    expect(graded.answers[0]?.isCorrect).toBe(false);
  });

  it("treats «не знаю» as a wrong numeric answer without changing type", () => {
    const ans = applyDontKnow({ questionId: "q2" });
    expect(ans.textAnswer).toBe(DONT_KNOW_TEXT);
    const graded = gradeSubmission([q2], [ans]);
    expect(graded.answers[0]?.isCorrect).toBe(false);
    expect(q2.type).toBe("numeric");
  });

  it("first-attempt percent ignores unanswered questions", () => {
    const a1 = gradeSubmission(
      [q1, q2],
      [{ questionId: "q1", selectedOptionIds: ["b"] }]
    ).answers;
    expect(unansweredQuestionIds([q1, q2], a1)).toEqual(["q2"]);
    expect(attemptPercent([q1, q2], a1)).toBe(0);
    const both = gradeSubmission(
      [q1, q2],
      [
        { questionId: "q1", selectedOptionIds: ["a"] },
        { questionId: "q2", textAnswer: "3.14" },
      ]
    ).answers;
    expect(attemptPercent([q1, q2], both)).toBe(100);
  });

  it("retry set is only incorrect answered questions", () => {
    const a1 = gradeSubmission(
      [q1, q2],
      [
        { questionId: "q1", selectedOptionIds: ["b"] },
        { questionId: "q2", textAnswer: "3.14" },
      ]
    ).answers;
    expect(retryQuestionIds([q1, q2], a1)).toEqual(["q1"]);
  });

  it("does not reveal keys until second attempt is done (or no retry)", () => {
    expect(
      canRevealKeys({
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 1,
      })
    ).toBe(false);
    expect(
      canRevealKeys({
        attempt1Submitted: true,
        attempt2Submitted: true,
        retryCount: 1,
      })
    ).toBe(true);
    expect(
      canRevealKeys({
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 0,
      })
    ).toBe(true);
  });

  it("corrected second is not counted as first-attempt correct", () => {
    const a1 = gradeSubmission(
      [q1],
      [{ questionId: "q1", selectedOptionIds: ["b"] }]
    ).answers;
    const a2 = gradeSubmission(
      [q1],
      [{ questionId: "q1", selectedOptionIds: ["a"] }]
    ).answers;
    expect(questionOutcome(q1, a1[0], a2[0], true)).toBe("corrected_second");
    const summary = summarizeAttempts([q1], a1, a2, true);
    expect(summary.correctFirst).toBe(0);
    expect(summary.correctedSecond).toBe(1);
  });

  it("student stats use completed assignments and never fake zeros", () => {
    const stats = studentHomeworkStats([
      { status: "assigned" },
      { status: "in_progress", attempt1Percent: 50 },
      { status: "reviewed", attempt1Percent: 80, attempt2Percent: 100 },
      { status: "completed", attempt1Percent: 40 },
    ]);
    expect(stats.completedCount).toBe(2);
    expect(stats.avgAttempt1).toBe(60);
    expect(stats.avgAttempt2).toBe(100);
    expect(studentHomeworkStats([]).avgAttempt1).toBeNull();
  });

  it("table average of attempt 2 ignores missing and pending results", () => {
    expect(
      averageFinishedAttempt2([
        { status: "assigned" },
        { status: "completed" },
        { status: "completed", attempt2Percent: 80 },
        { status: "reviewed", attempt2Percent: 100 },
        { status: "in_progress", attempt2Percent: 10 },
      ])
    ).toBe(90);
    expect(averageFinishedAttempt2([{ status: "assigned" }])).toBeNull();
  });

  it("does not keep overdue after the student starts or submits an attempt", () => {
    expect(
      deriveAssignmentStatus({
        previous: "overdue",
        attempt1Submitted: false,
        attempt2Submitted: false,
        unansweredCount: 0,
        retryCount: 0,
        pendingManual: false,
      })
    ).toBe("in_progress");
    expect(
      deriveAssignmentStatus({
        previous: "overdue",
        attempt1Submitted: true,
        attempt2Submitted: false,
        unansweredCount: 0,
        retryCount: 1,
        pendingManual: false,
      })
    ).toBe("attempt1_submitted");
  });
});
