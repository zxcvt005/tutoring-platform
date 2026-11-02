import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

import {
  computeMonthlyFeedbackMetrics,
  feedbackMonthRange,
  shiftFeedbackPeriod,
  type MonthlyFeedbackMetrics,
} from "@/lib/monthly-feedback";
import {
  assignmentSnapshots,
  attendances,
  lessonStudents,
  lessonTopics,
  lessons,
  testAssignments,
  tests,
  theoryAssignments,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

async function loadHomeworkForPeriod(
  db: AppDb,
  input: {
    organizationId: string;
    teacherId: string;
    studentIds: string[];
    from: Date;
    toExclusive: Date;
    lessonIdsInPeriod: string[];
  }
) {
  if (input.studentIds.length === 0) return [];
  const periodClause =
    input.lessonIdsInPeriod.length > 0
      ? or(
          and(
            gte(testAssignments.createdAt, input.from),
            lt(testAssignments.createdAt, input.toExclusive)
          ),
          inArray(testAssignments.lessonId, input.lessonIdsInPeriod)
        )
      : and(
          gte(testAssignments.createdAt, input.from),
          lt(testAssignments.createdAt, input.toExclusive)
        );

  const rows = await db
    .select({
      id: testAssignments.id,
      studentId: testAssignments.studentId,
      lessonId: testAssignments.lessonId,
      createdAt: testAssignments.createdAt,
      status: testAssignments.status,
      attempt1Percent: testAssignments.attempt1Percent,
      attempt2Percent: testAssignments.attempt2Percent,
      snapshotTitle: assignmentSnapshots.title,
      testTitle: tests.title,
    })
    .from(testAssignments)
    .leftJoin(
      assignmentSnapshots,
      eq(assignmentSnapshots.assignmentId, testAssignments.id)
    )
    .leftJoin(tests, eq(tests.id, testAssignments.testId))
    .where(
      and(
        eq(testAssignments.organizationId, input.organizationId),
        eq(testAssignments.teacherId, input.teacherId),
        eq(testAssignments.sourceKind, "homework"),
        inArray(testAssignments.studentId, input.studentIds),
        periodClause
      )
    );

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    lessonId: row.lessonId,
    createdAt: row.createdAt,
    status: row.status,
    attempt1Percent: row.attempt1Percent,
    attempt2Percent: row.attempt2Percent,
    title: row.snapshotTitle || row.testTitle || "Домашнее задание",
  }));
}

export async function computeStudentMonthlyMetrics(
  db: AppDb,
  input: {
    organizationId: string;
    teacherId: string;
    studentId: string;
    year: number;
    month: number;
    now?: Date;
  }
): Promise<MonthlyFeedbackMetrics> {
  const map = await computeStudentsMonthlyMetrics(db, {
    ...input,
    studentIds: [input.studentId],
  });
  return map.get(input.studentId)!;
}

