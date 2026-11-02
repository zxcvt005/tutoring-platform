import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  addAppMonths,
  parseAppInstant,
  startOfAppMonth,
} from "@/lib/app-time";
import {
  LESSON_RATING_COMMENT_MAX,
  LESSON_RATING_PAGE_SIZE,
  LESSON_RATING_PERIODS,
  parseLessonRatingScore,
  roundLessonRatingAverage,
  studentCanRateLesson,
  type LessonRatingPeriod,
} from "@/lib/lesson-ratings";
import type { AuthContext } from "@/server/authz/context";
import {
  requirePress,
  requireStudentProfile,
} from "@/server/authz/require";
import {
  attendances,
  lessonRatings,
  lessonStudents,
  lessons,
  students,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, forbidden, notFound, validationError } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current && typeof current === "object") {
      const code =
        "code" in current ? String((current as { code?: unknown }).code) : "";
      if (code === "23505") return true;
      const message =
        current instanceof Error ? current.message : String(current);
      if (/unique|duplicate key/i.test(message)) return true;
      current =
        "cause" in current ? (current as { cause: unknown }).cause : undefined;
    } else {
      break;
    }
  }
  return false;
}

function parseComment(value: unknown, required: boolean): string {
  if (value == null) {
    if (required) throw validationError("Напишите, что можно улучшить");
    return "";
  }
  if (typeof value !== "string") {
    throw validationError("Некорректный комментарий");
  }
  const text = value.replace(/\r\n/g, "\n");
  if (text.length > LESSON_RATING_COMMENT_MAX) {
    throw validationError(
      `Слишком длинный комментарий. Максимум ${LESSON_RATING_COMMENT_MAX} символов`
    );
  }
  const trimmed = text.trim();
  if (required && !trimmed) {
    throw validationError("Напишите, что можно улучшить");
  }
  return required ? trimmed : "";
}

function parsePeriodKey(value: unknown): LessonRatingPeriod {
  if (value == null || value === "") return "current_month";
  if (
    typeof value === "string" &&
    (LESSON_RATING_PERIODS as readonly string[]).includes(value)
  ) {
    return value as LessonRatingPeriod;
  }
  throw validationError("Некорректный период");
}

function periodBounds(
  input: {
    period?: unknown;
    from?: unknown;
    to?: unknown;
    now?: Date;
  }
): { period: LessonRatingPeriod; from: Date | null; toExclusive: Date | null } {
  const now = input.now ?? new Date();
  const period = parsePeriodKey(input.period);
  if (period === "all") return { period, from: null, toExclusive: null };
  if (period === "current_month") {
    const from = startOfAppMonth(now);
    return { period, from, toExclusive: addAppMonths(from, 1) };
  }
  if (period === "previous_month") {
    const current = startOfAppMonth(now);
    return {
      period,
      from: addAppMonths(current, -1),
      toExclusive: current,
    };
  }
  const fromRaw = typeof input.from === "string" ? input.from.trim() : "";
  const toRaw = typeof input.to === "string" ? input.to.trim() : "";
  if (!fromRaw || !toRaw) {
    throw validationError("Укажите начало и конец периода");
  }
  const from = parseAppInstant(fromRaw);
  const toExclusive = new Date(parseAppInstant(toRaw, true).getTime() + 60_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
    throw validationError("Некорректный диапазон дат");
  }
  if (from.getTime() > toExclusive.getTime()) {
    throw validationError("Начало периода позже окончания");
  }
  return { period, from, toExclusive };
}

export type StudentLessonRatingDto = {
  id: string;
  lessonId: string;
  score: number;
  comment: string;
  submittedAt: string;
};

export type PressLessonRatingDto = {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  score: number;
  comment: string;
  submittedAt: string;
  lessonStartsAt: string;
};

function toStudentDto(
  row: typeof lessonRatings.$inferSelect
): StudentLessonRatingDto {
  return {
    id: row.id,
    lessonId: row.lessonId,
    score: row.score,
    comment: row.comment,
    submittedAt: row.submittedAt.toISOString(),
  };
}

export async function listMyLessonRatings(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudentProfile(ctx);
  const rows = await db
    .select()
    .from(lessonRatings)
    .where(
      and(
        eq(lessonRatings.organizationId, ctx.organizationId),
        eq(lessonRatings.studentId, studentId)
      )
    );
  return { ratings: rows.map(toStudentDto) };
}

