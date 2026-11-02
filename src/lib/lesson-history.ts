import { appZonedParts, formatInAppZone } from "@/lib/app-time";
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
  present: "border-l-[#8fbfa0]",
  absent_unexcused: "border-l-[#e3a4aa]",
  absent_excused: "border-l-[#e3b08a]",
  cancelled: "border-l-[#c5c2d4]",
  neutral: "border-l-[#e4c48a]",
};

export type HistoryFilterId =
  | "all"
  | "present"
  | "missed"
  | "cancelled"
  | "pending";

export type HistoryStatusPresentation = {
  filter: Exclude<HistoryFilterId, "all">;
  title: string;
  detail: string | null;
};

/** Подпись строки списка. Правила те же, что у historyStripeTone и текстовых статусов. */
export function historyStatusPresentation(
  lesson: Pick<Lesson, "status">,
  attendance?: Pick<Attendance, "status"> | null
): HistoryStatusPresentation {
  const tone = historyStripeTone(lesson, attendance);
  if (tone === "present") {
    return { filter: "present", title: "Был на занятии", detail: null };
  }
  if (tone === "absent_excused") {
    return {
      filter: "missed",
      title: "Не был",
      detail: "уважительная причина",
    };
  }
  if (tone === "absent_unexcused") {
    return {
      filter: "missed",
      title: "Не был",
      detail: "неуважительная причина",
    };
  }
  if (tone === "cancelled") {
    if (lesson.status !== "cancelled" && attendance?.status === "rescheduled") {
      return { filter: "cancelled", title: "Перенесено", detail: null };
    }
    return { filter: "cancelled", title: "Отменено", detail: "преподавателем" };
  }
  return { filter: "pending", title: "Ожидает отметки", detail: null };
}

export function lessonMatchesHistoryFilter(
  filter: HistoryFilterId,
  lesson: Pick<Lesson, "status">,
  attendance?: Pick<Attendance, "status"> | null
): boolean {
  if (filter === "all") return true;
  return historyStatusPresentation(lesson, attendance).filter === filter;
}

export type HistoryMonthGroup<T> = {
  key: string;
  title: string;
  items: T[];
};

/** Месяц считается в часовом поясе приложения. Пустые месяцы сюда не попадают. */
export function groupHistoryByMonth<T extends { startsAt: string }>(
  lessons: readonly T[]
): HistoryMonthGroup<T>[] {
  const groups: HistoryMonthGroup<T>[] = [];
  for (const lesson of lessons) {
    const parts = appZonedParts(lesson.startsAt);
    const key = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const current = groups[groups.length - 1];
    if (current?.key === key) {
      current.items.push(lesson);
      continue;
    }
    const raw = formatInAppZone(lesson.startsAt, {
      month: "long",
      year: "numeric",
    }).replace(/\s*г\.\s*$/, "");
    const title = raw.charAt(0).toLocaleUpperCase("ru-RU") + raw.slice(1);
    groups.push({ key, title, items: [lesson] });
  }
  return groups;
}

export function historyLessonDateParts(iso: string): {
  dayMonth: string;
  weekday: string;
} {
  return {
    dayMonth: formatInAppZone(iso, { day: "numeric", month: "short" }),
    weekday: formatInAppZone(iso, { weekday: "short" }).replace(/\.$/, ""),
  };
}
