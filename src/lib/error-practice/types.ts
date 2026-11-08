import type { StudentAnswer, TestQuestion } from "@/lib/types";

export const ERROR_PRACTICE_TARGET_COUNT = 10;
export const ERROR_BANK_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export type ErrorBankStatus = "waiting" | "available" | "mastered";
export type ErrorPracticeMode = "random" | "kim";
export type ErrorPracticeItemSource = "bank" | "pool";

/** Снимок вопроса для банка и сессии: публичная часть + ключи на сервере. */
export type ErrorQuestionSnapshot = {
  question: TestQuestion;
  sourceTestId?: string | null;
  sourceAssignmentId?: string | null;
};

export type ErrorBankKimStat = {
  kimNumber: number | null;
  label: string;
  active: number;
  available: number;
  waiting: number;
};

export type ErrorBankSummary = {
  activeCount: number;
  availableCount: number;
  waitingCount: number;
  masteredCount: number;
  byKim: ErrorBankKimStat[];
  nextAvailableAt: string | null;
};

export type ErrorPracticeSessionPublic = {
  id: string;
  mode: ErrorPracticeMode;
  kimNumber: number | null;
  status: "active" | "completed";
  questionCount: number;
  correctCount: number;
  incorrectCount: number;
  percent: number | null;
  startedAt: string;
  completedAt: string | null;
  currentIndex: number;
  items: ErrorPracticeItemPublic[];
};

export type ErrorPracticeItemPublic = {
  id: string;
  position: number;
  sourceKind: ErrorPracticeItemSource;
  kimNumber: number | null;
  sourceTestId: string | null;
  answered: boolean;
  isCorrect: boolean | null;
  /** Без ключей, пока не ответили. */
  question: TestQuestion;
  explanation?: string | null;
  answer?: StudentAnswer | null;
  bankMastered?: boolean | null;
  bankReturnedToWaiting?: boolean | null;
};
