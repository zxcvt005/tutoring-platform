import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  attendances,
  auditLog,
  lessonRatings,
  lessonScheduleExceptions,
  lessonSchedules,
  lessonStudents,
  lessonTopics,
  lessons,
  tariffLessonDebitState,
  tariffLessonLedger,
  testAssignments,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden, notFound } from "@/server/errors";
import { recordChatSystemEventSafe } from "@/server/services/chat-events";
import { settleLessonPayroll } from "@/server/services/teacher-payroll-service";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

const HOMEWORK_STARTED = new Set([
  "in_progress",
  "remaining_questions",
  "attempt1_submitted",
  "attempt2_in_progress",
  "completed",
  "reviewed",
]);

/**
 * Сбрасывает результаты текущего проведения занятия, не удаляя само занятие.
 * Повторный вызов идемпотентен: повторно не сторнирует баланс и начисления.
 */
export async function resetLessonConduct(
  db: AppDb,
  ctx: AuthContext,
  lessonId: string
) {
  requireRoles(ctx, ["director", "teacher"]);
  const id = lessonId.trim();
  if (!id) throw notFound("Занятие не найдено");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from lessons where id = ${id} for update`);
    const conn = tx as unknown as AppDb;
    const [lesson] = await conn
      .select()
      .from(lessons)
      .where(eq(lessons.id, id))
      .limit(1);
    if (!lesson || lesson.organizationId !== ctx.organizationId) {
      throw notFound("Занятие не найдено");
    }
    if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) {
      throw forbidden();
    }

    const participants = await conn
      .select({ studentId: lessonStudents.studentId })
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, id));
    const attRows = await conn
      .select({ studentId: attendances.studentId })
      .from(attendances)
      .where(eq(attendances.lessonId, id));
    const topicRows = await conn
      .select({ id: lessonTopics.id })
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, id));
    const hwRows = await conn
      .select()
      .from(testAssignments)
      .where(
        and(
          eq(testAssignments.lessonId, id),
          eq(testAssignments.sourceKind, "homework")
        )
      );
    const activeHw = hwRows.filter((row) => row.status !== "withdrawn");

    const alreadyReset =
      lesson.status === "planned" &&
      attRows.length === 0 &&
      topicRows.length === 0 &&
      activeHw.length === 0 &&
      !lesson.topicId;

    if (alreadyReset) {
      return { ok: true as const, alreadyReset: true as const };
    }

    const debitStates = await conn
      .select()
      .from(tariffLessonDebitState)
      .where(eq(tariffLessonDebitState.lessonId, id));
    for (const state of debitStates) {
      await conn.execute(
        sql`select id from student_tariff_assignments where id = ${state.assignmentId} for update`
      );
      await conn.insert(tariffLessonLedger).values({
        id: newId("led"),
        organizationId: ctx.organizationId,
        assignmentId: state.assignmentId,
        lessonId: id,
        studentId: state.studentId,
        delta: 1,
        reason: "reversal",
        attendanceStatus: null,
        supersedesId: state.ledgerEntryId,
        actorUserId: ctx.userId,
      });
      await conn
        .delete(tariffLessonDebitState)
        .where(
          and(
            eq(tariffLessonDebitState.lessonId, id),
            eq(tariffLessonDebitState.studentId, state.studentId)
          )
        );
    }

    await conn.delete(attendances).where(eq(attendances.lessonId, id));
    await conn.delete(lessonTopics).where(eq(lessonTopics.lessonId, id));

    let subject: string | null = null;
    if (lesson.scheduleId) {
      const [schedule] = await conn
        .select({ subject: lessonSchedules.subject })
        .from(lessonSchedules)
        .where(eq(lessonSchedules.id, lesson.scheduleId))
        .limit(1);
      subject = schedule?.subject ?? null;
    }

    await conn
      .update(lessons)
      .set({
        status: "planned",
        topicId: null,
        subject,
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, id));

    for (const hw of activeHw) {
      if (HOMEWORK_STARTED.has(hw.status)) {
        await conn
          .update(testAssignments)
          .set({ status: "withdrawn", updatedAt: new Date() })
          .where(eq(testAssignments.id, hw.id));
      } else {
        await conn.delete(testAssignments).where(eq(testAssignments.id, hw.id));
      }
    }

    await conn.delete(lessonRatings).where(eq(lessonRatings.lessonId, id));

    if (lesson.scheduleId && lesson.scheduleOccurrenceKey) {
      await conn
        .delete(lessonScheduleExceptions)
        .where(
          and(
            eq(lessonScheduleExceptions.scheduleId, lesson.scheduleId),
            eq(lessonScheduleExceptions.occurrenceKey, lesson.scheduleOccurrenceKey),
            eq(lessonScheduleExceptions.reason, "cancelled")
          )
        );
    }

    await conn.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "lesson_conduct_reset",
      entityType: "lesson",
      entityId: id,
      payload: {
        previousStatus: lesson.status,
        attendanceCleared: attRows.length,
        homeworkWithdrawn: activeHw.filter((row) => HOMEWORK_STARTED.has(row.status))
          .length,
        homeworkDeleted: activeHw.filter((row) => !HOMEWORK_STARTED.has(row.status))
          .length,
        participantCount: participants.length,
      },
    });

    for (const p of participants) {
      await recordChatSystemEventSafe(conn, {
        organizationId: lesson.organizationId,
        studentId: p.studentId,
        teacherId: lesson.teacherId,
        eventType: "lesson_restored",
        eventKey: `lesson_restored:${id}:${p.studentId}:${Date.now()}`,
        title: "Проведение занятия сброшено",
        lessonId: id,
      });
    }

    return { ok: true as const, alreadyReset: false as const };
  }).then(async (result) => {
    if (!result.alreadyReset) {
      await settleLessonPayroll(db, ctx, id);
    }
    return result;
  });
}
