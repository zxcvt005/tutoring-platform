import { and, eq, ne } from "drizzle-orm";

import type { AttendanceStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  lessonStudents,
  lessons,
  testAssignments,
  tests,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound } from "@/server/errors";
import {
  assignHomework,
  deleteHomeworkAssignment,
  setAttendance,
  setLessonTopics,
} from "@/server/services/platform-mutations";

export type LessonContentTopicInput = {
  topicId?: string | null;
  title?: string | null;
};

/**
 * Единая точка сохранения тем и ДЗ занятия (и опционально посещаемости).
 * Используется и при отметке, и в истории отметок — без параллельных механизмов.
 */
export async function saveLessonContent(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    studentId: string;
    topics: LessonContentTopicInput[];
    /** Желаемый итоговый список тестов ДЗ для пары занятие+ученик. */
    homeworkIds: string[];
    attendanceStatus?: AttendanceStatus | null;
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  if (ctx.role === "teacher") {
    await requireTeacherProfile(ctx);
  }

  const lessonId = input.lessonId.trim();
  const studentId = input.studentId.trim();
  if (!lessonId || !studentId) {
    throw badRequest("Укажите занятие и ученика");
  }

  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) {
    throw notFound("Занятие не найдено");
  }
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) {
    throw forbidden();
  }
  if (lesson.status === "cancelled") {
    throw badRequest("Нельзя редактировать отменённое занятие");
  }

  const [participant] = await db
    .select()
    .from(lessonStudents)
    .where(
      and(
        eq(lessonStudents.lessonId, lessonId),
        eq(lessonStudents.studentId, studentId)
      )
    )
    .limit(1);
  if (!participant) {
    throw badRequest("Ученик не участвует в занятии");
  }

  const homeworkIds = [
    ...new Set(input.homeworkIds.map((id) => id.trim()).filter(Boolean)),
  ];

  const topicsResult = await setLessonTopics(db, ctx, {
    lessonId,
    topics: input.topics,
  });

  const firstTopicId =
    topicsResult.topics.find((t) => t.topicId)?.topicId ?? null;

  const sync = await syncLessonHomework(db, ctx, {
    lessonId,
    studentId,
    teacherId: lesson.teacherId,
    topicId: firstTopicId,
    homeworkIds,
  });

  let attendance: Awaited<ReturnType<typeof setAttendance>> | null = null;
  if (input.attendanceStatus) {
    attendance = await setAttendance(
      db,
      ctx,
      lessonId,
      studentId,
      input.attendanceStatus
    );
  }

  return {
    ok: true as const,
    topics: topicsResult.topics,
    homework: sync,
    attendance,
  };
}

/**
 * Синхронизирует ДЗ занятия с желаемым списком testId.
 * Создаёт недостающие назначения и снимает лишние (только status=assigned).
 * Ошибка назначения никогда не маскируется под успех.
 */
export async function syncLessonHomework(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    studentId: string;
    teacherId: string;
    topicId?: string | null;
    homeworkIds: string[];
  }
) {
  const desired = [...new Set(input.homeworkIds.filter(Boolean))];
  const existing = await db
    .select()
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.lessonId, input.lessonId),
        eq(testAssignments.studentId, input.studentId),
        eq(testAssignments.sourceKind, "homework"),
        ne(testAssignments.status, "withdrawn")
      )
    );

  const byTestId = new Map(existing.map((row) => [row.testId, row]));
  let created = 0;
  let removed = 0;
  const assignmentIds: string[] = [];

  for (const testId of desired) {
    const row = byTestId.get(testId);
    if (row) {
      assignmentIds.push(row.id);
      continue;
    }

    const [hw] = await db
      .select({ id: tests.id, title: tests.title })
      .from(tests)
      .where(eq(tests.id, testId))
      .limit(1);
    if (!hw) {
      throw notFound(`Тест для домашнего задания не найден (${testId})`);
    }

    const result = await assignHomework(db, ctx, {
      homeworkId: testId,
      teacherId: input.teacherId,
      studentIds: [input.studentId],
      lessonId: input.lessonId,
      topicId: input.topicId ?? null,
      requireCreated: true,
    });

    if ((result.created ?? 0) < 1 && (result.ensured ?? 0) < 1) {
      throw badRequest(
        `Не удалось назначить тест «${hw.title}»: назначение не создано`
      );
    }

    created += result.created ?? 0;
    if (result.assignmentIds?.length) {
      assignmentIds.push(...result.assignmentIds);
    } else {
      // Назначение могло появиться через dup-ensure — перечитаем.
      const [ensured] = await db
        .select({ id: testAssignments.id })
        .from(testAssignments)
        .where(
          and(
            eq(testAssignments.lessonId, input.lessonId),
            eq(testAssignments.studentId, input.studentId),
            eq(testAssignments.testId, testId),
            ne(testAssignments.status, "withdrawn")
          )
        )
        .limit(1);
      if (!ensured) {
        throw badRequest(
          `Не удалось назначить тест «${hw.title}»: запись в базе отсутствует`
        );
      }
      assignmentIds.push(ensured.id);
    }
  }

  for (const row of existing) {
    if (desired.includes(row.testId)) continue;
    if (row.status !== "assigned") {
      throw badRequest(
        "Нельзя снять домашнее задание после начала выполнения — история назначения сохраняется"
      );
    }
    await deleteHomeworkAssignment(db, ctx, row.id);
    removed += 1;
  }

  return {
    created,
    removed,
    assignmentIds,
    homeworkIds: desired,
  };
}
