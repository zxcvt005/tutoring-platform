import type { HomeworkAssignmentStatus, IntensiveAssignmentTest } from "@/lib/types";

export type IntensiveTestRunStatus =
  | "not_started"
  | "in_progress"
  | "done"
  | "overdue";

export const INTENSIVE_TEST_STATUS_LABEL: Record<IntensiveTestRunStatus, string> = {
  not_started: "Не начат",
  in_progress: "В процессе",
  done: "Выполнен",
  overdue: "Просрочен",
};

const STARTED = new Set<HomeworkAssignmentStatus>([
  "in_progress",
  "remaining_questions",
  "attempt1_submitted",
  "attempt2_in_progress",
]);

export function intensiveTestRunStatus(
  test: Pick<IntensiveAssignmentTest, "status" | "dueAt">,
  now = Date.now()
): IntensiveTestRunStatus {
  if (intensiveTestIsDone(test.status)) return "done";
  const due = new Date(test.dueAt).getTime();
  if (test.status === "overdue" || (Number.isFinite(due) && due < now)) {
    return "overdue";
  }
  if (STARTED.has(test.status)) return "in_progress";
  return "not_started";
}

export function intensiveStudentLabel(tests: { status: HomeworkAssignmentStatus }[]): {
  label: "В процессе" | "Готово" | "Без тестов";
  done: number;
  total: number;
} {
  const progress = intensiveProgress(tests);
  if (progress.total === 0) {
    return { label: "Без тестов", done: 0, total: 0 };
  }
  return {
    label: progress.done === progress.total ? "Готово" : "В процессе",
    done: progress.done,
    total: progress.total,
  };
}

const DONE = new Set<HomeworkAssignmentStatus>(["completed", "reviewed"]);

export function intensiveTestIsDone(status: HomeworkAssignmentStatus): boolean {
  return DONE.has(status);
}

export function intensiveProgress(tests: { status: HomeworkAssignmentStatus }[]): {
  done: number;
  total: number;
} {
  return {
    done: tests.filter((test) => intensiveTestIsDone(test.status)).length,
    total: tests.length,
  };
}

export type IntensiveDeadlineSummary =
  | { kind: "none" }
  | { kind: "done" }
  | { kind: "upcoming" | "overdue"; dueAt: string };

export function intensiveDeadlineSummary(
  tests: { status: HomeworkAssignmentStatus; dueAt: string }[],
  now = Date.now()
): IntensiveDeadlineSummary {
  if (tests.length === 0) return { kind: "none" };
  const open = tests.filter((test) => !intensiveTestIsDone(test.status));
  if (open.length === 0) return { kind: "done" };
  const sorted = [...open].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  );
  const next = sorted[0]!;
  const overdue = new Date(next.dueAt).getTime() < now;
  return { kind: overdue ? "overdue" : "upcoming", dueAt: next.dueAt };
}

export function intensiveDeadlinesReady(
  testIds: string[],
  deadlines: Record<string, string>
): boolean {
  return testIds.every((id) => Boolean(deadlines[id]?.trim()));
}

export function moveIntensiveTest<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || next < 0 || index >= items.length || next >= items.length) {
    return items;
  }
  const copy = items.slice();
  const current = copy[index]!;
  copy[index] = copy[next]!;
  copy[next] = current;
  return copy;
}
