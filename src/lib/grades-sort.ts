import type { Attendance, Lesson, Student } from "@/lib/types";

function slotCancelledForStudent(
  lesson: Lesson,
  studentId: string,
  attendances?: Pick<Attendance, "lessonId" | "studentId" | "status">[]
): boolean {
  if (lesson.status === "cancelled") return true;
  const att = attendances?.find(
    (a) => a.lessonId === lesson.id && a.studentId === studentId
  );
  return att?.status === "cancelled" || att?.status === "rescheduled";
}

/**
 * Ближайшее занятие, которое ещё не началось.
 * Отмены и уже прошедшие (в том числе сегодняшние завершённые) не учитываются.
 * Перенос берётся по фактическому startsAt материализованного слота.
 */
export function nearestUpcomingLesson(
  lessons: Lesson[],
  studentId: string,
  now: Date,
  attendances?: Pick<Attendance, "lessonId" | "studentId" | "status">[]
): Lesson | null {
  const nowMs = now.getTime();
  const upcoming = lessons
    .filter((l) => {
      if (!l.studentIds.includes(studentId)) return false;
      if (l.status === "done") return false;
      if (slotCancelledForStudent(l, studentId, attendances)) return false;
      return new Date(l.startsAt).getTime() > nowMs;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  return upcoming[0] ?? null;
}

/**
 * 1) сегодня, ещё не началось;
 * 2) ближайшие по времени;
 * 3) следующие дни по хронологии;
 * 4) без будущего занятия — в конце.
 * В один день — по времени начала.
 */
export function compareStudentsByUpcomingLesson(
  aId: string,
  bId: string,
  lessons: Lesson[],
  now: Date,
  attendances?: Pick<Attendance, "lessonId" | "studentId" | "status">[]
): number {
  const a = nearestUpcomingLesson(lessons, aId, now, attendances);
  const b = nearestUpcomingLesson(lessons, bId, now, attendances);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

export function sortStudentsByUpcomingLesson<T extends Pick<Student, "id" | "fullName">>(
  students: T[],
  lessons: Lesson[],
  now: Date,
  attendances?: Pick<Attendance, "lessonId" | "studentId" | "status">[]
): T[] {
  return [...students].sort((a, b) => {
    const byLesson = compareStudentsByUpcomingLesson(
      a.id,
      b.id,
      lessons,
      now,
      attendances
    );
    if (byLesson !== 0) return byLesson;
    return a.fullName.localeCompare(b.fullName, "ru");
  });
}
