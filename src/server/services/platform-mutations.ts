import { and, eq, inArray, sql } from "drizzle-orm";

import { parseAppInstant } from "@/lib/app-time";
import { dateKeyLocal } from "@/lib/calendar-month";
import { newId } from "@/lib/format";
import {
  isFinalAttendanceStatus,
  lessonHasOccurred,
} from "@/lib/kafedra-today";
import { LESSON_MARK_CONTENT_ERROR } from "@/lib/lesson-mark-requirements";
import {
  findStudentScheduleConflict,
  uniqueStudentIds,
} from "@/lib/schedule";
import { normalizeGrade } from "@/lib/student-contacts";
import { computeMaxScore } from "@/lib/tests/helpers";
import type {
  AttendanceStatus,
  Homework,
  Lesson,
  LessonTopicLink,
  Student,
  Teacher,
  TestQuestion,
  Topic,
  TopicSection,
} from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  requireRoles,
  requireStudentProfile,
  requireTeacherProfile,
} from "@/server/authz/require";
import { splitQuestions } from "@/server/db/question-split";
import {
  attendances,
  lessonStudents,
  lessonTopics,
  lessons,
  students,
  teachers,
  testAnswerKeys,
  testAssignments,
  tests,
  topicSections,
  topics,
  users,
} from "@/server/db/schema";
import {
  applyAttendanceBalance,
  recordScheduleException,
  reverseLessonDebits,
} from "@/server/services/lesson-balance";
import {
  attendanceEventTitle,
  recordChatSystemEventSafe,
} from "@/server/services/chat-events";
import type { AppDb } from "@/server/db/types";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import {
  reviewAssignment,
  saveDraft,
  submitAssignment,
} from "@/server/services/assignments-service";
import type { StudentAnswer } from "@/lib/types";

function num(n?: number | null) {
  return n == null ? null : String(n);
}

async function loadLessonsAsDomain(db: AppDb, orgId: string): Promise<Lesson[]> {
  const rows = await db.select().from(lessons).where(eq(lessons.organizationId, orgId));
  const ids = rows.map((r) => r.id);
  const ls =
    ids.length > 0
      ? await db.select().from(lessonStudents).where(inArray(lessonStudents.lessonId, ids))
      : [];
  const map = new Map<string, string[]>();
  for (const x of ls) {
    const arr = map.get(x.lessonId) ?? [];
    arr.push(x.studentId);
    map.set(x.lessonId, arr);
  }
  const topicMap = await loadLessonTopicsMap(db, ids);
  return rows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentIds: map.get(l.id) ?? [],
    subject: l.subject ?? undefined,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    status: l.status as Lesson["status"],
    topicId: l.topicId ?? undefined,
    lessonTopics: topicMap.get(l.id) ?? [],
  }));
}

