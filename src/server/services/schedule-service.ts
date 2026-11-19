import { and, eq, gte, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  addAppDateKey,
  fromAppDateOnly,
  parseAppInstant,
} from "@/lib/app-time";
import {
  listUpcomingOccurrences,
  SCHEDULE_HORIZON_WEEKS,
  type RecurringScheduleSpec,
} from "@/lib/recurring-schedule";
import {
  findStudentScheduleConflict,
  uniqueStudentIds,
} from "@/lib/schedule";
import {
  SLOT_STUDENT_LIMIT_ERROR,
  wouldExceedSlotStudentLimit,
} from "@/lib/teacher-slot";
import type { AuthContext } from "@/server/authz/context";
import {
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
  lessonScheduleExceptions,
  lessonScheduleStudents,
  lessonSchedules,
  lessonStudents,
  lessons,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, conflict, forbidden, notFound, validationError } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

async function loadOrgLessonsDomain(db: AppDb, organizationId: string) {
  const rows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.organizationId, organizationId));
  const ids = rows.map((r) => r.id);
  const ls =
    ids.length > 0
      ? await db
          .select()
          .from(lessonStudents)
          .where(inArray(lessonStudents.lessonId, ids))
      : [];
  const map = new Map<string, string[]>();
  for (const x of ls) {
    const arr = map.get(x.lessonId) ?? [];
    arr.push(x.studentId);
    map.set(x.lessonId, arr);
  }
  return rows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentIds: map.get(l.id) ?? [],
    subject: l.subject ?? undefined,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    status: l.status as "planned" | "done" | "cancelled",
    topicId: l.topicId ?? undefined,
  }));
}

export type CreateScheduleInput = {
  teacherId: string;
  studentIds: string[];
  weekdays: number[];
  startTime: string;
  durationMin: number;
  subject?: string;
  directionId?: string;
  /** ISO; если не задано — сейчас */
  activeFrom?: string;
  activeUntil?: string;
};

/**
 * Создаёт шаблон и сразу материализует будущие занятия (без прошлого).
 */
export async function createLessonSchedule(
  db: AppDb,
  ctx: AuthContext,
  input: CreateScheduleInput,
  now: Date = new Date()
) {
  requireRoles(ctx, ["director", "teacher"]);
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (input.teacherId !== tid) throw forbidden();
  }

  const studentIds = uniqueStudentIds(input.studentIds);
  if (studentIds.length === 0) throw badRequest("Выберите ученика");
  // Сохраняем текущее ограничение: одно занятие — один ученик.
  // Параллельные одноместные уроки того же преподавателя в то же время
  // образуют слот, который дополнительно ограничен MAX_SLOT_STUDENTS.
  if (studentIds.length > 1) {
    throw badRequest(
      "Занятие может быть только с одним учеником. Для параллельных уроков создайте отдельные записи расписания."
    );
  }
  const weekdays = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7);
  if (weekdays.length === 0) throw validationError("Укажите дни недели");
  if (!/^\d{1,2}:\d{2}$/.test(input.startTime.trim())) {
    throw validationError("Время в формате HH:MM");
  }
  if (!input.durationMin || input.durationMin < 15) {
    throw validationError("Длительность слишком мала");
  }

  const activeFrom = input.activeFrom
    ? parseAppInstant(input.activeFrom)
    : now;
  const activeUntil = input.activeUntil
    ? parseAppInstant(input.activeUntil, true)
    : null;
  if (activeUntil && !(activeUntil > activeFrom)) {
    throw validationError("Дата окончания должна быть позже начала действия");
  }

  const spec: RecurringScheduleSpec = {
    weekdays,
    startTime: input.startTime.trim(),
    durationMin: input.durationMin,
    activeFrom,
    activeUntil,
  };
  const upcoming = listUpcomingOccurrences(spec, now);
  const orgLessons = await loadOrgLessonsDomain(db, ctx.organizationId);
  for (const occ of upcoming) {
    if (
      wouldExceedSlotStudentLimit(orgLessons, {
        teacherId: input.teacherId,
        startsAt: occ.startsAt.toISOString(),
        studentIds,
      })
    ) {
      throw badRequest(SLOT_STUDENT_LIMIT_ERROR);
    }
  }

  const id = newId("sch");

  await db.insert(lessonSchedules).values({
    id,
    organizationId: ctx.organizationId,
    teacherId: input.teacherId,
    directionId: input.directionId?.trim() || null,
    subject: input.subject?.trim() || null,
    weekdays,
    startTime: input.startTime.trim(),
    durationMin: input.durationMin,
    activeFrom,
    activeUntil,
    status: "active",
  });
  await db.insert(lessonScheduleStudents).values(
    studentIds.map((studentId) => ({ scheduleId: id, studentId }))
  );

  const created = await materializeSchedule(db, ctx.organizationId, id, now);
  return { id, created };
}

