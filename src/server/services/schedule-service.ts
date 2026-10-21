import { and, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  listUpcomingOccurrences,
  SCHEDULE_HORIZON_WEEKS,
  type RecurringScheduleSpec,
} from "@/lib/recurring-schedule";
import {
  findStudentScheduleConflict,
  uniqueStudentIds,
} from "@/lib/schedule";
import type { AuthContext } from "@/server/authz/context";
import {
  requireRoles,
  requireTeacherProfile,
} from "@/server/authz/require";
import {
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
  /** ISO; если не задано — сейчас */
  activeFrom?: string;
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
  if (studentIds.length === 0) throw badRequest("Добавьте хотя бы одного ученика");
  const weekdays = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7);
  if (weekdays.length === 0) throw validationError("Укажите дни недели");
  if (!/^\d{1,2}:\d{2}$/.test(input.startTime.trim())) {
    throw validationError("Время в формате HH:MM");
  }
  if (!input.durationMin || input.durationMin < 15) {
    throw validationError("Длительность слишком мала");
  }

  const activeFrom = input.activeFrom ? new Date(input.activeFrom) : now;
  const id = newId("sch");

  await db.insert(lessonSchedules).values({
    id,
    organizationId: ctx.organizationId,
    teacherId: input.teacherId,
    subject: input.subject?.trim() || null,
    weekdays,
    startTime: input.startTime.trim(),
    durationMin: input.durationMin,
    activeFrom,
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
      // Пропускаем конфликтный слот, не роняем всю генерацию
      continue;
    }
    // Также конфликт преподавателя с другим занятием
    const teacherBusy = orgLessons.some((l) => {
      if (l.teacherId !== sch.teacherId || l.status === "cancelled") return false;
      const a0 = new Date(l.startsAt).getTime();
      const a1 = new Date(l.endsAt).getTime();
      const b0 = occ.startsAt.getTime();
      const b1 = occ.endsAt.getTime();
      return a0 < b1 && b0 < a1;
    });
    if (teacherBusy) continue;

    try {
      await db.insert(lessons).values({
        id: draftId,
        organizationId,
        teacherId: sch.teacherId,
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

/** Материализует все активные шаблоны организации (вызывается из bootstrap). */
export async function ensureOrgSchedulesMaterialized(
  db: AppDb,
  organizationId: string,
  now: Date = new Date()
) {
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
    total += await materializeSchedule(db, organizationId, r.id, now);
  }
  return total;
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