export async function loadLessonTopicsMap(
  db: AppDb,
  lessonIds: string[]
): Promise<Map<string, LessonTopicLink[]>> {
  const map = new Map<string, LessonTopicLink[]>();
  if (lessonIds.length === 0) return map;
  const rows = await db
    .select()
    .from(lessonTopics)
    .where(inArray(lessonTopics.lessonId, lessonIds));
  for (const r of rows) {
    const list = map.get(r.lessonId) ?? [];
    list.push({
      id: r.id,
      topicId: r.topicId,
      title: r.title,
      sortOrder: r.sortOrder,
    });
    map.set(r.lessonId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return map;
}

async function writeLessonTopics(
  db: AppDb,
  organizationId: string,
  lessonId: string,
  items: { topicId?: string | null; title: string }[]
): Promise<{ saved: LessonTopicLink[]; changed: boolean }> {
  const previous = await db
    .select({ title: lessonTopics.title, topicId: lessonTopics.topicId })
    .from(lessonTopics)
    .where(eq(lessonTopics.lessonId, lessonId));
  const prevKey = previous
    .map((item) => `${item.topicId ?? ""}:${item.title}`)
    .join("|");
  const cleaned = items
    .map((item) => ({
      topicId: item.topicId?.trim() || null,
      title: item.title.trim(),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 20);
  await db.delete(lessonTopics).where(eq(lessonTopics.lessonId, lessonId));
  const saved: LessonTopicLink[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const row = {
      id: newId("lt"),
      organizationId,
      lessonId,
      topicId: cleaned[i]!.topicId,
      title: cleaned[i]!.title,
      sortOrder: i,
    };
    await db.insert(lessonTopics).values(row);
    saved.push({
      id: row.id,
      topicId: row.topicId,
      title: row.title,
      sortOrder: i,
    });
  }
  const firstCatalog = saved.find((t) => t.topicId)?.topicId ?? null;
  const firstTitle = saved[0]?.title ?? null;
  await db
    .update(lessons)
    .set({
      topicId: firstCatalog,
      subject: firstTitle,
      updatedAt: new Date(),
    })
    .where(eq(lessons.id, lessonId));
  const nextKey = saved
    .map((item) => `${item.topicId ?? ""}:${item.title}`)
    .join("|");
  return { saved, changed: prevKey !== nextKey };
}

async function resolveLessonTopicItems(
  db: AppDb,
  organizationId: string,
  teacherId: string,
  items: { topicId?: string | null; title?: string | null }[]
): Promise<{ topicId: string | null; title: string }[]> {
  const out: { topicId: string | null; title: string }[] = [];
  for (const item of items) {
    const requestedId = item.topicId?.trim() || "";
    const title = (item.title ?? "").trim();
    if (requestedId) {
      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, requestedId))
        .limit(1);
      if (
        !topic ||
        topic.organizationId !== organizationId ||
        topic.teacherId !== teacherId
      ) {
        throw badRequest("Тема не принадлежит этому преподавателю");
      }
      out.push({ topicId: topic.id, title: topic.title });
    } else if (title) {
      const [match] = await db
        .select()
        .from(topics)
        .where(
          and(
            eq(topics.organizationId, organizationId),
            eq(topics.teacherId, teacherId),
            eq(topics.status, "active"),
            sql`lower(${topics.title}) = ${title.toLowerCase()}`
          )
        )
        .limit(1);
      if (match) {
        out.push({ topicId: match.id, title: match.title });
      } else {
        out.push({ topicId: null, title });
      }
    }
  }
  return out;
}

export async function upsertTeacher(
  db: AppDb,
  ctx: AuthContext,
  teacher: Omit<Teacher, "id"> & { id?: string }
) {
  // Преподаватель может править только свой профиль (без ставок и adminNotes)
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (teacher.id && teacher.id !== tid) throw forbidden();
    const [existing] = await db
      .select()
      .from(teachers)
      .where(eq(teachers.id, tid))
      .limit(1);
    if (!existing || existing.organizationId !== ctx.organizationId) {
      throw notFound();
    }
    const fullName = teacher.fullName.trim();
    if (!fullName) throw badRequest("Укажите ФИО");
    await db
      .update(teachers)
      .set({
        fullName,
        avatarInitials: teacher.avatarInitials ?? existing.avatarInitials,
        bio: teacher.bio !== undefined ? teacher.bio || null : existing.bio,
        subjects: teacher.subjects ?? existing.subjects,
        specializations:
          teacher.specializations !== undefined
            ? teacher.specializations
            : existing.specializations,
        phone: teacher.phone ?? null,
        email: teacher.email ?? existing.email,
        defaultDurationMin:
          teacher.defaultDurationMin ?? existing.defaultDurationMin,
        workDays: teacher.workDays ?? existing.workDays,
        workIntervals: teacher.workIntervals ?? existing.workIntervals,
        updatedAt: new Date(),
      })
      .where(eq(teachers.id, tid));
    if (existing.userId) {
      await db
        .update(users)
        .set({
          fullName,
          phone: teacher.phone ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.userId));
    }
    return { id: tid };
  }

  requireRoles(ctx, ["director"]);
  const id = teacher.id ?? newId("t");
  const existing = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  const values = {
    id,
    organizationId: ctx.organizationId,
    fullName: teacher.fullName,
    avatarInitials: teacher.avatarInitials ?? null,
    bio: teacher.bio ?? null,
    subjects: teacher.subjects ?? [],
    specializations: teacher.specializations ?? null,
    phone: teacher.phone ?? null,
    email: teacher.email ?? null,
    startedAt: teacher.startedAt ? new Date(teacher.startedAt) : null,
    status: teacher.status,
    lessonPrice: num(teacher.lessonPrice),
    teacherPay: num(teacher.teacherPay),
    defaultDurationMin: teacher.defaultDurationMin ?? null,
    workDays: teacher.workDays ?? null,
    workIntervals: teacher.workIntervals ?? null,
    adminNotes: teacher.adminNotes ?? null,
    updatedAt: new Date(),
  };
  if (existing[0]) {
    if (existing[0].organizationId !== ctx.organizationId) throw forbidden();
    await db.update(teachers).set(values).where(eq(teachers.id, id));
    if (existing[0].userId) {
      await db
        .update(users)
        .set({
          fullName: teacher.fullName,
          phone: teacher.phone ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].userId));
    }
  } else {
    await db.insert(teachers).values({ ...values, createdAt: new Date() });
  }
  return { id };
}

export async function deleteTeacher(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director"]);
  const [row] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  await db
    .update(students)
    .set({ primaryTeacherId: null, updatedAt: new Date() })
    .where(
      and(
        eq(students.organizationId, ctx.organizationId),
        eq(students.primaryTeacherId, id)
      )
    );
  await db.delete(teachers).where(eq(teachers.id, id));
  return { ok: true };
}

export async function upsertStudent(
  db: AppDb,
  ctx: AuthContext,
  student: Omit<Student, "id"> & { id?: string }
) {
  const grade = normalizeGrade(student.grade);
  const telegram =
    student.telegram != null ? student.telegram.trim() || null : null;
  const phone = student.phone != null ? student.phone.trim() || null : null;

  // Ученик — только личные контакты; имя/класс/преподавателя/заметки не меняет
  if (ctx.role === "student") {
    const sid = await requireStudentProfile(ctx);
    if (student.id && student.id !== sid) throw forbidden();
    const [existing] = await db
      .select()
      .from(students)
      .where(eq(students.id, sid))
      .limit(1);
    if (!existing || existing.organizationId !== ctx.organizationId) {
      throw notFound();
    }
    await db
      .update(students)
      .set({
        telegram:
          student.telegram !== undefined ? telegram : existing.telegram,
        phone: student.phone !== undefined ? phone : existing.phone,
        updatedAt: new Date(),
      })
      .where(eq(students.id, sid));
    return { id: sid };
  }

  requireRoles(ctx, ["director", "teacher"]);
  const id = student.id ?? newId("s");
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (student.teacherId && student.teacherId !== tid) throw forbidden();
    student = { ...student, teacherId: tid };
  }
  const existing = await db.select().from(students).where(eq(students.id, id)).limit(1);
  const parentContacts =
    student.parentContacts != null
      ? student.parentContacts.trim() || null
      : null;
  const values = {
    id,
    organizationId: ctx.organizationId,
    fullName: student.fullName,
    grade,
    contacts: student.contacts ?? null,
    telegram,
    phone,
    parentContacts,
    status: student.status,
    primaryTeacherId: student.teacherId || null,
    notes: student.notes ?? null,
    updatedAt: new Date(),
  };
  if (existing[0]) {
    if (existing[0].organizationId !== ctx.organizationId) throw forbidden();
    if (
      ctx.role === "teacher" &&
      existing[0].primaryTeacherId !== ctx.teacherId
    ) {
      throw forbidden();
    }
    await db.update(students).set(values).where(eq(students.id, id));
    if (existing[0].userId && ctx.role === "director") {
      await db
        .update(users)
        .set({ fullName: student.fullName, updatedAt: new Date() })
        .where(eq(users.id, existing[0].userId));
    }
  } else {
    await db.insert(students).values({ ...values, createdAt: new Date() });
  }
  return { id };
}

