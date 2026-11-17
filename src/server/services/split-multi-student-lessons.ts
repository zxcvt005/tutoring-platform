import { and, asc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  attendances,
  lessonDebitState,
  lessonRatings,
  lessonScheduleStudents,
  lessonSchedules,
  lessonStudents,
  lessonTopics,
  lessons,
  studentLessonLedger,
  testAssignments,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/**
 * Разбивает legacy-занятия и шаблоны с несколькими учениками на независимые
 * индивидуальные записи (один ученик на lesson_id / schedule_id).
 * Первый ученик остаётся на исходной записи; остальным создаются копии.
 */
export async function splitMultiStudentLessons(db: AppDb): Promise<{
  splitLessons: number;
  createdLessons: number;
  splitSchedules: number;
  createdSchedules: number;
}> {
  const grouped = await db
    .select({
      lessonId: lessonStudents.lessonId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(lessonStudents)
    .groupBy(lessonStudents.lessonId)
    .having(sql`count(*) > 1`);

  let splitLessons = 0;
  let createdLessons = 0;

  for (const row of grouped) {
    const lessonId = row.lessonId;
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    if (!lesson) continue;

    const links = await db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, lessonId))
      .orderBy(asc(lessonStudents.studentId));
    if (links.length <= 1) continue;

    const [keep, ...rest] = links;
    if (!keep) continue;

    const topicRows = await db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, lessonId));

    for (const link of rest) {
      const newLessonId = newId("l");
      await db.insert(lessons).values({
        id: newLessonId,
        organizationId: lesson.organizationId,
        teacherId: lesson.teacherId,
        directionId: lesson.directionId,
        topicId: lesson.topicId,
        scheduleId: null,
        scheduleOccurrenceKey: null,
        subject: lesson.subject,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
        status: lesson.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(lessonStudents).values({
        lessonId: newLessonId,
        studentId: link.studentId,
      });
      if (topicRows.length) {
        await db.insert(lessonTopics).values(
          topicRows.map((t) => ({
            id: newId("lt"),
            organizationId: t.organizationId,
            lessonId: newLessonId,
            topicId: t.topicId,
            title: t.title,
            sortOrder: t.sortOrder,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );
      }
      // Перенос через delete+insert: PK (lesson_id, student_id) нельзя
      // надёжно менять одним UPDATE во всех драйверах.
      const attRows = await db
        .select()
        .from(attendances)
        .where(
          and(
            eq(attendances.lessonId, lessonId),
            eq(attendances.studentId, link.studentId)
          )
        );
      if (attRows.length) {
        await db
          .delete(attendances)
          .where(
            and(
              eq(attendances.lessonId, lessonId),
              eq(attendances.studentId, link.studentId)
            )
          );
        await db.insert(attendances).values(
          attRows.map((row) => ({
            lessonId: newLessonId,
            studentId: row.studentId,
            status: row.status,
            updatedAt: row.updatedAt,
          }))
        );
      }
      await db
        .update(testAssignments)
        .set({ lessonId: newLessonId, updatedAt: new Date() })
        .where(
          and(
            eq(testAssignments.lessonId, lessonId),
            eq(testAssignments.studentId, link.studentId)
          )
        );
      const ratingRows = await db
        .select()
        .from(lessonRatings)
        .where(
          and(
            eq(lessonRatings.lessonId, lessonId),
            eq(lessonRatings.studentId, link.studentId)
          )
        );
      if (ratingRows.length) {
        await db
          .delete(lessonRatings)
          .where(
            and(
              eq(lessonRatings.lessonId, lessonId),
              eq(lessonRatings.studentId, link.studentId)
            )
          );
        await db.insert(lessonRatings).values(
          ratingRows.map((row) => ({
            ...row,
            lessonId: newLessonId,
            updatedAt: new Date(),
          }))
        );
      }
      const debitRows = await db
        .select()
        .from(lessonDebitState)
        .where(
          and(
            eq(lessonDebitState.lessonId, lessonId),
            eq(lessonDebitState.studentId, link.studentId)
          )
        );
      if (debitRows.length) {
        await db
          .delete(lessonDebitState)
          .where(
            and(
              eq(lessonDebitState.lessonId, lessonId),
              eq(lessonDebitState.studentId, link.studentId)
            )
          );
        await db.insert(lessonDebitState).values(
          debitRows.map((row) => ({
            ...row,
            lessonId: newLessonId,
            updatedAt: new Date(),
          }))
        );
      }
      await db
        .update(studentLessonLedger)
        .set({ lessonId: newLessonId })
        .where(
          and(
            eq(studentLessonLedger.lessonId, lessonId),
            eq(studentLessonLedger.studentId, link.studentId)
          )
        );
      await db
        .delete(lessonStudents)
        .where(
          and(
            eq(lessonStudents.lessonId, lessonId),
            eq(lessonStudents.studentId, link.studentId)
          )
        );
      createdLessons += 1;
    }
    splitLessons += 1;
  }

  const scheduleGroups = await db
    .select({
      scheduleId: lessonScheduleStudents.scheduleId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(lessonScheduleStudents)
    .groupBy(lessonScheduleStudents.scheduleId)
    .having(sql`count(*) > 1`);

  let splitSchedules = 0;
  let createdSchedules = 0;

  for (const row of scheduleGroups) {
    const scheduleId = row.scheduleId;
    const [sch] = await db
      .select()
      .from(lessonSchedules)
      .where(eq(lessonSchedules.id, scheduleId))
      .limit(1);
    if (!sch) continue;

    const links = await db
      .select()
      .from(lessonScheduleStudents)
      .where(eq(lessonScheduleStudents.scheduleId, scheduleId))
      .orderBy(asc(lessonScheduleStudents.studentId));
    if (links.length <= 1) continue;

    const [, ...rest] = links;
    for (const link of rest) {
      const newScheduleId = newId("sch");
      await db.insert(lessonSchedules).values({
        id: newScheduleId,
        organizationId: sch.organizationId,
        teacherId: sch.teacherId,
        directionId: sch.directionId,
        subject: sch.subject,
        weekdays: sch.weekdays,
        startTime: sch.startTime,
        durationMin: sch.durationMin,
        activeFrom: sch.activeFrom,
        activeUntil: sch.activeUntil,
        status: sch.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(lessonScheduleStudents).values({
        scheduleId: newScheduleId,
        studentId: link.studentId,
      });
      await db
        .delete(lessonScheduleStudents)
        .where(
          and(
            eq(lessonScheduleStudents.scheduleId, scheduleId),
            eq(lessonScheduleStudents.studentId, link.studentId)
          )
        );
      createdSchedules += 1;
    }
    splitSchedules += 1;
  }

  return { splitLessons, createdLessons, splitSchedules, createdSchedules };
}
