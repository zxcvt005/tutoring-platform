import { lessonHistoryAttendanceLabel } from "@/lib/format";
import { isHomeworkComplete } from "@/lib/homework-missed";
import { topicsForLesson, type LessonTopicView } from "@/lib/lesson-topics";
import type {
  Attendance,
  HomeworkAssignment,
  Lesson,
  Topic,
} from "@/lib/types";

export function assignmentsForLesson(
  assignments: HomeworkAssignment[],
  lessonId: string,
  studentId: string
): HomeworkAssignment[] {
  return assignments.filter(
    (a) => a.lessonId === lessonId && a.studentId === studentId
  );
}

export function attendanceForLesson(
  attendances: Attendance[],
  lessonId: string,
  studentId: string
): Attendance | undefined {
  return attendances.find(
    (a) => a.lessonId === lessonId && a.studentId === studentId
  );
}

export function lessonAlreadyOccurred(lesson: Lesson, now: Date): boolean {
  return new Date(lesson.startsAt).getTime() <= now.getTime();
}

/** Только занятия, которые уже должны были состояться, новее сверху. */
export function historyLessonsNewestFirst(
  lessons: Lesson[],
  studentId: string,
  now: Date = new Date()
): Lesson[] {
  return lessons
    .filter((l) => l.studentIds.includes(studentId))
    .filter((l) => lessonAlreadyOccurred(l, now))
    .sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );
}

export function topicListForLesson(
  lesson: Lesson,
  topics: Topic[]
): LessonTopicView[] {
  return topicsForLesson(lesson, topics);
}

export function topicTextForLesson(
  lesson: Lesson,
  topics: Topic[]
): { title: string; description?: string } {
  const all = topicsForLesson(lesson, topics);
  if (all.length === 0) {
    return { title: "Тема не указана" };
  }
  return {
    title: all.map((t) => t.title).join(" · "),
    description: all.find((t) => t.description)?.description,
  };
}

export function lessonHistoryStatusLabel(
  lesson: Lesson,
  attendance: Attendance | undefined,
  now: Date = new Date()
): string {
  return lessonHistoryAttendanceLabel({
    lessonStatus: lesson.status,
    attendanceStatus: attendance?.status,
    startsAt: lesson.startsAt,
    now,
  });
}

export function homeworkStillOpen(a: HomeworkAssignment): boolean {
  return !isHomeworkComplete(a.status);
}

/** Цвет левой полосы в истории: отмена преподавателя имеет приоритет. */
export type HistoryStripeTone =
  | "present"
  | "absent_unexcused"
  | "absent_excused"
  | "cancelled"
  | "neutral";

export function historyStripeTone(
  lesson: Pick<Lesson, "status">,
  attendance?: Pick<Attendance, "status"> | null
): HistoryStripeTone {
  if (
    lesson.status === "cancelled" ||
    attendance?.status === "cancelled" ||
    attendance?.status === "rescheduled"
  ) {
    return "cancelled";
  }
  if (attendance?.status === "present") return "present";
  if (attendance?.status === "absent_unexcused") return "absent_unexcused";
  if (attendance?.status === "absent_excused") return "absent_excused";
  return "neutral";
}

export const historyStripeClass: Record<HistoryStripeTone, string> = {
  present: "border-l-[3px] border-l-emerald-500",
  absent_unexcused: "border-l-[3px] border-l-destructive",
  absent_excused: "border-l-[3px] border-l-orange-500",
  cancelled: "border-l-[3px] border-l-sky-500",
  neutral: "border-l-[3px] border-l-transparent",
};