export async function deleteStudent(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director", "teacher"]);
  const [row] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.primaryTeacherId !== ctx.teacherId) {
    throw forbidden();
  }
  await db.delete(students).where(eq(students.id, id));
  return { ok: true };
}

export async function upsertLesson(
  db: AppDb,
  ctx: AuthContext,
  lesson: Omit<Lesson, "id"> & { id?: string }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const id = lesson.id ?? newId("l");
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (lesson.teacherId !== tid) throw forbidden();
  }
  const studentIds = uniqueStudentIds(lesson.studentIds);
  if (studentIds.length === 0) throw badRequest("Выберите ученика");
  if (studentIds.length > 1) {
    throw badRequest(
      "Занятие может быть только с одним учеником. Для параллельных уроков создайте отдельные записи."
    );
  }
  if (new Date(lesson.endsAt) <= new Date(lesson.startsAt)) {
    throw badRequest("Конец занятия должен быть позже начала");
  }

  const [existing] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  // Новое planned-занятие нельзя ставить в прошлое
  if (
    !existing &&
    lesson.status === "planned" &&
    new Date(lesson.startsAt).getTime() <= Date.now()
  ) {
    throw badRequest(
      "Нельзя создать занятие в прошлом. Выберите будущее время или регулярное расписание."
    );
  }

  const existingLessons = await loadLessonsAsDomain(db, ctx.organizationId);
  const draft: Lesson = { ...lesson, id, studentIds };
  const conflictLesson = findStudentScheduleConflict(existingLessons, draft);
  if (conflictLesson) {
    throw conflict("Конфликт расписания у ученика");
  }

  const values: {
    id: string;
    organizationId: string;
    teacherId: string;
    topicId: string | null;
    subject: string | null;
    startsAt: Date;
    endsAt: Date;
    status: Lesson["status"];
    scheduleOccurrenceKey?: string | null;
    updatedAt: Date;
  } = {
    id,
    organizationId: ctx.organizationId,
    teacherId: lesson.teacherId,
    topicId: lesson.topicId ?? null,
    subject: lesson.subject ?? null,
    startsAt: new Date(lesson.startsAt),
    endsAt: new Date(lesson.endsAt),
    status: lesson.status,
    updatedAt: new Date(),
  };
  if (existing) {
    if (existing.organizationId !== ctx.organizationId) throw forbidden();
    if (existing.scheduleId && existing.scheduleOccurrenceKey) {
      const newKey = dateKeyLocal(new Date(lesson.startsAt));
      if (newKey !== existing.scheduleOccurrenceKey) {
        await recordScheduleException(db, {
          scheduleId: existing.scheduleId,
          occurrenceKey: existing.scheduleOccurrenceKey,
          reason: "moved",
          lessonId: existing.id,
        });
        values.scheduleOccurrenceKey = newKey;
      }
    }
    if (lesson.status === "cancelled" && existing.status !== "cancelled") {
      await reverseLessonDebits(db, ctx, id);
      if (existing.scheduleId && existing.scheduleOccurrenceKey) {
        await recordScheduleException(db, {
          scheduleId: existing.scheduleId,
          occurrenceKey: existing.scheduleOccurrenceKey,
          reason: "cancelled",
          lessonId: existing.id,
        });
      }
    }
    await db.update(lessons).set(values).where(eq(lessons.id, id));
    if (lesson.status === "cancelled" && existing.status !== "cancelled") {
      await emitLessonCancelled(db, existing);
    }
    await db.delete(lessonStudents).where(eq(lessonStudents.lessonId, id));
  } else {
    await db.insert(lessons).values({ ...values, createdAt: new Date() });
  }
  if (studentIds.length) {
    await db.insert(lessonStudents).values(
      studentIds.map((studentId) => ({ lessonId: id, studentId }))
    );
  }
  return { ok: true, id };
}

export async function createRecurringScheduleAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { createLessonSchedule } = await import(
    "@/server/services/schedule-service"
  );
  return createLessonSchedule(db, ctx, {
    teacherId: String(payload.teacherId),
    studentIds: (payload.studentIds as string[]) ?? [],
    weekdays: (payload.weekdays as number[]) ?? [],
    startTime: String(payload.startTime ?? ""),
    durationMin: Number(payload.durationMin ?? 60),
    subject: payload.subject as string | undefined,
    activeFrom: payload.activeFrom as string | undefined,
    activeUntil: payload.activeUntil as string | undefined,
  });
}

export async function deleteLesson(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director", "teacher"]);
  const [row] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.teacherId !== ctx.teacherId) throw forbidden();

  if (row.scheduleId && row.scheduleOccurrenceKey) {
    await recordScheduleException(db, {
      scheduleId: row.scheduleId,
      occurrenceKey: row.scheduleOccurrenceKey,
      reason: "deleted",
      lessonId: row.id,
    });
  }

  await reverseLessonDebits(db, ctx, id);

  const [att] = await db
    .select({ lessonId: attendances.lessonId })
    .from(attendances)
    .where(eq(attendances.lessonId, id))
    .limit(1);

  if (att || row.status === "done") {
    await db
      .update(lessons)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(lessons.id, id));
    await emitLessonCancelled(db, row);
    return { ok: true, cancelled: true };
  }

  await db.delete(lessons).where(eq(lessons.id, id));
  return { ok: true };
}

const MARKABLE_ATTENDANCE = new Set<AttendanceStatus>([
  "present",
  "absent_excused",
  "absent_unexcused",
]);

async function lessonHasSavedTopics(db: AppDb, lessonId: string) {
  const [row] = await db
    .select({ id: lessonTopics.id })
    .from(lessonTopics)
    .where(eq(lessonTopics.lessonId, lessonId))
    .limit(1);
  return Boolean(row);
}