export async function submitLessonRating(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: unknown;
    score: unknown;
    comment?: unknown;
    now?: Date;
  }
) {
  const studentId = await requireStudentProfile(ctx);
  const lessonId = String(input.lessonId ?? "").trim();
  if (!lessonId) throw validationError("Укажите занятие");
  let score: number;
  try {
    score = parseLessonRatingScore(input.score);
  } catch (err) {
    throw validationError(
      err instanceof Error ? err.message : "Некорректная оценка"
    );
  }
  const comment = parseComment(input.comment, false);
  const now = input.now ?? new Date();

  const [lesson] = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.id, lessonId),
        eq(lessons.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!lesson) throw notFound("Занятие не найдено");

  const [enrolled] = await db
    .select({ studentId: lessonStudents.studentId })
    .from(lessonStudents)
    .where(
      and(
        eq(lessonStudents.lessonId, lessonId),
        eq(lessonStudents.studentId, studentId)
      )
    )
    .limit(1);
  if (!enrolled) throw forbidden("Это не ваше занятие");

  const [attendance] = await db
    .select({ status: attendances.status })
    .from(attendances)
    .where(
      and(
        eq(attendances.lessonId, lessonId),
        eq(attendances.studentId, studentId)
      )
    )
    .limit(1);

  if (
    !studentCanRateLesson({
      lessonStatus: lesson.status,
      startsAt: lesson.startsAt,
      attendanceStatus: attendance?.status ?? null,
      now,
    })
  ) {
    throw validationError(
      "Оценить можно только проведённое занятие, на котором вы присутствовали"
    );
  }

  const [existing] = await db
    .select()
    .from(lessonRatings)
    .where(
      and(
        eq(lessonRatings.lessonId, lessonId),
        eq(lessonRatings.studentId, studentId)
      )
    )
    .limit(1);
  if (existing) {
    throw conflict("Занятие уже оценено");
  }

  try {
    const [row] = await db
      .insert(lessonRatings)
      .values({
        id: newId("lrt"),
        organizationId: ctx.organizationId,
        lessonId,
        studentId,
        teacherId: lesson.teacherId,
        score,
        comment,
        submittedAt: now,
      })
      .returning();
    return { rating: toStudentDto(row!) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("Занятие уже оценено");
    }
    throw err;
  }
}

