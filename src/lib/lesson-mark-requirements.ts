import { lessonHasOccurred } from "@/lib/kafedra-today";
import type { Lesson, LessonTopicLink } from "@/lib/types";

export const LESSON_MARK_CONTENT_ERROR =
  "Чтобы отметить занятие, укажите тему урока.";

export function lessonHasTopicForMark(
  lesson: Pick<Lesson, "topicId" | "lessonTopics">
): boolean {
  const topics: LessonTopicLink[] = lesson.lessonTopics ?? [];
  if (topics.some((t) => t.title.trim() || t.topicId)) return true;
  return Boolean(lesson.topicId);
}

export function canCompleteAttendanceMark(
  lesson: Pick<Lesson, "id" | "startsAt" | "topicId" | "lessonTopics">,
  now: Date = new Date()
): { ok: boolean; message?: string } {
  if (!lessonHasOccurred(lesson, now)) return { ok: true };
  if (lessonHasTopicForMark(lesson)) return { ok: true };
  return { ok: false, message: LESSON_MARK_CONTENT_ERROR };
}