async function assertOccurredLessonMarkContent(
  db: AppDb,
  lesson: { id: string; startsAt: Date },
  previous: AttendanceStatus | null,
  extras?: { hasTopics?: boolean }
) {
  if (isFinalAttendanceStatus(previous)) return;
  if (!lessonHasOccurred({ startsAt: lesson.startsAt.toISOString() })) return;
  const hasTopics =
    extras?.hasTopics || (await lessonHasSavedTopics(db, lesson.id));
  if (!hasTopics) {
    throw badRequest(LESSON_MARK_CONTENT_ERROR);
  }
}

async function writeAttendanceRow(
  db: AppDb,
  lessonId: string,
  studentId: string,
  status: AttendanceStatus
): Promise<{ previous: AttendanceStatus | null }> {
  const [existing] = await db
    .select()
    .from(attendances)
    .where(
      and(eq(attendances.lessonId, lessonId), eq(attendances.studentId, studentId))
    )
    .limit(1);
  if (existing) {
    await db
      .update(attendances)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(attendances.lessonId, lessonId),
          eq(attendances.studentId, studentId)
        )
      );
    return { previous: existing.status as AttendanceStatus };
  }
  await db.insert(attendances).values({
    lessonId,
    studentId,
    status,
    updatedAt: new Date(),
  });
  return { previous: null };
}

async function maybeMarkLessonDone(db: AppDb, lessonId: string): Promise<boolean> {
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson || lesson.status === "cancelled" || lesson.status === "done") {
    return false;
  }
  const participants = await db
    .select()
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, lessonId));
  if (participants.length === 0) return false;
  const att = await db
    .select()
    .from(attendances)
    .where(eq(attendances.lessonId, lessonId));
  const marked = new Set(att.map((a) => a.studentId));
  if (participants.every((p) => marked.has(p.studentId))) {
    await db
      .update(lessons)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(lessons.id, lessonId));
    return true;
  }
  return false;
}

async function emitLessonConducted(
  db: AppDb,
  lesson: { id: string; organizationId: string; teacherId: string }
) {
  const participants = await db
    .select({ studentId: lessonStudents.studentId })
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, lesson.id));
  for (const p of participants) {
    await recordChatSystemEventSafe(db, {
      organizationId: lesson.organizationId,
      studentId: p.studentId,
      teacherId: lesson.teacherId,
      eventType: "lesson_conducted",
      eventKey: `lesson_conducted:${lesson.id}:${p.studentId}`,
      title: "Занятие проведено",
      lessonId: lesson.id,
    });
  }
}

async function emitLessonCancelled(
  db: AppDb,
  lesson: { id: string; organizationId: string; teacherId: string }
) {
  const participants = await db
    .select({ studentId: lessonStudents.studentId })
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, lesson.id));
  for (const p of participants) {
    await recordChatSystemEventSafe(db, {
      organizationId: lesson.organizationId,
      studentId: p.studentId,
      teacherId: lesson.teacherId,
      eventType: "lesson_cancelled",
      eventKey: `lesson_cancelled:${lesson.id}:${p.studentId}`,
      title: "Занятие отменено преподавателем",
      lessonId: lesson.id,
    });
  }
}

async function emitAttendanceSaved(
  db: AppDb,
  lesson: { id: string; organizationId: string; teacherId: string },
  studentId: string,
  status: AttendanceStatus
) {
  await recordChatSystemEventSafe(db, {
    organizationId: lesson.organizationId,
    studentId,
    teacherId: lesson.teacherId,
    eventType: "attendance_saved",
    eventKey: `attendance:${lesson.id}:${studentId}:${status}`,
    title: attendanceEventTitle(status),
    lessonId: lesson.id,
    attendanceStatus: status,
  });
}

async function emitTopicSet(
  db: AppDb,
  lesson: { id: string; organizationId: string; teacherId: string },
  titles: string[]
) {
  if (titles.length === 0) return;
  const title = titles[0]!;
  const fingerprint = titles.join("|");
  const participants = await db
    .select({ studentId: lessonStudents.studentId })
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, lesson.id));
  for (const p of participants) {
    await recordChatSystemEventSafe(db, {
      organizationId: lesson.organizationId,
      studentId: p.studentId,
      teacherId: lesson.teacherId,
      eventType: "topic_set",
      eventKey: `topic:${lesson.id}:${p.studentId}:${fingerprint}`,
      title: `Тема занятия: ${title}`,
      lessonId: lesson.id,
      topicTitle: title,
    });
  }
}

