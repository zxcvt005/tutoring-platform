/**
 * Контракт доступа к данным для кабинетов.
 * LocalDemoProvider — текущий DemoStore; ApiDataProvider — HTTP API.
 * UI пока не переключён: интерфейс подготовлен для поэтапной замены.
 */

export type DataMode = "local" | "api";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: "director" | "teacher" | "student";
  teacherId: string | null;
  studentId: string | null;
};

export type AssignmentView = {
  assignment: {
    id: string;
    testId: string;
    topicId: string;
    teacherId: string;
    studentId: string;
    status: string;
    score: number | null;
    maxScore: number | null;
    feedback?: string | null;
  };
  snapshot: {
    title: string;
    description?: string | null;
    maxScore: number;
    questions: unknown[];
    answerKeys?: unknown;
  };
  answers: unknown[];
};

export type DataProvider = {
  readonly mode: DataMode;
  /** Auth (для api-режима; local может вернуть null) */
  login?(email: string, password: string): Promise<SessionUser>;
  logout?(): Promise<void>;
  me?(): Promise<SessionUser | null>;
  getAssignment?(id: string): Promise<AssignmentView>;
  saveAssignmentDraft?(
    id: string,
    answers: unknown[]
  ): Promise<{ ok: boolean; status: string }>;
  submitAssignment?(
    id: string,
    answers: unknown[],
    idempotencyKey?: string
  ): Promise<unknown>;
  reviewAssignment?(
    id: string,
    updates: {
      questionId: string;
      manualScore: number;
      teacherComment?: string;
    }[],
    overallFeedback?: string,
    idempotencyKey?: string
  ): Promise<unknown>;
  getTest?(id: string): Promise<unknown>;
};
