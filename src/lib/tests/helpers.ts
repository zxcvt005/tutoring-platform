import { newId } from "@/lib/format";
import type {
  Homework,
  QuestionType,
  StudentAnswer,
  TestQuestion,
  TestSnapshot,
} from "@/lib/types";

export const questionTypeLabel: Record<QuestionType, string> = {
  single_choice: "Один вариант",
  multiple_choice: "Несколько вариантов",
  short_answer: "Краткий ответ",
  numeric: "Числовой ответ",
  essay: "Развёрнутый ответ",
  matching: "Сопоставление",
  ordering: "Порядок",
};

export function computeMaxScore(questions: TestQuestion[]): number {
  return questions.reduce((sum, q) => sum + (q.maxScore || 0), 0);
}

export function createEmptyQuestion(type: QuestionType = "single_choice"): TestQuestion {
  const id = newId("q");
  switch (type) {
    case "single_choice": {
      const a = newId("opt");
      const b = newId("opt");
      return {
        id,
        type,
        prompt: "",
        maxScore: 1,
        options: [
          { id: a, text: "" },
          { id: b, text: "" },
        ],
        correctOptionIds: [a],
      };
    }
    case "multiple_choice": {
      const a = newId("opt");
      const b = newId("opt");
      const c = newId("opt");
      return {
        id,
        type,
        prompt: "",
        maxScore: 2,
        options: [
          { id: a, text: "" },
          { id: b, text: "" },
          { id: c, text: "" },
        ],
        correctOptionIds: [a, b],
      };
    }
    case "short_answer":
      return {
        id,
        type,
        prompt: "",
        maxScore: 1,
        answerKind: "text",
        correctAnswers: [""],
      };
    case "numeric":
      return {
        id,
        type,
        prompt: "",
        maxScore: 1,
        answerKind: "number",
        correctAnswers: [""],
        numericTolerance: 0,
      };
    case "essay":
      return {
        id,
        type,
        prompt: "",
        maxScore: 5,
      };
    case "matching": {
      const p1 = newId("mp");
      const p2 = newId("mp");
      return {
        id,
        type,
        prompt: "Сопоставьте элементы",
        maxScore: 2,
        matchingPairs: [
          { id: p1, left: "", right: "" },
          { id: p2, left: "", right: "" },
        ],
      };
    }
    case "ordering": {
      const i1 = newId("ord");
      const i2 = newId("ord");
      const i3 = newId("ord");
      return {
        id,
        type,
        prompt: "Расставьте в правильном порядке",
        maxScore: 2,
        orderItems: [
          { id: i1, text: "" },
          { id: i2, text: "" },
          { id: i3, text: "" },
        ],
      };
    }
  }
}

export function snapshotFromHomework(hw: Homework): TestSnapshot {
  const questions = structuredClone(hw.questions ?? []);
  return {
    title: hw.title,
    description: hw.description,
    questions,
    maxScore: computeMaxScore(questions) || hw.maxScore || 0,
  };
}

export function emptyAnswersForQuestions(
  questions: TestQuestion[]
): StudentAnswer[] {
  return questions.map((q) => {
    const orderIds = q.orderItems?.map((i) => i.id) ?? [];
    return {
      questionId: q.id,
      selectedOptionIds: [],
      textAnswer: "",
      matching: {},
      // Перемешиваем, чтобы не показывать верный порядок по умолчанию
      order: orderIds.length > 1 ? shuffleCopy(orderIds) : orderIds,
    };
  });
}

export function getAssignmentQuestions(
  assignment: {
    testSnapshot?: TestSnapshot;
    answers?: StudentAnswer[];
  },
  fallbackHomework?: Homework | null
): TestQuestion[] {
  if (assignment.testSnapshot?.questions?.length) {
    return assignment.testSnapshot.questions;
  }
  return fallbackHomework?.questions ?? [];
}

export function getAssignmentTitle(
  assignment: { testSnapshot?: TestSnapshot },
  fallbackHomework?: Homework | null
): string {
  return (
    assignment.testSnapshot?.title ||
    fallbackHomework?.title ||
    "Домашнее задание"
  );
}

export function shuffleCopy<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Нормализация текстового ответа для сравнения */
export function normalizeTextAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseNumericAnswer(value: string): number | null {
  const cleaned = value.trim().replace(",", ".").replace(/\s/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function legacyHomeworkToQuestions(hw: {
  title: string;
  description?: string;
  maxScore?: number;
  checkType?: string;
}): TestQuestion[] {
  return [
    {
      id: newId("q"),
      type: "essay",
      prompt: hw.description?.trim() || hw.title,
      maxScore: hw.maxScore ?? (hw.checkType === "pass_fail" ? 1 : 5),
    },
  ];
}