export async function materializeSchedule(
  db: AppDb,
  organizationId: string,
  scheduleId: string,
  now: Date = new Date(),
  horizonWeeks = SCHEDULE_HORIZON_WEEKS
): Promise<number> {
  const [sch] = await db
    .select()
    .from(lessonSchedules)
    .where(
      and(
        eq(lessonSchedules.id, scheduleId),
        eq(lessonSchedules.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!sch) throw notFound("Расписание не найдено");
  if (sch.status !== "active") return 0;

  const links = await db
    .select()
    .from(lessonScheduleStudents)
    .where(eq(lessonScheduleStudents.scheduleId, scheduleId));
  const studentIds = links.map((l) => l.studentId);
  if (studentIds.length === 0) return 0;

  const spec: RecurringScheduleSpec = {
    weekdays: sch.weekdays as number[],
    startTime: sch.startTime,
    durationMin: sch.durationMin,
    activeFrom: sch.activeFrom,
    activeUntil: sch.activeUntil,
  };
  const occurrences = listUpcomingOccurrences(spec, now, horizonWeeks);
  if (occurrences.length === 0) return 0;

  const existing = await db
    .select({
      occurrenceKey: lessons.scheduleOccurrenceKey,
    })
    .from(lessons)
    .where(eq(lessons.scheduleId, scheduleId));
  const have = new Set(
    existing.map((e) => e.occurrenceKey).filter((k): k is string => !!k)
  );
  const exceptionRows = await db
    .select({ occurrenceKey: lessonScheduleExceptions.occurrenceKey })
    .from(lessonScheduleExceptions)
    .where(eq(lessonScheduleExceptions.scheduleId, scheduleId));
  for (const e of exceptionRows) have.add(e.occurrenceKey);

  const orgLessons = await loadOrgLessonsDomain(db, organizationId);
  let created = 0;

  for (const occ of occurrences) {
    if (have.has(occ.occurrenceKey)) continue;
    const draftId = newId("l");
    const draft = {
      id: draftId,
      teacherId: sch.teacherId,
      studentIds,
      startsAt: occ.startsAt.toISOString(),
      endsAt: occ.endsAt.toISOString(),
      status: "planned" as const,
    };
    const conflictHit = findStudentScheduleConflict(orgLessons, draft);
    if (conflictHit) {
      // Конфликт только у того же ученика. Параллельные уроки разных учеников разрешены.
      continue;
    }
    if (
      wouldExceedSlotStudentLimit(orgLessons, {
        teacherId: sch.teacherId,
        startsAt: occ.startsAt.toISOString(),
        studentIds,
      })
    ) {
      continue;
    }

    try {
      await db.insert(lessons).values({
        id: draftId,
        organizationId,
        teacherId: sch.teacherId,
        directionId: sch.directionId,
        subject: sch.subject,
        scheduleId,
        scheduleOccurrenceKey: occ.occurrenceKey,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        status: "planned",
      });
      await db.insert(lessonStudents).values(
        studentIds.map((studentId) => ({ lessonId: draftId, studentId }))
      );
      orgLessons.push({
        ...draft,
        subject: sch.subject ?? undefined,
        topicId: undefined,
      });
      have.add(occ.occurrenceKey);
      created += 1;
    } catch {
      // unique violation при гонке — идемпотентность
    }
  }
  return created;
}

/** Не чаще раза в минуту на org при bootstrap — снижает шторм при частых reload. */
const MATERIALIZE_TTL_MS = 60_000;
const lastMaterializeAt = new Map<string, number>();

function weeksUntil(from: Date, until: Date): number {
  const ms = Math.max(0, until.getTime() - from.getTime());
  return Math.max(1, Math.ceil(ms / (7 * 86_400_000)) + 1);
}

/** Материализует все активные шаблоны организации (вызывается из bootstrap). */
export async function ensureOrgSchedulesMaterialized(
  db: AppDb,
  organizationId: string,
  now: Date = new Date(),
  options?: { force?: boolean; until?: Date; horizonWeeks?: number }
) {
  const last = lastMaterializeAt.get(organizationId) ?? 0;
  if (!options?.force && !options?.until && Date.now() - last < MATERIALIZE_TTL_MS) {
    return 0;
  }
  lastMaterializeAt.set(organizationId, Date.now());

  const horizonWeeks =
    options?.horizonWeeks ??
    (options?.until
      ? Math.max(SCHEDULE_HORIZON_WEEKS, weeksUntil(now, options.until))
      : SCHEDULE_HORIZON_WEEKS);

  const rows = await db
    .select({ id: lessonSchedules.id })
    .from(lessonSchedules)
    .where(
      and(
        eq(lessonSchedules.organizationId, organizationId),
        eq(lessonSchedules.status, "active")
      )
    );
  let total = 0;
  for (const r of rows) {
    total += await materializeSchedule(
      db,
      organizationId,
      r.id,
      now,
      horizonWeeks
    );
  }
  return total;
}

async function recordExceptionSafe(
  db: AppDb,
  scheduleId: string,
  occurrenceKey: string,
  reason: "deleted" | "moved" | "cancelled",
  lessonId?: string
) {
  try {
    await db
      .insert(lessonScheduleExceptions)
      .values({
        scheduleId,
        occurrenceKey,
        reason,
        lessonId: lessonId ?? null,
      })
      .onConflictDoNothing();
  } catch {
    // already recorded
  }
}

/**
 * Прекращает регулярный слот с указанного вхождения (включительно).
 * Прошедшие занятия и отметки сохраняются.
 */
export async function endRecurringScheduleFromOccurrence(
  db: AppDb,
  ctx: AuthContext,
  input: {
    scheduleId: string;
    fromOccurrenceKey: string;
    deleteLessonIds?: string[];
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const [sch] = await db
    .select()
    .from(lessonSchedules)
    .where(
      and(
        eq(lessonSchedules.id, input.scheduleId),
        eq(lessonSchedules.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!sch) throw notFound("Расписание не найдено");
  if (ctx.role === "teacher" && sch.teacherId !== ctx.teacherId) {
    throw forbidden();
  }

  const prevDay = addAppDateKey(input.fromOccurrenceKey, -1);
  const until = parseAppInstant(prevDay, true);
  await db
    .update(lessonSchedules)
    .set({ activeUntil: until, updatedAt: new Date() })
    .where(eq(lessonSchedules.id, sch.id));

  const future = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.scheduleId, sch.id),
        gte(lessons.scheduleOccurrenceKey, input.fromOccurrenceKey)
      )
    );

  const { attendances } = await import("@/server/db/schema");
  for (const row of future) {
    if (!row.scheduleOccurrenceKey) continue;
    await recordExceptionSafe(
      db,
      sch.id,
      row.scheduleOccurrenceKey,
      "deleted",
      row.id
    );
    const [hasAtt] = await db
      .select({ lessonId: attendances.lessonId })
      .from(attendances)
      .where(eq(attendances.lessonId, row.id))
      .limit(1);
    if (hasAtt || row.status === "done") {
      if (row.status !== "cancelled") {
        await db
          .update(lessons)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(lessons.id, row.id));
      }
      continue;
    }
    await db.delete(lessons).where(eq(lessons.id, row.id));
  }

  return { ok: true as const };
}

/**
 * Меняет регулярный слот с указанного вхождения: старый шаблон заканчивается,
 * создаётся новый с обновлёнными параметрами.
 */
export async function rescheduleRecurringFromOccurrence(
  db: AppDb,
  ctx: AuthContext,
  input: {
    scheduleId: string;
    fromOccurrenceKey: string;
    startTime: string;
    durationMin: number;
    weekdays?: number[];
    directionId?: string | null;
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const [sch] = await db
    .select()
    .from(lessonSchedules)
    .where(
      and(
        eq(lessonSchedules.id, input.scheduleId),
        eq(lessonSchedules.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!sch) throw notFound("Расписание не найдено");
  if (ctx.role === "teacher" && sch.teacherId !== ctx.teacherId) {
    throw forbidden();
  }

  const links = await db
    .select()
    .from(lessonScheduleStudents)
    .where(eq(lessonScheduleStudents.scheduleId, sch.id));
  const studentIds = links.map((l) => l.studentId);
  if (studentIds.length === 0) throw badRequest("У шаблона нет ученика");

  await endRecurringScheduleFromOccurrence(db, ctx, {
    scheduleId: sch.id,
    fromOccurrenceKey: input.fromOccurrenceKey,
  });

  const weekdays =
    input.weekdays && input.weekdays.length > 0
      ? [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7)
      : (sch.weekdays as number[]);

  const created = await createLessonSchedule(
    db,
    ctx,
    {
      teacherId: sch.teacherId,
      studentIds,
      weekdays,
      startTime: input.startTime,
      durationMin: input.durationMin,
      subject: sch.subject ?? undefined,
      directionId:
        input.directionId === undefined
          ? sch.directionId ?? undefined
          : input.directionId ?? undefined,
      activeFrom: fromAppDateOnly(input.fromOccurrenceKey).toISOString(),
      activeUntil: sch.activeUntil?.toISOString(),
    },
    fromAppDateOnly(input.fromOccurrenceKey)
  );

  return { ok: true as const, newScheduleId: created.id, created: created.created };
}

export async function createOneOffLessonRejectingPast(
  db: AppDb,
  ctx: AuthContext,
  lesson: {
    id?: string;
    teacherId: string;
    studentIds: string[];
    subject?: string;
    startsAt: string;
    endsAt: string;
    status: "planned" | "done" | "cancelled";
    topicId?: string;
  },
  now: Date = new Date()
) {
  // Редактирование существующего — без запрета прошлого
  if (lesson.id) {
    return null; // сигнал вызвать обычный upsert
  }
  if (
    lesson.status === "planned" &&
    new Date(lesson.startsAt).getTime() <= now.getTime()
  ) {
    throw badRequest(
      "Нельзя создать занятие в прошлом. Укажите будущее время или регулярное расписание."
    );
  }
  return null;
}

export { conflict };
