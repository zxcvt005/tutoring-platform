import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { newId } from "@/lib/format";
import {
  findStudentScheduleConflict,
  uniqueStudentIds,
} from "@/lib/schedule";
import { computeMaxScore, snapshotFromHomework } from "@/lib/tests/helpers";
import type {
  AttendanceStatus,
  Homework,
  Lesson,
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
  assignmentSnapshots,
  attendances,
  gradeEvents,
  lessonStudents,
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

function geId() {
  return `ge_${randomBytes(8).toString("hex")}`;
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
  return rows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentIds: map.get(l.id) ?? [],
    subject: l.subject ?? undefined,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    status: l.status as Lesson["status"],
    topicId: l.topicId ?? undefined,
  }));
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
  // Ученик — только свои контакты и заметки; имя/преподавателя не меняет
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
        contacts: student.contacts ?? null,
        notes: student.notes ?? null,
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
  const values = {
    id,
    organizationId: ctx.organizationId,
    fullName: student.fullName,
    contacts: student.contacts ?? null,
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
  if (studentIds.length === 0) throw badRequest("Добавьте хотя бы одного ученика");
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

  const values = {
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
    // Не переписываем историю: done/cancelled оставляем как есть при смене времени только если явно редактируют
    await db.update(lessons).set(values).where(eq(lessons.id, id));
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
  });
}

export async function deleteLesson(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director", "teacher"]);
  const [row] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && row.teacherId !== ctx.teacherId) throw forbidden();
  await db.delete(lessons).where(eq(lessons.id, id));
  return { ok: true };
}

export async function completeLesson(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    topicId: string;
    attendances: { studentId: string; status: AttendanceStatus }[];
    homeworkAssign?: {
      homeworkId: string;
      studentIds: string[];
      dueAt?: string;
    };
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
  const [topic] = await db.select().from(topics).where(eq(topics.id, input.topicId)).limit(1);
  if (!topic || topic.teacherId !== lesson.teacherId) {
    throw badRequest("Тема не принадлежит этому преподавателю");
  }
  const participants = await db
    .select()
    .from(lessonStudents)
    .where(eq(lessonStudents.lessonId, input.lessonId));
  const participantIds = participants.map((p) => p.studentId);
  if (participantIds.length === 0) throw badRequest("У занятия нет учеников");
  const byStudent = new Map(input.attendances.map((a) => [a.studentId, a.status]));
  for (const sid of participantIds) {
    if (!byStudent.has(sid)) throw badRequest("Укажите посещаемость для всех участников");
  }

  await db
    .update(lessons)
    .set({
      status: "done",
      topicId: input.topicId,
      updatedAt: new Date(),
    })
    .where(eq(lessons.id, input.lessonId));

  await db.delete(attendances).where(eq(attendances.lessonId, input.lessonId));
  await db.insert(attendances).values(
    participantIds.map((studentId) => ({
      lessonId: input.lessonId,
      studentId,
      status: byStudent.get(studentId)!,
    }))
  );

  let assignedCount = 0;
  if (input.homeworkAssign?.homeworkId) {
    const result = await assignHomework(db, ctx, {
      homeworkId: input.homeworkAssign.homeworkId,
      topicId: input.topicId,
      teacherId: lesson.teacherId,
      studentIds: input.homeworkAssign.studentIds,
      lessonId: input.lessonId,
      dueAt: input.homeworkAssign.dueAt,
    });
    assignedCount = result.created;
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
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) throw notFound();
  if (ctx.role === "teacher" && lesson.teacherId !== ctx.teacherId) throw forbidden();

  const [existing] = await db
    .select()
    .from(attendances)
    .where(
      and(
        eq(attendances.lessonId, lessonId),
        eq(attendances.studentId, studentId)
      )
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
  } else {
    await db.insert(attendances).values({
      lessonId,
      studentId,
      status,
      updatedAt: new Date(),
    });
  }
  return { ok: true };
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
    title: topic.title,
    subject: topic.subject,
    description: topic.description ?? null,
    programNote: topic.programNote ?? null,
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
  const values = {
    id,
    organizationId: ctx.organizationId,
    topicId: hw.topicId,
    teacherId: hw.teacherId,
    title: hw.title,
    description: hw.description ?? null,
    status: hw.status,
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
    topicId: string;
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

  const keys = await db
    .select()
    .from(testAnswerKeys)
    .where(eq(testAnswerKeys.testId, hw.id));
  const answerKeys = Object.fromEntries(keys.map((k) => [k.questionId, k.payload]));
  const questions = (hw.questionsPublic as TestQuestion[]) ?? [];
  if (!questions.length) throw badRequest("В тесте нет заданий");

  const fullForSnapshot: Homework = {
    id: hw.id,
    topicId: hw.topicId,
    teacherId: hw.teacherId,
    title: hw.title,
    description: hw.description ?? undefined,
    status: hw.status as Homework["status"],
    questions: questions.map((q) => {
      const k = answerKeys[q.id] as {
        correctOptionIds?: string[];
        correctAnswers?: string[];
        numericTolerance?: number;
      } | undefined;
      return {
        ...q,
        correctOptionIds: k?.correctOptionIds,
        correctAnswers: k?.correctAnswers,
        numericTolerance: k?.numericTolerance,
      };
    }),
    maxScore: hw.maxScore != null ? Number(hw.maxScore) : undefined,
  };
  const snapshot = snapshotFromHomework(fullForSnapshot);
  const { publicQuestions, answerKeys: snapKeys } = splitQuestions(
    snapshot.questions
  );

  const studentIds = [...new Set(input.studentIds.filter(Boolean))];
  if (!studentIds.length) throw badRequest("Выберите учеников");

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
              "overdue",
            ])
          )
        )
        .limit(1);
      if (active[0] && !active[0].lessonId) continue;
    }

    let status: "assigned" | "overdue" = "assigned";
    if (input.dueAt && new Date(input.dueAt).getTime() < Date.now()) {
      status = "overdue";
    }
    const assignmentId = newId("ha");
    await db.insert(testAssignments).values({
      id: assignmentId,
      organizationId: ctx.organizationId,
      testId: input.homeworkId,
      topicId: input.topicId,
      teacherId: input.teacherId,
      studentId,
      lessonId: input.lessonId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      status,
      maxScore: num(snapshot.maxScore),
    });
    await db.insert(assignmentSnapshots).values({
      assignmentId,
      title: snapshot.title,
      description: snapshot.description ?? null,
      questions: publicQuestions,
      maxScore: num(snapshot.maxScore)!,
      answerKeys: snapKeys,
    });
    await db.insert(gradeEvents).values({
      id: geId(),
      organizationId: ctx.organizationId,
      assignmentId,
      eventType: "assigned",
      actorUserId: ctx.userId,
      payload: { source: "assignHomework" },
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
  await db.delete(testAssignments).where(eq(testAssignments.id, id));
  return { ok: true };
}

export async function saveHomeworkDraftAction(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  answers: StudentAnswer[]
) {
  const sid = await requireStudentProfile(ctx);
  const { assertStudentLearningAccess } = await import(
    "@/server/services/learning-access"
  );
  await assertStudentLearningAccess(db, ctx, sid, "homework");
  return saveDraft(db, ctx, id, answers);
}

export async function submitHomeworkAction(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  answers: StudentAnswer[]
) {
  const sid = await requireStudentProfile(ctx);
  const { assertStudentLearningAccess } = await import(
    "@/server/services/learning-access"
  );
  await assertStudentLearningAccess(db, ctx, sid, "homework");
  return submitAssignment(db, ctx, id, answers);
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
} as const;

export type PlatformAction = keyof typeof platformActions;
