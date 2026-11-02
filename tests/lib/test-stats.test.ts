import { describe, expect, it } from "vitest";

import { buildTestStats, scoredQuestionPoints } from "@/lib/tests/test-stats";
import type { TestQuestion } from "@/lib/types";

const q1: TestQuestion = {
  id: "q1",
  type: "single_choice",
  prompt: "2+2",
  maxScore: 1,
  options: [
    { id: "oa", text: "4" },
    { id: "ob", text: "5" },
  ],
};
const q2: TestQuestion = {
  id: "q2",
  type: "numeric",
  prompt: "10/2",
  maxScore: 2,
};
const essay: TestQuestion = {
  id: "q3",
  type: "essay",
  prompt: "Объясните",
  maxScore: 4,
};

describe("test grade averages", () => {
  it("averages first and second attempts separately and ignores missing second attempts", () => {
    const stats = buildTestStats("hw1", "Алгебра", [
      {
        studentId: "s1",
        sourceKind: "homework",
        questions: [
          { ...q1, index: 0 },
          { ...q2, index: 1 },
        ],
        attempt1: {
          studentId: "s1",
          submitted: true,
          percent: 50,
          answers: [
            {
              questionId: "q1",
              selectedOptionIds: ["oa"],
              autoScore: 1,
              isCorrect: true,
            },
            {
              questionId: "q2",
              textAnswer: "4",
              autoScore: 0,
              isCorrect: false,
            },
          ],
        },
        attempt2: {
          studentId: "s1",
          submitted: true,
          percent: 100,
          answers: [
            {
              questionId: "q2",
              textAnswer: "5",
              autoScore: 2,
              isCorrect: true,
            },
          ],
        },
      },
      {
        studentId: "s2",
        sourceKind: "homework",
        questions: [
          { ...q1, index: 0 },
          { ...q2, index: 1 },
        ],
        attempt1: {
          studentId: "s2",
          submitted: true,
          percent: 100,
          answers: [
            {
              questionId: "q1",
              selectedOptionIds: ["oa"],
              autoScore: 1,
              isCorrect: true,
            },
            {
              questionId: "q2",
              textAnswer: "5",
              autoScore: 2,
              isCorrect: true,
            },
          ],
        },
        attempt2: {
          studentId: "s2",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
    ]);

    expect(stats.studentCount).toBe(2);
    expect(stats.attempt1Average).toBe(75);
    expect(stats.attempt2Average).toBe(100);
    expect(stats.questions[0]?.attempt1Average).toBe(1);
    expect(stats.questions[0]?.attempt1Count).toBe(2);
    expect(stats.questions[1]?.attempt1Average).toBe(1);
    expect(stats.questions[1]?.attempt2Average).toBe(2);
    expect(stats.questions[1]?.attempt2Count).toBe(1);
  });

  it("skips unfinished attempts and unreviewed essays", () => {
    const stats = buildTestStats("hw1", "Эссе", [
      {
        studentId: "s1",
        questions: [{ ...essay, index: 0 }],
        attempt1: {
          studentId: "s1",
          submitted: false,
          percent: 0,
          answers: [{ questionId: "q3", textAnswer: "черновик" }],
        },
        attempt2: {
          studentId: "s1",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
      {
        studentId: "s2",
        questions: [{ ...essay, index: 0 }],
        attempt1: {
          studentId: "s2",
          submitted: true,
          percent: null,
          answers: [
            {
              questionId: "q3",
              textAnswer: "ответ",
              needsManualReview: true,
            },
          ],
        },
        attempt2: {
          studentId: "s2",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
    ]);
    expect(stats.studentCount).toBe(1);
    expect(stats.attempt1Average).toBeNull();
    expect(stats.questions[0]?.attempt1Average).toBeNull();
    expect(stats.questions[0]?.attempt1Count).toBe(0);
    expect(
      scoredQuestionPoints(essay, {
        questionId: "q3",
        textAnswer: "ответ",
        needsManualReview: true,
      })
    ).toBeNull();
    expect(
      scoredQuestionPoints(essay, {
        questionId: "q3",
        textAnswer: "ответ",
        manualScore: 3,
      })
    ).toBe(3);
  });

  it("keeps historical question versions separate when the prompt changed", () => {
    const stats = buildTestStats("hw1", "Версии", [
      {
        studentId: "s1",
        questions: [{ ...q1, prompt: "2+2", index: 0 }],
        attempt1: {
          studentId: "s1",
          submitted: true,
          percent: 100,
          answers: [
            {
              questionId: "q1",
              selectedOptionIds: ["oa"],
              autoScore: 1,
              isCorrect: true,
            },
          ],
        },
        attempt2: {
          studentId: "s1",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
      {
        studentId: "s2",
        questions: [{ ...q1, prompt: "3+3", index: 0 }],
        attempt1: {
          studentId: "s2",
          submitted: true,
          percent: 0,
          answers: [
            {
              questionId: "q1",
              selectedOptionIds: ["ob"],
              autoScore: 0,
              isCorrect: false,
            },
          ],
        },
        attempt2: {
          studentId: "s2",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
    ]);
    expect(stats.questions).toHaveLength(2);
    expect(stats.questions.map((q) => q.prompt).sort()).toEqual(["2+2", "3+3"]);
    expect(stats.questions.find((q) => q.prompt === "2+2")?.attempt1Average).toBe(1);
    expect(stats.questions.find((q) => q.prompt === "3+3")?.attempt1Average).toBe(0);
  });

  it("does not mix theory attempts into homework test stats", () => {
    const stats = buildTestStats("hw1", "Теория", [
      {
        studentId: "s1",
        sourceKind: "theory",
        questions: [{ ...q1, index: 0 }],
        attempt1: {
          studentId: "s1",
          submitted: true,
          percent: 40,
          answers: [],
        },
        attempt2: {
          studentId: "s1",
          submitted: false,
          percent: null,
          answers: [],
        },
      },
    ]);
    expect(stats.studentCount).toBe(0);
    expect(stats.attempt1Average).toBeNull();
  });
});