export async function completeLesson(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    topicId?: string;
    topics?: { topicId?: string | null; title?: string | null }[];
    attendances?: { studentId: string; status: AttendanceStatus }[];
    homeworkAssign?: {
      homeworkId: string;
      studentIds: string[];
      dueAt?: string;
    };
    homeworkAssigns?: {
      homeworkId: string;
      studentIds: string[];
      dueAt?: string;
    }[];
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, input.lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) {
    throw forbidden();
  }
  if (lesson.status === "cancelled") {
    throw badRequest("Нельзя отметить посещаемость у отменённого занятия");
  }

  const topicId = input.topicId?.trim() || "";
  if (topicId) {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);
    if (!topic || topic.teacherId !== lesson.teacherId) {
      throw badRequest("Тема не принадлежит этому преподавателю");
    }
  }

  const participants = await db
    .select()
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, input.lessonId));
  const participantIds = participants.map((p) => p.studentId);
  if (participantIds.length === 0) throw badRequest("У занятия нет учеников");
  const participantSet = new Set(participantIds);
  const byStudent = new Map(
    (input.attendances ?? []).map((a) => [a.studentId, a.status])
  );
  for (const [sid, status] of byStudent) {
    if (!participantSet.has(sid)) {
      throw badRequest("Ученик не участвует в занятии");
    }
    if (!MARKABLE_ATTENDANCE.has(status)) {
      throw badRequest("Некорректный статус посещаемости");
    }
  }

  const homeworkAssigns =
    input.homeworkAssigns ??
    (input.homeworkAssign?.homeworkId ? [input.homeworkAssign] : []);
  const willWriteTopics = Boolean(
    input.topicId?.trim() ||
      (input.topics ?? []).some(
        (item) => Boolean(item.topicId?.trim()) || Boolean(item.title?.trim())
      )
  );

  for (const studentId of byStudent.keys()) {
    const [existing] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.lessonId, input.lessonId),
          eq(attendances.studentId, studentId)
        )
      )
      .limit(1);
    await assertOccurredLessonMarkContent(
      db,
      lesson,
      (existing?.status as AttendanceStatus | undefined) ?? null,
      { hasTopics: willWriteTopics }
    );
  }

  if (input.topics) {
    const items = await resolveLessonTopicItems(
      db,
      ctx.organizationId,
      lesson.teacherId,
      input.topics
    );
    const written = await writeLessonTopics(
      db,
      ctx.organizationId,
      input.lessonId,
      items
    );
    if (written.changed) {
      await emitTopicSet(
        db,
        lesson,
        written.saved.map((item) => item.title)
      );
    }
  } else if (topicId) {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);
    const written = await writeLessonTopics(
      db,
      ctx.organizationId,
      input.lessonId,
      [{ topicId, title: topic?.title ?? "Тема" }]
    );
    if (written.changed) {
      await emitTopicSet(
        db,
        lesson,
        written.saved.map((item) => item.title)
      );
    }
  }

  for (const [studentId, status] of byStudent) {
    const { previous } = await writeAttendanceRow(
      db,
      input.lessonId,
      studentId,
      status
    );
    await applyAttendanceBalance(db, ctx, {
      lessonId: input.lessonId,
      studentId,
      attendanceStatus: status,
      lessonCancelled: false,
    });
    if (previous !== status) {
      await emitAttendanceSaved(db, lesson, studentId, status);
    }
  }
  const becameDone = await maybeMarkLessonDone(db, input.lessonId);
  if (becameDone) {
    await emitLessonConducted(db, lesson);
  }

  let assignedCount = 0;
  for (const assign of homeworkAssigns) {
    if (!assign.homeworkId) continue;
    const result = await assignHomework(db, ctx, {
      homeworkId: assign.homeworkId,
      topicId: topicId || undefined,
      teacherId: lesson.teacherId,
      studentIds: assign.studentIds,
      lessonId: input.lessonId,
      dueAt: assign.dueAt,
    });
    assignedCount += result.created;
  }
  return { ok: true, assignedCount };
}

export async function setAttendance(
  db: AppDb,
  ctx: AuthContext,
  lessonId: string,
  studentId: string,
  status: AttendanceStatus
) {
  requireRoles(ctx, ["director", "teacher"]);
  if (!MARKABLE_ATTENDANCE.has(status)) {
    throw badRequest("Некорректный статус посещаемости");
  }
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) throw forbidden();
  if (lesson.status === "cancelled") {
    throw badRequest("Нельзя отметить посещаемость у отменённого занятия");
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
  if (!participant) throw badRequest("Ученик не участвует в занятии");

  const [existing] = await db
    .select()
    .from(attendances)
    .where(
      and(eq(attendances.lessonId, lessonId), eq(attendances.studentId, studentId))
    )
    .limit(1);
  await assertOccurredLessonMarkContent(
    db,
    lesson,
    (existing?.status as AttendanceStatus | undefined) ?? null
  );

  const { previous } = await writeAttendanceRow(db, lessonId, studentId, status);
  const balance = await applyAttendanceBalance(db, ctx, {
    lessonId,
    studentId,
    attendanceStatus: status,
    lessonCancelled: false,
  });
  const becameDone = await maybeMarkLessonDone(db, lessonId);
  if (previous !== status) {
    await emitAttendanceSaved(db, lesson, studentId, status);
  }
  if (becameDone) {
    await emitLessonConducted(db, lesson);
  }
  return {
    ok: true,
    remaining: balance?.remaining ?? null,
    used: balance?.used ?? null,
  };
}

export async function setLessonTopic(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    topicId?: string | null;
    title?: string | null;
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, input.lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) {
    throw forbidden();
  }

  let topicId: string | null = null;
  let subject: string | null = lesson.subject;

  const requestedId = input.topicId?.trim() || "";
  const title = (input.title ?? "").trim();

  if (requestedId) {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, requestedId))
      .limit(1);
    if (
      !topic ||
      topic.organizationId !== ctx.organizationId ||
      topic.teacherId !== lesson.teacherId
    ) {
      throw badRequest("Тема не принадлежит этому преподавателю");
    }
    topicId = topic.id;
    subject = topic.title;
  } else if (title) {
    const [match] = await db
      .select()
      .from(topics)
      .where(
        and(
          eq(topics.organizationId, ctx.organizationId),
          eq(topics.teacherId, lesson.teacherId),
          eq(topics.status, "active"),
          sql`lower(${topics.title}) = ${title.toLowerCase()}`
        )
      )
      .limit(1);
    if (match) {
      topicId = match.id;
      subject = match.title;
    } else {
      topicId = null;
      subject = title;
    }
  } else {
    topicId = null;
  }

  const written = await writeLessonTopics(
    db,
    ctx.organizationId,
    lesson.id,
    topicId || subject
      ? [{ topicId, title: subject || "Тема" }]
      : []
  );
  if (written.changed) {
    await emitTopicSet(
      db,
      lesson,
      written.saved.map((item) => item.title)
    );
  }
  return { ok: true, topicId, subject };
}

export async function setLessonTopics(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    topics: { topicId?: string | null; title?: string | null }[];
  }
) {
  requireRoles(ctx, ["director", "teacher"]);
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, input.lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) {
    throw forbidden();
  }
  const items = await resolveLessonTopicItems(
    db,
    ctx.organizationId,
    lesson.teacherId,
    input.topics
  );
  const written = await writeLessonTopics(
    db,
    ctx.organizationId,
    lesson.id,
    items
  );
  if (written.changed) {
    await emitTopicSet(
      db,
      lesson,
      written.saved.map((item) => item.title)
    );
  }
  return { ok: true, topics: written.saved };
}

