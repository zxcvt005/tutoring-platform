import { describe, expect, it } from "vitest";

import {
  allowEarlySubmitWithUnanswered,
  createSubmitLock,
  firstAttemptStats,
  lastQuestionNavAction,
  resolveHomeworkTakePhase,
} from "@/lib/homework-take-flow";
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
  prompt: "3",
  maxScore: 1,
  answerKind: "number",
  correctAnswers: ["3"],
};
const q3: TestQuestion = {
  id: "q3",
  type: "essay",
  prompt: "Explain",
  maxScore: 5,
};

describe("homework take flow", () => {
  it("opens an overdue assignment as a regular first attempt", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "overdue",
        attempt1Submitted: false,
        attempt2Submitted: false,
        retryCount: 0,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("attempt1");
  });

  it("still shows first-attempt summary for overdue homework until the student starts retry", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "overdue",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 2,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("first_attempt_summary");
    expect(
      resolveHomeworkTakePhase({
        status: "overdue",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 2,
        unansweredCount: 0,
        startAttempt2: true,
      })
    ).toBe("attempt2");
  });

  it("does not auto-start attempt 2 after first attempt is submitted", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "attempt1_submitted",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 2,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("first_attempt_summary");
  });

  it("opens attempt 2 only after an explicit start", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "attempt1_submitted",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 2,
        unansweredCount: 0,
        startAttempt2: true,
      })
    ).toBe("attempt2");
  });

  it("keeps in-progress second attempt on refresh", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "attempt2_in_progress",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 1,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("attempt2");
  });

  it("does not open an empty second attempt when nothing to retry", () => {
    expect(
      resolveHomeworkTakePhase({
        status: "reviewed",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 0,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("results");
    expect(
      resolveHomeworkTakePhase({
        status: "attempt1_submitted",
        attempt1Submitted: true,
        attempt2Submitted: false,
        retryCount: 0,
        unansweredCount: 0,
        startAttempt2: false,
      })
    ).toBe("no_retry");
  });

  it("submits on the last question instead of disabling next", () => {
    expect(lastQuestionNavAction(0, 3)).toBe("next");
    expect(lastQuestionNavAction(2, 3)).toBe("submit");
    expect(lastQuestionNavAction(0, 1)).toBe("submit");
  });

  it("warns about unanswered questions but still allows submit", () => {
    expect(allowEarlySubmitWithUnanswered(3)).toBe(true);
  });

  it("does not create a duplicate submit while the first is in flight", () => {
    const lock = createSubmitLock();
    expect(lock.tryStart()).toBe(true);
    expect(lock.tryStart()).toBe(false);
    lock.release();
    expect(lock.tryStart()).toBe(true);
  });

  it("summarizes first attempt without treating pending review as final", () => {
    const answers = gradeSubmission(
      [q1, q2, q3],
      [
        { questionId: "q1", selectedOptionIds: ["b"] },
        { questionId: "q2", textAnswer: "3" },
        { questionId: "q3", textAnswer: "черновик" },
      ]
    ).answers;
    const stats = firstAttemptStats([q1, q2, q3], answers);
    expect(stats.answered).toBe(3);
    expect(stats.correct).toBe(1);
    expect(stats.retryCount).toBe(1);
    expect(stats.pendingReview).toBe(1);
    expect(stats.percentIsPreliminary).toBe(true);
    expect(stats.percent).not.toBeNull();
  });
});
