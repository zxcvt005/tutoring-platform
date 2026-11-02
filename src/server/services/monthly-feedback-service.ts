import { and, desc, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { buildFeedbackPrompt } from "@/lib/feedback-prompt";
import {
  assertFeedbackPeriod,
  countAvailableFeedbackMetrics,
  feedbackMetricsSummary,
  FEEDBACK_PRESS_STATUSES,
  formatFeedbackPeriod,
  parseFeedbackPeriod,
  teacherFillStatus,
  type FeedbackFillStatus,
  type FeedbackPressStatus,
  type MonthlyFeedbackMetrics,
} from "@/lib/monthly-feedback";
import type { AuthContext } from "@/server/authz/context";
import {
  assertTeacherOwnsStudent,
  requirePress,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  monthlyFeedbackReports,
  students,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, notFound, validationError } from "@/server/errors";
import {
  computeStudentMonthlyMetrics,
  computeStudentsMonthlyMetrics,
} from "@/server/services/monthly-feedback-metrics";

const COMMENT_MAX = 8000;
const PARENT_TEXT_MAX = 16000;

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

function parseComment(value: unknown, label = "комментарий"): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw validationError(`Некорректный ${label}`);
  }
  const text = value.replace(/\r\n/g, "\n");
  if (text.length > COMMENT_MAX) {
    throw validationError(
      `Слишком длинный ${label}. Максимум ${COMMENT_MAX} символов`
    );
  }
  return text;
}

function parseParentText(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw validationError("Некорректный текст для родителя");
  }
  const text = value.replace(/\r\n/g, "\n");
  if (text.length > PARENT_TEXT_MAX) {
    throw validationError(
      `Слишком длинный текст. Максимум ${PARENT_TEXT_MAX} символов`
    );
  }
  return text;
}

function periodFrom(input: {
  year?: unknown;
  month?: unknown;
  period?: unknown;
  now?: Date;
}) {
  try {
    const period = parseFeedbackPeriod(input);
    assertFeedbackPeriod(period.year, period.month);
    return period;
  } catch (err) {
    throw validationError(
      err instanceof Error ? err.message : "Некорректный отчётный месяц"
    );
  }
}

function parsePressStatusFilter(value: unknown): FeedbackPressStatus | "all" {
  if (value == null || value === "" || value === "all") return "all";
  if (
    typeof value === "string" &&
    (FEEDBACK_PRESS_STATUSES as readonly string[]).includes(value)
  ) {
    return value as FeedbackPressStatus;
  }
  throw validationError("Некорректный статус обработки");
}

function asMetrics(
  value: unknown
): MonthlyFeedbackMetrics | null {
  if (!value || typeof value !== "object") return null;
  const metrics = value as MonthlyFeedbackMetrics;
  if (!metrics.period || !metrics.lessons || !metrics.homework) return null;
  return metrics;
}

export type FeedbackReportDto = {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  teacherComment: string;
  metrics: MonthlyFeedbackMetrics | null;
  metricsLive: boolean;
  fillStatus: FeedbackFillStatus;
  submittedAt: string | null;
  pressStatus: FeedbackPressStatus | null;
  pressStartedAt: string | null;
  processedAt: string | null;
  parentMessageText: string;
  parentSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  prompt: string;
};

function toDto(input: {
  row: typeof monthlyFeedbackReports.$inferSelect;
  studentName: string;
  teacherName: string;
  metrics: MonthlyFeedbackMetrics | null;
  metricsLive: boolean;
}): FeedbackReportDto {
  const { row, studentName, teacherName, metrics, metricsLive } = input;
  const teacherComment = row.teacherComment ?? "";
  return {
    id: row.id,
    studentId: row.studentId,
    studentName,
    teacherId: row.teacherId,
    teacherName,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    periodLabel: formatFeedbackPeriod(row.periodYear, row.periodMonth),
    teacherComment,
    metrics,
    metricsLive,
    fillStatus: teacherFillStatus({
      submittedAt: row.submittedAt,
      teacherComment,
    }),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    pressStatus: (row.pressStatus as FeedbackPressStatus | null) ?? null,
    pressStartedAt: row.pressStartedAt?.toISOString() ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    parentMessageText: row.parentMessageText ?? "",
    parentSentAt: row.parentSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    prompt: buildFeedbackPrompt({
      studentName,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      teacherComment,
      metrics,
    }),
  };
}

