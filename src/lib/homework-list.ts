import { formatAssignedDate } from "@/lib/format";
import { isHomeworkComplete } from "@/lib/homework-missed";
import type { HomeworkAssignment, Lesson } from "@/lib/types";

export type AssignedDateInfo = {
  label: string;
  source: "assignedAt" | "lesson" | "unknown";
};

export type HomeworkSectionKey =
  | "overdue"
  | "new"
  | "incomplete"
  | "completed";

function lessonForAssignment(
  assignment: Pick<HomeworkAssignment, "lessonId">,
  lessons: Lesson[]
): Lesson | undefined {
  if (!assignment.lessonId) return undefined;
  return lessons.find((l) => l.id === assignment.lessonId);
}

export function homeworkAssignedAtMs(
  assignment: Pick<HomeworkAssignment, "assignedAt" | "lessonId">,
  lessons: Lesson[] = []
): number {
  if (assignment.assignedAt) {
    const t = new Date(assignment.assignedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const lesson = lessonForAssignment(assignment, lessons);
  if (lesson) {
    const t = new Date(lesson.startsAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function homeworkAssignedDateInfo(
  assignment: Pick<HomeworkAssignment, "assignedAt" | "lessonId">,
  lessons: Lesson[] = []
): AssignedDateInfo {
  if (assignment.assignedAt) {
    return {
      label: `Назначено ${formatAssignedDate(assignment.assignedAt)}`,
      source: "assignedAt",
    };
  }
  const lesson = lessonForAssignment(assignment, lessons);
  if (lesson) {
    return {
      label: `Назначено по занятию ${formatAssignedDate(lesson.startsAt)}`,
      source: "lesson",
    };
  }
  return { label: "Дата назначения неизвестна", source: "unknown" };
}

export function isMissedHomework(a: HomeworkAssignment): boolean {
  return Boolean(a.missedNextLesson) && !isHomeworkComplete(a.status);
}

/**
 * Секция «Завершённые»: результат окончательный.
 * `completed` с ожиданием ручной проверки остаётся в «Незавершённых».
 */
export function isHomeworkSectionComplete(a: HomeworkAssignment): boolean {
  return a.status === "reviewed";
}

export function isNewHomework(a: HomeworkAssignment): boolean {
  return a.status === "assigned" && !isMissedHomework(a);
}

/**
 * Одно назначение — ровно в одной секции:
 * Просроченные → Новые → Незавершённые → Завершённые.
 */
export function homeworkSectionFor(
  a: HomeworkAssignment
): HomeworkSectionKey {
  if (isMissedHomework(a)) return "overdue";
  if (isHomeworkSectionComplete(a)) return "completed";
  if (isNewHomework(a)) return "new";
  return "incomplete";
}

function byAssignedNewest(
  a: HomeworkAssignment,
  b: HomeworkAssignment,
  lessons: Lesson[]
): number {
  return homeworkAssignedAtMs(b, lessons) - homeworkAssignedAtMs(a, lessons);
}

/**
 * 1) Просроченные
 * 2) Новые
 * 3) Незавершённые
 * 4) Завершённые
 */
export function sortHomeworkForStudent(
  assignments: HomeworkAssignment[],
  lessons: Lesson[] = []
): {
  overdue: HomeworkAssignment[];
  /** @deprecated используйте overdue */
  missed: HomeworkAssignment[];
  newItems: HomeworkAssignment[];
  incomplete: HomeworkAssignment[];
  completed: HomeworkAssignment[];
  ordered: HomeworkAssignment[];
} {
  const overdue: HomeworkAssignment[] = [];
  const newItems: HomeworkAssignment[] = [];
  const incomplete: HomeworkAssignment[] = [];
  const completed: HomeworkAssignment[] = [];

  for (const a of assignments) {
    const section = homeworkSectionFor(a);
    if (section === "overdue") overdue.push(a);
    else if (section === "new") newItems.push(a);
    else if (section === "completed") completed.push(a);
    else incomplete.push(a);
  }

  overdue.sort((a, b) => byAssignedNewest(a, b, lessons));
  newItems.sort((a, b) => byAssignedNewest(a, b, lessons));
  incomplete.sort((a, b) => byAssignedNewest(a, b, lessons));
  completed.sort((a, b) => byAssignedNewest(a, b, lessons));

  return {
    overdue,
    missed: overdue,
    newItems,
    incomplete,
    completed,
    ordered: [...overdue, ...newItems, ...incomplete, ...completed],
  };
}