export async function computeStudentsMonthlyMetrics(
  db: AppDb,
  input: {
    organizationId: string;
    teacherId: string;
    studentIds: string[];
    year: number;
    month: number;
    now?: Date;
  }
): Promise<Map<string, MonthlyFeedbackMetrics>> {
  const now = input.now ?? new Date();
  const { from, toExclusive } = feedbackMonthRange(input.year, input.month);
  const previous = shiftFeedbackPeriod(input.year, input.month, -1);
  const previousRange = feedbackMonthRange(previous.year, previous.month);
  const result = new Map<string, MonthlyFeedbackMetrics>();
  if (input.studentIds.length === 0) return result;

  const lessonRows = await db
    .select({
      id: lessons.id,
      startsAt: lessons.startsAt,
      status: lessons.status,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.organizationId, input.organizationId),
        eq(lessons.teacherId, input.teacherId),
        gte(lessons.startsAt, from),
        lt(lessons.startsAt, toExclusive)
      )
    );

  const lessonIds = lessonRows.map((l) => l.id);
  const enrollment =
    lessonIds.length === 0
      ? []
      : await db
          .select({
            lessonId: lessonStudents.lessonId,
            studentId: lessonStudents.studentId,
          })
          .from(lessonStudents)
          .where(
            and(
              inArray(lessonStudents.lessonId, lessonIds),
              inArray(lessonStudents.studentId, input.studentIds)
            )
          );

  const enrolledLessonIds = [...new Set(enrollment.map((e) => e.lessonId))];
  const attendanceRows =
    enrolledLessonIds.length === 0
      ? []
      : await db
          .select({
            lessonId: attendances.lessonId,
            studentId: attendances.studentId,
            status: attendances.status,
          })
          .from(attendances)
          .where(
            and(
              inArray(attendances.lessonId, enrolledLessonIds),
              inArray(attendances.studentId, input.studentIds)
            )
          );

  const topicRows =
    enrolledLessonIds.length === 0
      ? []
      : await db
          .select({
            lessonId: lessonTopics.lessonId,
            title: lessonTopics.title,
          })
          .from(lessonTopics)
          .where(inArray(lessonTopics.lessonId, enrolledLessonIds));

  const previousLessonRows = await db
    .select({ id: lessons.id, startsAt: lessons.startsAt })
    .from(lessons)
    .where(
      and(
        eq(lessons.organizationId, input.organizationId),
        eq(lessons.teacherId, input.teacherId),
        gte(lessons.startsAt, previousRange.from),
        lt(lessons.startsAt, previousRange.toExclusive)
      )
    );
  const previousLessonIds = previousLessonRows.map((l) => l.id);

  const homeworkRows = await loadHomeworkForPeriod(db, {
    organizationId: input.organizationId,
    teacherId: input.teacherId,
    studentIds: input.studentIds,
    from,
    toExclusive,
    lessonIdsInPeriod: lessonIds,
  });
  const previousHomeworkRows = await loadHomeworkForPeriod(db, {
    organizationId: input.organizationId,
    teacherId: input.teacherId,
    studentIds: input.studentIds,
    from: previousRange.from,
    toExclusive: previousRange.toExclusive,
    lessonIdsInPeriod: previousLessonIds,
  });

  const theoryRows = await db
    .select({
      studentId: theoryAssignments.studentId,
      createdAt: theoryAssignments.createdAt,
      status: theoryAssignments.status,
    })
    .from(theoryAssignments)
    .where(
      and(
        eq(theoryAssignments.organizationId, input.organizationId),
        eq(theoryAssignments.teacherId, input.teacherId),
        inArray(theoryAssignments.studentId, input.studentIds),
        gte(theoryAssignments.createdAt, from),
        lt(theoryAssignments.createdAt, toExclusive)
      )
    );

  const lessonsByStudent = new Map<string, typeof lessonRows>();
  for (const row of enrollment) {
    const lesson = lessonRows.find((l) => l.id === row.lessonId);
    if (!lesson) continue;
    const list = lessonsByStudent.get(row.studentId) ?? [];
    list.push(lesson);
    lessonsByStudent.set(row.studentId, list);
  }

  for (const studentId of input.studentIds) {
    const studentLessons = lessonsByStudent.get(studentId) ?? [];
    const studentLessonIds = new Set(studentLessons.map((l) => l.id));
    result.set(
      studentId,
      computeMonthlyFeedbackMetrics({
        now,
        year: input.year,
        month: input.month,
        from,
        toExclusive,
        lessons: studentLessons,
        attendances: attendanceRows.filter((a) => a.studentId === studentId),
        topics: topicRows.filter((t) => studentLessonIds.has(t.lessonId)),
        homework: homeworkRows.filter((h) => h.studentId === studentId),
        previousHomework: previousHomeworkRows.filter(
          (h) => h.studentId === studentId
        ),
        theory: theoryRows.filter((t) => t.studentId === studentId),
      })
    );
  }
  return result;
}
