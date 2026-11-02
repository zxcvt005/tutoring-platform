import { appDateKey, appTimeHm } from "@/lib/app-time";

/** Максимум учеников у одного преподавателя в одном слоте (дата + время начала). */
export const MAX_SLOT_STUDENTS = 5;

export const SLOT_PAY_PRESENT_COUNTS = [1, 2, 3, 4, 5] as const;
export type SlotPayPresentCount = (typeof SLOT_PAY_PRESENT_COUNTS)[number];

export type TeacherSlotKey = {
  teacherId: string;
  slotDate: string;
  slotStartTime: string;
};

export type SlotLessonLike = {
  id: string;
  teacherId: string;
  startsAt: string;
  status: "planned" | "done" | "cancelled";
  studentIds: string[];
};

export function teacherSlotKey(
  teacherId: string,
  startsAt: string | Date
): TeacherSlotKey {
  return {
    teacherId,
    slotDate: appDateKey(startsAt),
    slotStartTime: appTimeHm(startsAt),
  };
}

export function teacherSlotLockKey(
  organizationId: string,
  key: TeacherSlotKey
): string {
  return `payroll:${organizationId}:${key.teacherId}:${key.slotDate}:${key.slotStartTime}`;
}

export function sameTeacherSlot(
  lesson: Pick<SlotLessonLike, "teacherId" | "startsAt">,
  key: TeacherSlotKey
): boolean {
  const lessonKey = teacherSlotKey(lesson.teacherId, lesson.startsAt);
  return (
    lessonKey.teacherId === key.teacherId &&
    lessonKey.slotDate === key.slotDate &&
    lessonKey.slotStartTime === key.slotStartTime
  );
}

export function lessonsInTeacherSlot(
  lessons: SlotLessonLike[],
  key: TeacherSlotKey
): SlotLessonLike[] {
  return lessons.filter((lesson) => sameTeacherSlot(lesson, key));
}

/** Уникальные ученики активных (не отменённых) занятий слота. */
export function countStudentsInTeacherSlot(
  lessons: SlotLessonLike[],
  key: TeacherSlotKey,
  excludeLessonId?: string
): number {
  const ids = new Set<string>();
  for (const lesson of lessons) {
    if (excludeLessonId && lesson.id === excludeLessonId) continue;
    if (lesson.status === "cancelled") continue;
    if (!sameTeacherSlot(lesson, key)) continue;
    for (const studentId of lesson.studentIds) {
      if (studentId) ids.add(studentId);
    }
  }
  return ids.size;
}

export function wouldExceedSlotStudentLimit(
  lessons: SlotLessonLike[],
  input: {
    teacherId: string;
    startsAt: string;
    studentIds: string[];
    excludeLessonId?: string;
  }
): boolean {
  const key = teacherSlotKey(input.teacherId, input.startsAt);
  const current = countStudentsInTeacherSlot(
    lessons,
    key,
    input.excludeLessonId
  );
  return current + input.studentIds.length > MAX_SLOT_STUDENTS;
}

export const SLOT_STUDENT_LIMIT_ERROR =
  "В одном слоте не может быть больше 5 учеников у преподавателя";