export async function upsertTopicSection(
  db: AppDb,
  ctx: AuthContext,
  section: Omit<TopicSection, "id" | "sortOrder"> & {
    id?: string;
    sortOrder?: number;
  }
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (section.teacherId !== tid) throw forbidden();
  }
  const id = section.id ?? newId("sec");
  const siblings = await db
    .select()
    .from(topicSections)
    .where(
      and(
        eq(topicSections.organizationId, ctx.organizationId),
        eq(topicSections.teacherId, section.teacherId)
      )
    );
  const sortOrder =
    section.sortOrder ??
    (siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0);
  const [existing] = await db
    .select()
    .from(topicSections)
    .where(eq(topicSections.id, id))
    .limit(1);
  const values = {
    id,
    organizationId: ctx.organizationId,
    teacherId: section.teacherId,
    title: section.title,
    sortOrder,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(topicSections).set(values).where(eq(topicSections.id, id));
  } else {
    await db.insert(topicSections).values({ ...values, createdAt: new Date() });
  }
  return { id };
}

export async function deleteTopicSection(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  moveTopicsTo: string | null
) {
  requireRoles(ctx, ["teacher", "director"]);
  const [section] = await db
    .select()
    .from(topicSections)
    .where(eq(topicSections.id, id))
    .limit(1);
  if (!section || section.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && section.teacherId !== ctx.teacherId) throw forbidden();

  if (moveTopicsTo) {
    const [target] = await db
      .select()
      .from(topicSections)
      .where(eq(topicSections.id, moveTopicsTo))
      .limit(1);
    if (!target || target.teacherId !== section.teacherId) {
      throw badRequest("Нельзя перенести темы в этот раздел");
    }
  }

  await db
    .update(topics)
    .set({ sectionId: moveTopicsTo, updatedAt: new Date() })
    .where(eq(topics.sectionId, id));
  await db.delete(topicSections).where(eq(topicSections.id, id));
  return { ok: true };
}

export async function reorderTopicSections(
  db: AppDb,
  ctx: AuthContext,
  teacherId: string,
  orderedIds: string[]
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher" && teacherId !== ctx.teacherId) throw forbidden();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(topicSections)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(topicSections.id, orderedIds[i]!),
          eq(topicSections.teacherId, teacherId),
          eq(topicSections.organizationId, ctx.organizationId)
        )
      );
  }
  return { ok: true };
}

export async function upsertTopic(
  db: AppDb,
  ctx: AuthContext,
  topic: Omit<Topic, "id" | "sortOrder" | "sectionId"> & {
    id?: string;
    sectionId?: string | null;
    sortOrder?: number;
  }
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (topic.teacherId !== tid) throw forbidden();
  }
  const title = topic.title.trim();
  if (!title) throw badRequest("Укажите название темы");
  const description = (topic.description ?? "").trim();
  if (!description) throw badRequest("Укажите описание темы");
  const subject = (topic.subject ?? "").trim() || "Предмет";
  const id = topic.id ?? newId("tp");
  const sectionId = topic.sectionId === undefined ? null : topic.sectionId;
  const siblings = await db
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.organizationId, ctx.organizationId),
        eq(topics.teacherId, topic.teacherId),
        sectionId == null
          ? sql`${topics.sectionId} is null`
          : eq(topics.sectionId, sectionId)
      )
    );
  const sortOrder =
    topic.sortOrder ??
    (siblings.filter((s) => s.id !== id).length
      ? Math.max(...siblings.filter((s) => s.id !== id).map((s) => s.sortOrder)) + 1
      : 0);

  const [existing] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  const values = {
    id,
    organizationId: ctx.organizationId,
    teacherId: topic.teacherId,
    sectionId,
    title,
    subject,
    description,
    programNote:
      topic.programNote !== undefined
        ? topic.programNote ?? null
        : existing?.programNote ?? null,
    status: topic.status,
    sortOrder,
    updatedAt: new Date(),
  };
  if (existing) {
    if (existing.organizationId !== ctx.organizationId) throw forbidden();
    await db.update(topics).set(values).where(eq(topics.id, id));
  } else {
    await db.insert(topics).values({ ...values, createdAt: new Date() });
  }
  return { id };
}

export async function deleteTopic(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["teacher", "director"]);
  const [row] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.teacherId !== ctx.teacherId) throw forbidden();
  await db
    .update(topics)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(topics.id, id));
  await db
    .update(tests)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(tests.topicId, id));
  return { ok: true };
}

export async function moveTopic(
  db: AppDb,
  ctx: AuthContext,
  topicId: string,
  sectionId: string | null,
  sortOrder?: number
) {
  requireRoles(ctx, ["teacher", "director"]);
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic || topic.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && topic.teacherId !== ctx.teacherId) throw forbidden();
  if (sectionId) {
    const [sec] = await db
      .select()
      .from(topicSections)
      .where(eq(topicSections.id, sectionId))
      .limit(1);
    if (!sec || sec.teacherId !== topic.teacherId) throw forbidden();
  }
  await db
    .update(topics)
    .set({
      sectionId,
      sortOrder: sortOrder ?? topic.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(topics.id, topicId));
  return { ok: true };
}

export async function reorderTopics(
  db: AppDb,
  ctx: AuthContext,
  teacherId: string,
  sectionId: string | null,
  orderedIds: string[]
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher" && teacherId !== ctx.teacherId) throw forbidden();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(topics)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(topics.id, orderedIds[i]!),
          eq(topics.teacherId, teacherId),
          eq(topics.organizationId, ctx.organizationId)
        )
      );
  }
  return { ok: true };
}

