import { and, eq } from "drizzle-orm";

function isPgUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 4 && current && typeof current === "object"; i += 1) {
    const code = (current as { code?: string }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

import type { ChatSystemEventPayload } from "@/lib/chat/types";
import { chatMessagePreview } from "@/lib/chat/preview";
import { chats, chatMessages, students, teachers } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { getOrCreateChatPair, newChatEntityId } from "@/server/services/chat-service";

export type ChatEventType =
  | "attendance_saved"
  | "lesson_cancelled"
  | "lesson_conducted"
  | "topic_set"
  | "homework_assigned"
  | "homework_completed"
  | "homework_awaiting_review"
  | "theory_assigned"
  | "theory_completed"
  | "theory_awaiting_review";

export async function recordChatSystemEvent(
  db: AppDb,
  input: {
    organizationId: string;
    studentId: string;
    teacherId: string;
    eventType: ChatEventType;
    eventKey: string;
    title: string;
    lessonId?: string | null;
    assignmentId?: string | null;
    theoryAssignmentId?: string | null;
    theoryTitle?: string;
    attendanceStatus?: string;
    topicTitle?: string;
    homeworkTitle?: string;
  }
): Promise<{ created: boolean }> {
  const [student] = await db
    .select({ id: students.id, organizationId: students.organizationId })
    .from(students)
    .where(eq(students.id, input.studentId))
    .limit(1);
  const [teacher] = await db
    .select({ id: teachers.id, organizationId: teachers.organizationId })
    .from(teachers)
    .where(eq(teachers.id, input.teacherId))
    .limit(1);
  if (
    !student ||
    !teacher ||
    student.organizationId !== input.organizationId ||
    teacher.organizationId !== input.organizationId
  ) {
    return { created: false };
  }

  const chat = await getOrCreateChatPair(db, {
    organizationId: input.organizationId,
    studentId: input.studentId,
    teacherId: input.teacherId,
  });

  const payload: ChatSystemEventPayload = {
    eventType: input.eventType,
    title: input.title,
    lessonId: input.lessonId ?? undefined,
    assignmentId: input.assignmentId ?? undefined,
    attendanceStatus: input.attendanceStatus,
    topicTitle: input.topicTitle,
    homeworkTitle: input.homeworkTitle,
    theoryAssignmentId: input.theoryAssignmentId ?? undefined,
    theoryTitle: input.theoryTitle,
    hrefStudent: hrefForStudent(input),
    hrefTeacher: hrefForTeacher(input),
  };

  const id = newChatEntityId("msg");
  try {
    await db.insert(chatMessages).values({
      id,
      chatId: chat.id,
      organizationId: input.organizationId,
      type: "system_event",
      authorUserId: null,
      body: chatMessagePreview({
        type: "system_event",
        eventPayload: payload,
      }),
      eventType: input.eventType,
      eventPayload: payload,
      eventKey: input.eventKey,
      relatedLessonId: input.lessonId ?? null,
      relatedAssignmentId: input.assignmentId ?? null,
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) return { created: false };
    throw err;
  }

  await db
    .update(chats)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(and(eq(chats.id, chat.id)));
  return { created: true };
}

export async function recordChatSystemEventSafe(
  db: AppDb,
  input: Parameters<typeof recordChatSystemEvent>[1]
): Promise<void> {
  try {
    await recordChatSystemEvent(db, input);
  } catch (err) {
    console.error("[chat-event]", input.eventType, err);
  }
}

function hrefForStudent(input: {
  lessonId?: string | null;
  assignmentId?: string | null;
  theoryAssignmentId?: string | null;
}): string | null {
  if (input.theoryAssignmentId) {
    return `/auditoria/theory/${input.theoryAssignmentId}`;
  }
  if (input.assignmentId) return `/auditoria/homework/${input.assignmentId}`;
  if (input.lessonId) return `/auditoria/history/${input.lessonId}`;
  return null;
}

function hrefForTeacher(input: {
  lessonId?: string | null;
  assignmentId?: string | null;
  theoryAssignmentId?: string | null;
}): string | null {
  if (input.theoryAssignmentId) return `/kafedra/grades`;
  if (input.assignmentId) return `/kafedra/grades`;
  if (input.lessonId) return `/kafedra/schedule`;
  return null;
}

export function attendanceEventTitle(status: string): string {
  if (status === "present") return "Посещаемость отмечена: был";
  if (status === "absent_excused") {
    return "Посещаемость отмечена: уважительная причина";
  }
  if (status === "absent_unexcused") {
    return "Посещаемость отмечена: неуважительная причина";
  }
  return "Посещаемость отмечена";
}
