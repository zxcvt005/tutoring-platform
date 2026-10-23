import type {
  HomeworkAssignment,
  HomeworkAssignmentStatus,
  Lesson,
} from "@/lib/types";

const COMPLETED: HomeworkAssignmentStatus[] = ["completed", "reviewed"];

export function isHomeworkComplete(
  status: HomeworkAssignmentStatus
): boolean {
  return COMPLETED.includes(status);
}

/**
 * Следующее занятие этого ученика после исходного урока (или после даты назначения).
 * Отменённые пропускаем: ищем ближайшее не отменённое.
 */
export function nextLessonAfterAssignment(
  assignment: Pick<HomeworkAssignment, "studentId" | "lessonId" | "assignedAt">,
  lessons: Lesson[],
  attendances: { lessonId: string; studentId: string }[] = []
): Lesson | null {
  void attendances;
  const source = assignment.lessonId
    ? lessons.find((l) => l.id === assignment.lessonId)
    : null;
  const afterMs = source
    ? new Date(source.startsAt).getTime()
    : assignment.assignedAt
      ? new Date(assignment.assignedAt).getTime()
      : 0;
  const upcoming = lessons
    .filter((l) => {
      if (!l.studentIds.includes(assignment.studentId)) return false;
      if (l.status === "cancelled") return false;
      if (assignment.lessonId && l.id === assignment.lessonId) return false;
      return new Date(l.startsAt).getTime() > afterMs;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  return upcoming[0] ?? null;
}

function lessonHasOccurred(
  lesson: Lesson,
  now: Date,
  attendances: { lessonId: string; studentId: string; status?: string }[],
  studentId: string
): boolean {
  if (lesson.status === "cancelled") return false;
  if (lesson.status === "done") return true;
  const marked = attendances.some(
    (a) => a.lessonId === lesson.id && a.studentId === studentId
  );
  if (marked) return true;
  return new Date(lesson.startsAt).getTime() <= now.getTime();
}

/**
 * ДЗ не выполнено к следующему занятию, если следующее индивидуальное занятие
 * ученика уже состоялось (или по нему есть отметка), а попытки ещё не закрыты.
 * Завершение только первой попытки не считается выполнением.
 */
export function isMissedNextLesson(
  assignment: HomeworkAssignment,
  lessons: Lesson[],
  now: Date,
  attendances: { lessonId: string; studentId: string; status?: string }[] = []
): boolean {
  if (isHomeworkComplete(assignment.status)) return false;
  const next = nextLessonAfterAssignment(assignment, lessons, attendances);
  if (!next) return false;
  return lessonHasOccurred(next, now, attendances, assignment.studentId);
}
