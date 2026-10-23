import {
  APP_TIME_ZONE,
  APP_TIME_ZONE_LABEL,
  appTimeHm,
  appZonedParts,
  formatInAppZone,
} from "@/lib/app-time";
import type { Attendance, AttendanceStatus, Lesson } from "@/lib/types";

export { APP_TIME_ZONE, APP_TIME_ZONE_LABEL };

export type AuditoriaLessonCategory =
  | "present"
  | "absent"
  | "future"
  | "cancelled"
  | "unmarked";

/** Цвета легенды календаря: был / не был / будущее. */
export type AuditoriaLegendCategory = "present" | "absent" | "future";

const ABSENT: AttendanceStatus[] = ["absent_excused", "absent_unexcused"];
const TEACHER_CANCELLED: AttendanceStatus[] = ["cancelled", "rescheduled"];

export function classifyAuditoriaLesson(
  lesson: Pick<Lesson, "status" | "startsAt">,
  attendance: Pick<Attendance, "status"> | undefined,
  now: Date
): AuditoriaLessonCategory {
  if (
    lesson.status === "cancelled" ||
    (attendance && TEACHER_CANCELLED.includes(attendance.status))
  ) {
    return "cancelled";
  }
  if (attendance?.status === "present") return "present";
  if (attendance && ABSENT.includes(attendance.status)) return "absent";
  if (new Date(lesson.startsAt).getTime() > now.getTime()) return "future";
  return "unmarked";
}

/** Отмена преподавателя не красится как отсутствие ученика. */
export function legendCategoryForLesson(
  category: AuditoriaLessonCategory
): AuditoriaLegendCategory | null {
  if (category === "present" || category === "absent" || category === "future") {
    return category;
  }
  return null;
}

export function calendarDisplayStatus(
  category: AuditoriaLessonCategory
): "planned" | "done" | "cancelled" | "missed" {
  if (category === "cancelled") return "cancelled";
  const legend = legendCategoryForLesson(category);
  if (legend === "present") return "done";
  if (legend === "absent") return "missed";
  return "planned";
}

export function attendanceForStudent(
  attendances: Attendance[],
  lessonId: string,
  studentId: string
): Attendance | undefined {
  return attendances.find(
    (a) => a.lessonId === lessonId && a.studentId === studentId
  );
}

export function formatTimeInAppZone(iso: string): string {
  return formatInAppZone(iso, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capitalizeRu(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type WeekdaySlot = {
  weekday: string;
  time: string;
  weekdayIndex: number;
};

/**
 * Дни недели и время следующих занятий — уникальные слоты, не полный список уроков.
 */
export function upcomingWeekdaySlots(
  lessons: Lesson[],
  studentId: string,
  now: Date
): WeekdaySlot[] {
  const upcoming = lessons
    .filter((l) => {
      if (!l.studentIds.includes(studentId)) return false;
      if (l.status === "cancelled") return false;
      return new Date(l.startsAt).getTime() > now.getTime();
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );

  const seen = new Set<string>();
  const slots: WeekdaySlot[] = [];
  for (const lesson of upcoming) {
    const weekday = capitalizeRu(
      formatInAppZone(lesson.startsAt, { weekday: "long" })
    );
    const time = appTimeHm(lesson.startsAt);
    const key = `${weekday}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const weekdayIndex = appZonedParts(lesson.startsAt).weekday - 1;
    slots.push({ weekday, time, weekdayIndex });
  }
  return slots.sort((a, b) => {
    if (a.weekdayIndex !== b.weekdayIndex) return a.weekdayIndex - b.weekdayIndex;
    return a.time.localeCompare(b.time, "ru");
  });
}
