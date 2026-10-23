import { appDateKey, startOfAppDay } from "@/lib/app-time";
import type { Attendance, AttendanceStatus, Lesson } from "@/lib/types";

const FINAL_ATTENDANCE = new Set<AttendanceStatus>([
  "present",
  "absent_excused",
  "absent_unexcused",
  "cancelled",
  "rescheduled",
]);

export function isFinalAttendanceStatus(
  status?: AttendanceStatus | null
): boolean {
  return Boolean(status && FINAL_ATTENDANCE.has(status));
}

export function lessonHasOccurred(
  lesson: Pick<Lesson, "startsAt">,
  now: Date = new Date()
): boolean {
  return new Date(lesson.startsAt).getTime() <= now.getTime();
}

function attendanceForStudent(
  attendances: Pick<Attendance, "lessonId" | "studentId" | "status">[],
  lessonId: string,
  studentId: string
) {
  return attendances.find(
    (a) => a.lessonId === lessonId && a.studentId === studentId
  );
}

/**
 * Нужна явная отметка преподавателя: занятие уже должно было состояться,
 * не отменено, итоговой посещаемости нет.
 */
export function studentNeedsAttendanceMark(
  lesson: Pick<Lesson, "id" | "status" | "startsAt">,
  studentId: string,
  attendances: Pick<Attendance, "lessonId" | "studentId" | "status">[],
  now: Date = new Date()
): boolean {
  if (lesson.status === "cancelled") return false;
  if (!lessonHasOccurred(lesson, now)) return false;
  const att = attendanceForStudent(attendances, lesson.id, studentId);
  return !isFinalAttendanceStatus(att?.status);
}

export function lessonNeedsAttendanceMark(
  lesson: Pick<Lesson, "id" | "status" | "startsAt" | "studentIds">,
  attendances: Pick<Attendance, "lessonId" | "studentId" | "status">[],
  now: Date = new Date()
): boolean {
  if (lesson.status === "cancelled") return false;
  if (!lessonHasOccurred(lesson, now)) return false;
  if (lesson.studentIds.length === 0) return true;
  return lesson.studentIds.some((sid) =>
    studentNeedsAttendanceMark(lesson, sid, attendances, now)
  );
}

export type KafedraTodaySplit = {
  overdue: Lesson[];
  today: Lesson[];
};

/**
 * «Сегодня»: все слоты текущего московского дня.
 * «Пропущенные отметки»: прошлые дни, занятие уже должно было состояться,
 * итоговой отметки нет. Будущее, отмена и сохранённая отметка не попадают.
 */
export function splitKafedraTodayLessons(
  lessons: Lesson[],
  attendances: Pick<Attendance, "lessonId" | "studentId" | "status">[],
  now: Date = new Date()
): KafedraTodaySplit {
  const todayKey = appDateKey(now);
  const overdue: Lesson[] = [];
  const today: Lesson[] = [];

  for (const lesson of lessons) {
    const dayKey = appDateKey(lesson.startsAt);
    if (dayKey === todayKey) {
      today.push(lesson);
      continue;
    }
    if (dayKey > todayKey) continue;
    if (lessonNeedsAttendanceMark(lesson, attendances, now)) {
      overdue.push(lesson);
    }
  }

  overdue.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  today.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  return { overdue, today };
}

export function groupLessonsByAppDate(lessons: Lesson[]): {
  dateKey: string;
  lessons: Lesson[];
}[] {
  const map = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const key = appDateKey(lesson.startsAt);
    const list = map.get(key) ?? [];
    list.push(lesson);
    map.set(key, list);
  }
  return [...map.entries()].map(([dateKey, items]) => ({
    dateKey,
    lessons: items,
  }));
}

/** Успех только если сервер подтвердил сохранение. */
export function attendanceMarkFeedback(result: {
  ok: boolean;
  error?: string;
}): { saved: boolean; message: string | null } {
  if (result.ok) return { saved: true, message: null };
  const message =
    result.error?.trim() ||
    "Не удалось сохранить отметку. Проверьте связь и повторите действие.";
  return { saved: false, message };
}

export function startOfTodayInAppZone(now: Date = new Date()): Date {
  return startOfAppDay(now);
}