export async function upsertHomework(
  db: AppDb,
  ctx: AuthContext,
  hw: Omit<Homework, "id"> & { id?: string }
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (hw.teacherId !== tid) throw forbidden();
  }
  const id = hw.id ?? newId("hw");
  const questions = (hw.questions ?? []) as TestQuestion[];
  const { publicQuestions, answerKeys } = splitQuestions(questions);
  const maxScore = computeMaxScore(questions) || hw.maxScore;

  const [existing] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  const purpose = hw.purpose ?? existing?.purpose ?? "homework";
  const values = {
    id,
    organizationId: ctx.organizationId,
    topicId: hw.topicId || null,
    sectionId: hw.sectionId ?? null,
    teacherId: hw.teacherId,
    title: hw.title,
    description: hw.description ?? null,
    status: hw.status,
    purpose,
    maxScore: num(maxScore),
    questionsPublic: publicQuestions,
    updatedAt: new Date(),
  };
  if (existing) {
    if (existing.organizationId !== ctx.organizationId) throw forbidden();
    if (ctx.role === "teacher" && existing.teacherId !== ctx.teacherId) {
      throw forbidden();
    }
    await db.update(tests).set(values).where(eq(tests.id, id));
    await db.delete(testAnswerKeys).where(eq(testAnswerKeys.testId, id));
  } else {
    await db.insert(tests).values({ ...values, createdAt: new Date() });
  }
  for (const [questionId, payload] of Object.entries(answerKeys)) {
    await db.insert(testAnswerKeys).values({
      id: newId("key"),
      testId: id,
      questionId,
      payload,
    });
  }
  return { id };
}

export async function deleteHomework(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["teacher", "director"]);
  const [row] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.teacherId !== ctx.teacherId) throw forbidden();
  await db
    .update(tests)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(tests.id, id));
  return { ok: true };
}

export async function publishHomework(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["teacher", "director"]);
  const [hw] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!hw || hw.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && hw.teacherId !== ctx.teacherId) throw forbidden();
  const questions = (hw.questionsPublic as TestQuestion[]) ?? [];
  if (!questions.length) throw badRequest("Добавьте хотя бы одно задание");
  if (questions.some((q) => !q.prompt?.trim())) {
    throw badRequest("У всех заданий должен быть текст вопроса");
  }
  await db
    .update(tests)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(tests.id, id));
  return { ok: true };
}

export async function assignHomework(
  db: AppDb,
  ctx: AuthContext,
  input: {
    homeworkId: string;
    topicId?: string | null;
    teacherId: string;
    studentIds: string[];
    lessonId?: string;
    dueAt?: string;
  }
) {
  requireRoles(ctx, ["teacher", "director"]);
  if (ctx.role === "teacher") {
    const tid = await requireTeacherProfile(ctx);
    if (input.teacherId !== tid) throw forbidden();
  }
  const [hw] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, input.homeworkId))
    .limit(1);
  if (!hw || hw.organizationId !== ctx.organizationId) throw notFound("Тест не найден");
  if (hw.status !== "published") throw badRequest("Назначить можно только опубликованный тест");

  const studentIds = [...new Set(input.studentIds.filter(Boolean))];
  if (!studentIds.length) throw badRequest("Выберите учеников");

  const { createTestAssignmentWithSnapshot } = await import(
    "@/server/services/test-assignment-create"
  );

  let created = 0;
  for (const studentId of studentIds) {
    if (input.lessonId) {
      const dup = await db
        .select()
        .from(testAssignments)
        .where(
          and(
            eq(testAssignments.testId, input.homeworkId),
            eq(testAssignments.studentId, studentId),
            eq(testAssignments.lessonId, input.lessonId)
          )
        )
        .limit(1);
      if (dup[0]) continue;
    } else {
      const active = await db
        .select()
        .from(testAssignments)
        .where(
          and(
            eq(testAssignments.testId, input.homeworkId),
            eq(testAssignments.studentId, studentId),
            inArray(testAssignments.status, [
              "assigned",
              "in_progress",
              "remaining_questions",
              "attempt1_submitted",
              "attempt2_in_progress",
              "overdue",
            ])
          )
        )
        .limit(1);
      if (active[0] && !active[0].lessonId && active[0].sourceKind !== "theory") {
        continue;
      }
    }

    const dueAt = input.dueAt ? parseAppInstant(input.dueAt) : null;
    let status: "assigned" | "overdue" = "assigned";
    if (dueAt && dueAt.getTime() < Date.now()) {
      status = "overdue";
    }
    const assignmentId = await createTestAssignmentWithSnapshot(db, ctx, {
      testId: input.homeworkId,
      teacherId: input.teacherId,
      studentId,
      sourceKind: "homework",
      topicId: input.topicId || hw.topicId || null,
      lessonId: input.lessonId ?? null,
      dueAt,
      status,
    });
    await recordChatSystemEventSafe(db, {
      organizationId: ctx.organizationId,
      studentId,
      teacherId: input.teacherId,
      eventType: "homework_assigned",
      eventKey: `homework_assigned:${assignmentId}`,
      title: `Назначено домашнее задание: ${hw.title}`,
      assignmentId,
      homeworkTitle: hw.title,
      lessonId: input.lessonId ?? null,
    });
    created += 1;
  }
  return { ok: true, created };
}

export async function deleteHomeworkAssignment(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requireRoles(ctx, ["teacher", "director"]);
  const [row] = await db
    .select()
    .from(testAssignments)
    .where(eq(testAssignments.id, id))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.teacherId !== ctx.teacherId) throw forbidden();
  if (row.status !== "assigned") {
    throw conflict(
      "Нельзя снять задание после начала выполнения — история назначения сохраняется"
    );
  }
  await db.delete(testAssignments).where(eq(testAssignments.id, id));
  return { ok: true };
}

async function assertHomeworkOrTheoryTestAccess(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string
) {
  const sid = await requireStudentProfile(ctx);
  const assignment = await db
    .select({
      sourceKind: testAssignments.sourceKind,
      studentId: testAssignments.studentId,
    })
    .from(testAssignments)
    .where(eq(testAssignments.id, assignmentId))
    .limit(1);
  const row = assignment[0];
  if (row?.sourceKind === "theory") {
    if (row.studentId !== sid) throw forbidden();
    return;
  }
  const { assertStudentLearningAccess } = await import(
    "@/server/services/learning-access"
  );
  await assertStudentLearningAccess(db, ctx, sid, "homework");
}