export async function updateLessonRatingComment(
  db: AppDb,
  ctx: AuthContext,
  input: { lessonId: unknown; comment?: unknown }
) {
  const studentId = await requireStudentProfile(ctx);
  const lessonId = String(input.lessonId ?? "").trim();
  if (!lessonId) throw validationError("Укажите занятие");
  const comment = parseComment(input.comment, true);

  const [existing] = await db
    .select()
    .from(lessonRatings)
    .where(
      and(
        eq(lessonRatings.lessonId, lessonId),
        eq(lessonRatings.studentId, studentId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Сначала поставьте оценку");

  const [row] = await db
    .update(lessonRatings)
    .set({ comment, updatedAt: new Date() })
    .where(eq(lessonRatings.id, existing.id))
    .returning();
  return { rating: toStudentDto(row!) };
}

export type PendingLessonRatingDto = {
  lessonId: string;
  startsAt: string;
  endsAt: string;
  subject: string | null;
  teacherId: string;
  teacherName: string;
};

export async function listPendingStudentRatings(
  db: AppDb,
  ctx: AuthContext,
  input: { now?: Date } = {}
) {
  const studentId = await requireStudentProfile(ctx);
  const now = input.now ?? new Date();
  const rows = await db
    .select({
      lessonId: lessons.id,
      status: lessons.status,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      subject: lessons.subject,
      teacherId: lessons.teacherId,
      teacherName: teachers.fullName,
      attendanceStatus: attendances.status,
      ratingId: lessonRatings.id,
    })
    .from(lessonStudents)
    .innerJoin(lessons, eq(lessons.id, lessonStudents.lessonId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(
      attendances,
      and(
        eq(attendances.lessonId, lessons.id),
        eq(attendances.studentId, studentId)
      )
    )
    .leftJoin(
      lessonRatings,
      and(
        eq(lessonRatings.lessonId, lessons.id),
        eq(lessonRatings.studentId, studentId)
      )
    )
    .where(
      and(
        eq(lessonStudents.studentId, studentId),
        eq(lessons.organizationId, ctx.organizationId)
      )
    )
    .orderBy(desc(lessons.startsAt), desc(lessons.id));

  const pending: PendingLessonRatingDto[] = [];
  for (const row of rows) {
    if (row.ratingId) continue;
    if (
      !studentCanRateLesson({
        lessonStatus: row.status,
        startsAt: row.startsAt,
        attendanceStatus: row.attendanceStatus,
        now,
      })
    ) {
      continue;
    }
    pending.push({
      lessonId: row.lessonId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      subject: row.subject,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
    });
  }
  return { lessons: pending };
}

function historyFilters(
  ctx: AuthContext,
  bounds: { from: Date | null; toExclusive: Date | null },
  teacherId?: string,
  minScore?: number,
  maxScore?: number
) {
  const filters = [eq(lessonRatings.organizationId, ctx.organizationId)];
  if (bounds.from) filters.push(gte(lessonRatings.submittedAt, bounds.from));
  if (bounds.toExclusive) {
    filters.push(lt(lessonRatings.submittedAt, bounds.toExclusive));
  }
  if (teacherId) filters.push(eq(lessonRatings.teacherId, teacherId));
  if (minScore != null) filters.push(gte(lessonRatings.score, minScore));
  if (maxScore != null) filters.push(lte(lessonRatings.score, maxScore));
  return filters;
}

export async function listPressLessonRatings(
  db: AppDb,
  ctx: AuthContext,
  input: {
    period?: unknown;
    from?: unknown;
    to?: unknown;
    teacherId?: unknown;
    attentionOnly?: unknown;
    minScore?: unknown;
    maxScore?: unknown;
    offset?: unknown;
    now?: Date;
  } = {}
) {
  requirePress(ctx);
  const bounds = periodBounds(input);
  const teacherId =
    typeof input.teacherId === "string" && input.teacherId.trim()
      ? input.teacherId.trim()
      : "";
  const attentionOnly =
    input.attentionOnly === true ||
    input.attentionOnly === "true" ||
    input.attentionOnly === "1";
  let minScore =
    input.minScore == null || input.minScore === ""
      ? undefined
      : Number(input.minScore);
  let maxScore =
    input.maxScore == null || input.maxScore === ""
      ? undefined
      : Number(input.maxScore);
  if (minScore != null && !Number.isInteger(minScore)) {
    throw validationError("Некорректная минимальная оценка");
  }
  if (maxScore != null && !Number.isInteger(maxScore)) {
    throw validationError("Некорректная максимальная оценка");
  }
  if (attentionOnly) {
    minScore = 1;
    maxScore = 6;
  }
  const offset = Math.max(0, Number(input.offset ?? 0) || 0);

  const filters = historyFilters(
    ctx,
    bounds,
    teacherId || undefined,
    minScore,
    maxScore
  );
  const rows = await db
    .select({
      rating: lessonRatings,
      studentName: students.fullName,
      teacherName: teachers.fullName,
      lessonStartsAt: lessons.startsAt,
    })
    .from(lessonRatings)
    .innerJoin(students, eq(students.id, lessonRatings.studentId))
    .innerJoin(teachers, eq(teachers.id, lessonRatings.teacherId))
    .innerJoin(lessons, eq(lessons.id, lessonRatings.lessonId))
    .where(and(...filters))
    .orderBy(desc(lessonRatings.submittedAt), desc(lessonRatings.id))
    .limit(LESSON_RATING_PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > LESSON_RATING_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, LESSON_RATING_PAGE_SIZE) : rows;
  const ratings: PressLessonRatingDto[] = page.map((r) => ({
    id: r.rating.id,
    lessonId: r.rating.lessonId,
    studentId: r.rating.studentId,
    studentName: r.studentName,
    teacherId: r.rating.teacherId,
    teacherName: r.teacherName,
    score: r.rating.score,
    comment: r.rating.comment,
    submittedAt: r.rating.submittedAt.toISOString(),
    lessonStartsAt: r.lessonStartsAt.toISOString(),
  }));

  const attentionFilters = historyFilters(ctx, bounds, teacherId || undefined, 1, 6);
  const attentionRows = await db
    .select({
      rating: lessonRatings,
      studentName: students.fullName,
      teacherName: teachers.fullName,
      lessonStartsAt: lessons.startsAt,
    })
    .from(lessonRatings)
    .innerJoin(students, eq(students.id, lessonRatings.studentId))
    .innerJoin(teachers, eq(teachers.id, lessonRatings.teacherId))
    .innerJoin(lessons, eq(lessons.id, lessonRatings.lessonId))
    .where(and(...attentionFilters))
    .orderBy(asc(lessonRatings.score), desc(lessonRatings.submittedAt))
    .limit(30);

  const attention: PressLessonRatingDto[] = attentionRows.map((r) => ({
    id: r.rating.id,
    lessonId: r.rating.lessonId,
    studentId: r.rating.studentId,
    studentName: r.studentName,
    teacherId: r.rating.teacherId,
    teacherName: r.teacherName,
    score: r.rating.score,
    comment: r.rating.comment,
    submittedAt: r.rating.submittedAt.toISOString(),
    lessonStartsAt: r.lessonStartsAt.toISOString(),
  }));

  const teacherRows = await db
    .select({
      id: teachers.id,
      fullName: teachers.fullName,
    })
    .from(teachers)
    .where(eq(teachers.organizationId, ctx.organizationId))
    .orderBy(teachers.fullName);

  const avgFilters = historyFilters(ctx, bounds);
  const avgRows = await db
    .select({
      teacherId: lessonRatings.teacherId,
      sum: sql<number>`sum(${lessonRatings.score})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lessonRatings)
    .where(and(...avgFilters))
    .groupBy(lessonRatings.teacherId);
  const avgByTeacher = new Map(
    avgRows.map((r) => [
      r.teacherId,
      {
        average: roundLessonRatingAverage(Number(r.sum), Number(r.count)),
        count: Number(r.count),
      },
    ])
  );

  const averages = teacherRows.map((teacher) => {
    const stats = avgByTeacher.get(teacher.id);
    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      average: stats?.average ?? null,
      count: stats?.count ?? 0,
    };
  });

  return {
    period: bounds.period,
    from: bounds.from?.toISOString() ?? null,
    toExclusive: bounds.toExclusive?.toISOString() ?? null,
    ratings,
    attention,
    averages,
    teachers: teacherRows,
    hasMore,
    offset,
  };
}