export type TeacherFeedbackListItem = {
  studentId: string;
  studentName: string;
  studentStatus: string;
  fillStatus: FeedbackFillStatus;
  reportId: string | null;
  metricsSummary: string;
  availableMetrics: number;
  submittedAt: string | null;
};

async function loadTeacherStudents(db: AppDb, ctx: AuthContext, teacherId: string) {
  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
    })
    .from(students)
    .where(
      and(
        eq(students.organizationId, ctx.organizationId),
        eq(students.primaryTeacherId, teacherId)
      )
    );
}

async function loadReportRow(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const [row] = await db
    .select()
    .from(monthlyFeedbackReports)
    .where(
      and(
        eq(monthlyFeedbackReports.id, id),
        eq(monthlyFeedbackReports.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Отчёт не найден");
  return row;
}

async function namesFor(
  db: AppDb,
  studentId: string,
  teacherId: string
) {
  const [[student], [teacher]] = await Promise.all([
    db
      .select({ fullName: students.fullName })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1),
    db
      .select({ fullName: teachers.fullName })
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1),
  ]);
  return {
    studentName: student?.fullName ?? "Ученик",
    teacherName: teacher?.fullName ?? "Преподаватель",
  };
}

export async function listTeacherFeedback(
  db: AppDb,
  ctx: AuthContext,
  input: { year?: unknown; month?: unknown; period?: unknown; now?: Date }
) {
  const teacherId = await requireTeacherProfile(ctx);
  const { year, month } = periodFrom(input);
  const studentRows = await loadTeacherStudents(db, ctx, teacherId);
  const reports = studentRows.length
    ? await db
        .select()
        .from(monthlyFeedbackReports)
        .where(
          and(
            eq(monthlyFeedbackReports.organizationId, ctx.organizationId),
            eq(monthlyFeedbackReports.teacherId, teacherId),
            eq(monthlyFeedbackReports.periodYear, year),
            eq(monthlyFeedbackReports.periodMonth, month)
          )
        )
    : [];
  const reportByStudent = new Map(reports.map((r) => [r.studentId, r]));
  const metricsMap = await computeStudentsMonthlyMetrics(db, {
    organizationId: ctx.organizationId,
    teacherId,
    studentIds: studentRows.map((s) => s.id),
    year,
    month,
    now: input.now,
  });

  const items: TeacherFeedbackListItem[] = studentRows
    .map((student) => {
      const report = reportByStudent.get(student.id);
      const metrics = metricsMap.get(student.id)!;
      const fillStatus = teacherFillStatus({
        submittedAt: report?.submittedAt ?? null,
        teacherComment: report?.teacherComment ?? "",
      });
      return {
        studentId: student.id,
        studentName: student.fullName,
        studentStatus: student.status,
        fillStatus,
        reportId: report?.id ?? null,
        metricsSummary: feedbackMetricsSummary(metrics),
        availableMetrics: countAvailableFeedbackMetrics(metrics),
        submittedAt: report?.submittedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "ru"));

  const submitted = items.filter((i) => i.fillStatus === "submitted").length;
  const drafts = items.filter((i) => i.fillStatus === "draft").length;
  return {
    year,
    month,
    periodLabel: formatFeedbackPeriod(year, month),
    progress: {
      submitted,
      drafts,
      empty: items.length - submitted - drafts,
      total: items.length,
    },
    students: items,
  };
}

export async function getTeacherFeedback(
  db: AppDb,
  ctx: AuthContext,
  input: {
    studentId: string;
    year?: unknown;
    month?: unknown;
    period?: unknown;
    now?: Date;
  }
) {
  const teacherId = await requireTeacherProfile(ctx);
  const student = await assertTeacherOwnsStudent(db, ctx, input.studentId);
  const { year, month } = periodFrom(input);
  const [report] = await db
    .select()
    .from(monthlyFeedbackReports)
    .where(
      and(
        eq(monthlyFeedbackReports.organizationId, ctx.organizationId),
        eq(monthlyFeedbackReports.studentId, student.id),
        eq(monthlyFeedbackReports.teacherId, teacherId),
        eq(monthlyFeedbackReports.periodYear, year),
        eq(monthlyFeedbackReports.periodMonth, month)
      )
    )
    .limit(1);
  const [teacher] = await db
    .select({ fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.id, teacherId))
    .limit(1);

  const liveMetrics = report?.submittedAt
    ? null
    : await computeStudentMonthlyMetrics(db, {
        organizationId: ctx.organizationId,
        teacherId,
        studentId: student.id,
        year,
        month,
        now: input.now,
      });
  const snapshot = report?.submittedAt ? asMetrics(report.metricsSnapshot) : null;
  const metrics = snapshot ?? liveMetrics;
  const row =
    report ??
    ({
      id: "",
      organizationId: ctx.organizationId,
      studentId: student.id,
      teacherId,
      periodYear: year,
      periodMonth: month,
      teacherComment: "",
      metricsSnapshot: null,
      submittedAt: null,
      submittedByUserId: null,
      pressStatus: null,
      pressStartedAt: null,
      processedAt: null,
      processedByUserId: null,
      parentMessageText: "",
      parentSentAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } satisfies typeof monthlyFeedbackReports.$inferSelect);

  return {
    report: toDto({
      row,
      studentName: student.fullName,
      teacherName: teacher?.fullName ?? "Преподаватель",
      metrics,
      metricsLive: !report?.submittedAt,
    }),
  };
}

async function upsertDraftRow(
  db: AppDb,
  ctx: AuthContext,
  input: {
    studentId: string;
    year: number;
    month: number;
    teacherComment: string;
  }
) {
  const teacherId = await requireTeacherProfile(ctx);
  const student = await assertTeacherOwnsStudent(db, ctx, input.studentId);
  const [existing] = await db
    .select()
    .from(monthlyFeedbackReports)
    .where(
      and(
        eq(monthlyFeedbackReports.organizationId, ctx.organizationId),
        eq(monthlyFeedbackReports.studentId, student.id),
        eq(monthlyFeedbackReports.teacherId, teacherId),
        eq(monthlyFeedbackReports.periodYear, input.year),
        eq(monthlyFeedbackReports.periodMonth, input.month)
      )
    )
    .limit(1);
  if (existing?.submittedAt) {
    throw conflict("Обратная связь за этот месяц уже отправлена");
  }
  const now = new Date();
  if (existing) {
    const [row] = await db
      .update(monthlyFeedbackReports)
      .set({
        teacherComment: input.teacherComment,
        updatedAt: now,
      })
      .where(eq(monthlyFeedbackReports.id, existing.id))
      .returning();
    return row!;
  }
  const id = newId("mfr");
  try {
    const [row] = await db
      .insert(monthlyFeedbackReports)
      .values({
        id,
        organizationId: ctx.organizationId,
        studentId: student.id,
        teacherId,
        periodYear: input.year,
        periodMonth: input.month,
        teacherComment: input.teacherComment,
      })
      .returning();
    return row!;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [race] = await db
      .select()
      .from(monthlyFeedbackReports)
      .where(
        and(
          eq(monthlyFeedbackReports.studentId, student.id),
          eq(monthlyFeedbackReports.teacherId, teacherId),
          eq(monthlyFeedbackReports.periodYear, input.year),
          eq(monthlyFeedbackReports.periodMonth, input.month)
        )
      )
      .limit(1);
    if (!race) throw err;
    if (race.submittedAt) {
      throw conflict("Обратная связь за этот месяц уже отправлена");
    }
    const [row] = await db
      .update(monthlyFeedbackReports)
      .set({
        teacherComment: input.teacherComment,
        updatedAt: now,
      })
      .where(eq(monthlyFeedbackReports.id, race.id))
      .returning();
    return row!;
  }
}

export async function saveTeacherFeedbackDraft(
  db: AppDb,
  ctx: AuthContext,
  input: {
    studentId: unknown;
    year?: unknown;
    month?: unknown;
    period?: unknown;
    teacherComment: unknown;
  }
) {
  const studentId = String(input.studentId ?? "").trim();
  if (!studentId) throw validationError("Укажите ученика");
  const { year, month } = periodFrom(input);
  const teacherComment = parseComment(input.teacherComment);
  const row = await upsertDraftRow(db, ctx, {
    studentId,
    year,
    month,
    teacherComment,
  });
  const { report } = await getTeacherFeedback(db, ctx, {
    studentId,
    year,
    month,
  });
  return { report: { ...report, id: row.id } };
}

export async function submitTeacherFeedback(
  db: AppDb,
  ctx: AuthContext,
  input: {
    studentId: unknown;
    year?: unknown;
    month?: unknown;
    period?: unknown;
    teacherComment: unknown;
    now?: Date;
  }
) {
  const teacherId = await requireTeacherProfile(ctx);
  const studentId = String(input.studentId ?? "").trim();
  if (!studentId) throw validationError("Укажите ученика");
  const student = await assertTeacherOwnsStudent(db, ctx, studentId);
  const { year, month } = periodFrom(input);
  const teacherComment = parseComment(input.teacherComment).trim();
  if (!teacherComment) {
    throw validationError(
      "Напишите комментарий, прежде чем отправить обратную связь в Прессу"
    );
  }
  const now = input.now ?? new Date();
  const metrics = await computeStudentMonthlyMetrics(db, {
    organizationId: ctx.organizationId,
    teacherId,
    studentId: student.id,
    year,
    month,
    now,
  });

  const [existing] = await db
    .select()
    .from(monthlyFeedbackReports)
    .where(
      and(
        eq(monthlyFeedbackReports.organizationId, ctx.organizationId),
        eq(monthlyFeedbackReports.studentId, student.id),
        eq(monthlyFeedbackReports.teacherId, teacherId),
        eq(monthlyFeedbackReports.periodYear, year),
        eq(monthlyFeedbackReports.periodMonth, month)
      )
    )
    .limit(1);
  if (existing?.submittedAt) {
    throw conflict("Обратная связь за этот месяц уже отправлена");
  }

  const snapshot = metrics as unknown as Record<string, unknown>;
  let row: typeof monthlyFeedbackReports.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(monthlyFeedbackReports)
      .set({
        teacherComment,
        metricsSnapshot: snapshot,
        submittedAt: now,
        submittedByUserId: ctx.userId,
        pressStatus: "pending",
        updatedAt: now,
      })
      .where(
        and(
          eq(monthlyFeedbackReports.id, existing.id),
          existing.submittedAt
            ? eq(monthlyFeedbackReports.submittedAt, existing.submittedAt)
            : isNull(monthlyFeedbackReports.submittedAt)
        )
      )
      .returning();
    if (!updated) {
      throw conflict("Обратная связь за этот месяц уже отправлена");
    }
    row = updated;
  } else {
    try {
      const [inserted] = await db
        .insert(monthlyFeedbackReports)
        .values({
          id: newId("mfr"),
          organizationId: ctx.organizationId,
          studentId: student.id,
          teacherId,
          periodYear: year,
          periodMonth: month,
          teacherComment,
          metricsSnapshot: snapshot,
          submittedAt: now,
          submittedByUserId: ctx.userId,
          pressStatus: "pending",
        })
        .returning();
      row = inserted!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw conflict("Обратная связь за этот месяц уже отправлена");
    }
  }

  const names = await namesFor(db, student.id, teacherId);
  return {
    report: toDto({
      row,
      studentName: names.studentName,
      teacherName: names.teacherName,
      metrics,
      metricsLive: false,
    }),
  };
}

export async function listPressFeedback(
  db: AppDb,
  ctx: AuthContext,
  input: {
    year?: unknown;
    month?: unknown;
    period?: unknown;
    status?: unknown;
  }
) {
  requirePress(ctx);
  const { year, month } = periodFrom(input);
  const status = parsePressStatusFilter(input.status);
  const whereAll = and(
    eq(monthlyFeedbackReports.organizationId, ctx.organizationId),
    eq(monthlyFeedbackReports.periodYear, year),
    eq(monthlyFeedbackReports.periodMonth, month)
  );
  const where =
    status === "all"
      ? whereAll
      : and(whereAll, eq(monthlyFeedbackReports.pressStatus, status));

  const rows = await db
    .select({
      report: monthlyFeedbackReports,
      studentName: students.fullName,
      teacherName: teachers.fullName,
    })
    .from(monthlyFeedbackReports)
    .innerJoin(students, eq(students.id, monthlyFeedbackReports.studentId))
    .innerJoin(teachers, eq(teachers.id, monthlyFeedbackReports.teacherId))
    .where(where)
    .orderBy(desc(monthlyFeedbackReports.submittedAt));

  const items = rows
    .filter((r) => r.report.submittedAt)
    .map((r) => ({
      id: r.report.id,
      studentId: r.report.studentId,
      studentName: r.studentName,
      teacherId: r.report.teacherId,
      teacherName: r.teacherName,
      periodYear: r.report.periodYear,
      periodMonth: r.report.periodMonth,
      periodLabel: formatFeedbackPeriod(r.report.periodYear, r.report.periodMonth),
      submittedAt: r.report.submittedAt!.toISOString(),
      pressStatus: r.report.pressStatus as FeedbackPressStatus,
      processedAt: r.report.processedAt?.toISOString() ?? null,
      parentSentAt: r.report.parentSentAt?.toISOString() ?? null,
    }));

  return {
    year,
    month,
    periodLabel: formatFeedbackPeriod(year, month),
    reports: items,
  };
}

export async function getPressFeedback(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const row = await loadReportRow(db, ctx, id);
  if (!row.submittedAt) throw notFound("Отчёт ещё не отправлен");
  const names = await namesFor(db, row.studentId, row.teacherId);
  return {
    report: toDto({
      row,
      studentName: names.studentName,
      teacherName: names.teacherName,
      metrics: asMetrics(row.metricsSnapshot),
      metricsLive: false,
    }),
  };
}

export async function startPressFeedback(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const row = await loadReportRow(db, ctx, id);
  if (!row.submittedAt) throw notFound("Отчёт ещё не отправлен");
  if (row.pressStatus === "processed") {
    throw validationError("Отчёт уже обработан");
  }
  if (row.pressStatus === "in_progress") {
    return getPressFeedback(db, ctx, id);
  }
  await db
    .update(monthlyFeedbackReports)
    .set({
      pressStatus: "in_progress",
      pressStartedAt: row.pressStartedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monthlyFeedbackReports.id, id));
  return getPressFeedback(db, ctx, id);
}

export async function savePressParentText(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  parentMessageText: unknown
) {
  requirePress(ctx);
  const row = await loadReportRow(db, ctx, id);
  if (!row.submittedAt) throw notFound("Отчёт ещё не отправлен");
  const text = parseParentText(parentMessageText);
  await db
    .update(monthlyFeedbackReports)
    .set({
      parentMessageText: text,
      updatedAt: new Date(),
    })
    .where(eq(monthlyFeedbackReports.id, id));
  return getPressFeedback(db, ctx, id);
}

export async function markPressFeedbackProcessed(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const row = await loadReportRow(db, ctx, id);
  if (!row.submittedAt) throw notFound("Отчёт ещё не отправлен");
  const now = new Date();
  await db
    .update(monthlyFeedbackReports)
    .set({
      pressStatus: "processed",
      processedAt: row.processedAt ?? now,
      processedByUserId: row.processedByUserId ?? ctx.userId,
      pressStartedAt: row.pressStartedAt ?? now,
      updatedAt: now,
    })
    .where(eq(monthlyFeedbackReports.id, id));
  return getPressFeedback(db, ctx, id);
}

export async function markPressFeedbackParentSent(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  sent: boolean
) {
  requirePress(ctx);
  const row = await loadReportRow(db, ctx, id);
  if (!row.submittedAt) throw notFound("Отчёт ещё не отправлен");
  const now = new Date();
  await db
    .update(monthlyFeedbackReports)
    .set({
      parentSentAt: sent ? row.parentSentAt ?? now : null,
      updatedAt: now,
    })
    .where(eq(monthlyFeedbackReports.id, id));
  return getPressFeedback(db, ctx, id);
}