export async function saveHomeworkDraftAction(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  answers: StudentAnswer[],
  attemptNumber: 1 | 2 = 1
) {
  await assertHomeworkOrTheoryTestAccess(db, ctx, id);
  return saveDraft(db, ctx, id, answers, attemptNumber);
}

export async function submitHomeworkAction(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  answers: StudentAnswer[],
  attemptNumber: 1 | 2 = 1
) {
  await assertHomeworkOrTheoryTestAccess(db, ctx, id);
  return submitAssignment(db, ctx, id, answers, attemptNumber);
}

export async function reviewHomeworkAction(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  updates: {
    questionId: string;
    manualScore: number;
    teacherComment?: string;
  }[],
  overallFeedback?: string
) {
  await requireTeacherProfile(ctx);
  return reviewAssignment(db, ctx, id, updates, overallFeedback);
}

export async function upsertTariffAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { upsertTariff } = await import("@/server/services/tariffs-service");
  return upsertTariff(db, ctx, {
    id: payload.id as string | undefined,
    name: String(payload.name ?? ""),
    price: Number(payload.price),
    durationDays: Number(payload.durationDays),
    lessonsLimit:
      payload.lessonsLimit == null ? null : Number(payload.lessonsLimit),
    weeklyFrequency:
      payload.weeklyFrequency == null
        ? undefined
        : Number(payload.weeklyFrequency),
    includesText: (payload.includesText as string) ?? null,
    features: payload.features as string[] | undefined,
    status: payload.status as "active" | "archived" | undefined,
    adminNotes: (payload.adminNotes as string) ?? null,
  });
}

export async function archiveTariffAction(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const { archiveTariff } = await import("@/server/services/tariffs-service");
  return archiveTariff(db, ctx, id);
}

export async function assignTariffAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { assignTariffToStudent } = await import(
    "@/server/services/tariffs-service"
  );
  return assignTariffToStudent(db, ctx, {
    studentId: String(payload.studentId),
    tariffId: String(payload.tariffId),
    startsAt: payload.startsAt as string | undefined,
    endsAt: payload.endsAt as string | undefined,
  });
}

export async function adminMarkPaidAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { adminMarkPaymentPaid } = await import(
    "@/server/services/tariffs-service"
  );
  return adminMarkPaymentPaid(db, ctx, {
    paymentId: String(payload.paymentId),
    reason: String(payload.reason ?? ""),
  });
}

export async function studentPayAction(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string
) {
  const { studentRequestPayment } = await import(
    "@/server/services/tariffs-service"
  );
  return studentRequestPayment(db, ctx, assignmentId);
}

export async function getIncomeOverviewAction(db: AppDb, ctx: AuthContext) {
  const { getIncomeOverview } = await import(
    "@/server/services/income-service"
  );
  return getIncomeOverview(db, ctx);
}

export async function upsertTheoryAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { upsertTheory } = await import("@/server/services/theory-service");
  return upsertTheory(db, ctx, {
    id: payload.id ? String(payload.id) : undefined,
    teacherId: String(payload.teacherId ?? ""),
    title: String(payload.title ?? ""),
    description: (payload.description as string | null | undefined) ?? null,
    videoUrl: (payload.videoUrl as string | null | undefined) ?? null,
    testId: (payload.testId as string | null | undefined) ?? null,
    status: payload.status as "draft" | "published" | "archived" | undefined,
    publish: Boolean(payload.publish),
  });
}

export async function deleteTheoryAction(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const { deleteTheory } = await import("@/server/services/theory-service");
  return deleteTheory(db, ctx, id);
}

export async function assignTheoryAction(
  db: AppDb,
  ctx: AuthContext,
  payload: Record<string, unknown>
) {
  const { assignTheory } = await import("@/server/services/theory-service");
  return assignTheory(db, ctx, {
    materialId: String(payload.materialId ?? ""),
    studentIds: Array.isArray(payload.studentIds)
      ? payload.studentIds.map((id) => String(id))
      : [],
  });
}

export async function markTheoryViewedAction(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const { markTheoryViewed } = await import("@/server/services/theory-service");
  return markTheoryViewed(db, ctx, id);
}

export async function removeTheoryFileAction(
  db: AppDb,
  ctx: AuthContext,
  materialId: string,
  fileId: string
) {
  const { removeTheoryDraftFile } = await import(
    "@/server/services/theory-service"
  );
  return removeTheoryDraftFile(db, ctx, materialId, fileId);
}

/** Dispatch table for /api/platform */
export const platformActions = {
  upsertTeacher,
  deleteTeacher,
  upsertStudent,
  deleteStudent,
  upsertLesson,
  createRecurringSchedule: createRecurringScheduleAction,
  deleteLesson,
  completeLesson,
  setAttendance,
  setLessonTopic,
  setLessonTopics,
  upsertTopicSection,
  deleteTopicSection,
  reorderTopicSections,
  upsertTopic,
  deleteTopic,
  moveTopic,
  reorderTopics,
  upsertHomework,
  deleteHomework,
  publishHomework,
  assignHomework,
  deleteHomeworkAssignment,
  saveHomeworkDraft: saveHomeworkDraftAction,
  submitHomeworkAssignment: submitHomeworkAction,
  reviewHomeworkAssignment: reviewHomeworkAction,
  upsertTariff: upsertTariffAction,
  archiveTariff: archiveTariffAction,
  assignTariff: assignTariffAction,
  adminMarkPaymentPaid: adminMarkPaidAction,
  studentRequestPayment: studentPayAction,
  getIncomeOverview: getIncomeOverviewAction,
  upsertTheory: upsertTheoryAction,
  deleteTheory: deleteTheoryAction,
  assignTheory: assignTheoryAction,
  markTheoryViewed: markTheoryViewedAction,
  removeTheoryFile: removeTheoryFileAction,
} as const;

export type PlatformAction = keyof typeof platformActions;
