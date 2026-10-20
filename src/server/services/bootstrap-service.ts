import { eq, inArray } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  assignmentAnswers,
  assignmentSnapshots,
  attendances,
  lessonStudents,
  lessons,
  students,
  teachers,
  testAnswerKeys,
  testAssignments,
  tests,
  topicSections,
  topics,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { mergeQuestionsWithKeys } from "@/server/services/question-merge";
import type {
  Attendance,
  DemoData,
  Homework,
  HomeworkAssignment,
  Lesson,
  Student,
  StudentAnswer,
  Teacher,
  Topic,
  TopicSection,
} from "@/lib/types";

function n(v: string | null | undefined): number | undefined {
  return v == null ? undefined : Number(v);
}

/**
 * Снимок данных для кабинетов в форме DemoData.
 * Фильтрация по роли; ключи ответов в homeworks только для teacher/director.
 */
export async function buildBootstrap(
  db: AppDb,
  ctx: AuthContext
): Promise<DemoData> {
  const orgId = ctx.organizationId;

  const teacherRows = await db
    .select()
    .from(teachers)
    .where(eq(teachers.organizationId, orgId));

  let studentRows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, orgId));

  let lessonRows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.organizationId, orgId));

  let sectionRows = await db
    .select()
    .from(topicSections)
    .where(eq(topicSections.organizationId, orgId));

  let topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.organizationId, orgId));

  let testRows = await db
    .select()
    .from(tests)
    .where(eq(tests.organizationId, orgId));

  let assignmentRows = await db
    .select()
    .from(testAssignments)
    .where(eq(testAssignments.organizationId, orgId));

  if (ctx.role === "teacher" && ctx.teacherId) {
    const tid = ctx.teacherId;
    studentRows = studentRows.filter((s) => s.primaryTeacherId === tid);
    lessonRows = lessonRows.filter((l) => l.teacherId === tid);
    sectionRows = sectionRows.filter((s) => s.teacherId === tid);
    topicRows = topicRows.filter((t) => t.teacherId === tid);
    testRows = testRows.filter((t) => t.teacherId === tid);
    assignmentRows = assignmentRows.filter((a) => a.teacherId === tid);
  }

  if (ctx.role === "student" && ctx.studentId) {
    const sid = ctx.studentId;
    studentRows = studentRows.filter((s) => s.id === sid);
    const myTeacherId = studentRows[0]?.primaryTeacherId ?? "";
    teacherRows.splice(
      0,
      teacherRows.length,
      ...teacherRows.filter((t) => t.id === myTeacherId)
    );
    // lessons via lesson_students
    const ls = await db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.studentId, sid));
    const lessonIds = new Set(ls.map((x) => x.lessonId));
    lessonRows = lessonRows.filter((l) => lessonIds.has(l.id));
    assignmentRows = assignmentRows.filter((a) => a.studentId === sid);
    const topicIds = new Set(assignmentRows.map((a) => a.topicId));
    topicRows = topicRows.filter((t) => topicIds.has(t.id) || t.teacherId === myTeacherId);
    testRows = testRows.filter((t) => t.status === "published");
    sectionRows = sectionRows.filter((s) => s.teacherId === myTeacherId);
  }

  const lessonIds = lessonRows.map((l) => l.id);
  const lsAll =
    lessonIds.length > 0
      ? await db
          .select()
          .from(lessonStudents)
          .where(inArray(lessonStudents.lessonId, lessonIds))
      : [];
  const studentsByLesson = new Map<string, string[]>();
  for (const row of lsAll) {
    const list = studentsByLesson.get(row.lessonId) ?? [];
    list.push(row.studentId);
    studentsByLesson.set(row.lessonId, list);
  }

  const attRows =
    lessonIds.length > 0
      ? await db
          .select()
          .from(attendances)
          .where(inArray(attendances.lessonId, lessonIds))
      : [];

  const includeKeys = ctx.role === "director" || ctx.role === "teacher";
  const testIds = testRows.map((t) => t.id);
  const keyRows =
    includeKeys && testIds.length > 0
      ? await db
          .select()
          .from(testAnswerKeys)
          .where(inArray(testAnswerKeys.testId, testIds))
      : [];
  const keysByTest = new Map<string, Record<string, unknown>>();
  for (const k of keyRows) {
    const m = keysByTest.get(k.testId) ?? {};
    m[k.questionId] = k.payload;
    keysByTest.set(k.testId, m);
  }

  const homeworks: Homework[] = testRows.map((t) => {
    const publicQ = (t.questionsPublic as Homework["questions"]) ?? [];
    const keys = keysByTest.get(t.id) ?? {};
    const questions = includeKeys
      ? mergeQuestionsWithKeys(publicQ, keys)
      : publicQ;
    return {
      id: t.id,
      topicId: t.topicId,
      teacherId: t.teacherId,
      title: t.title,
      description: t.description ?? undefined,
      status: t.status as Homework["status"],
      questions,
      maxScore: n(t.maxScore),
    };
  });

  const assignmentIds = assignmentRows.map((a) => a.id);
  const snaps =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(assignmentSnapshots)
          .where(inArray(assignmentSnapshots.assignmentId, assignmentIds))
      : [];
  const snapById = new Map(snaps.map((s) => [s.assignmentId, s]));

  const ansRows =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(assignmentAnswers)
          .where(inArray(assignmentAnswers.assignmentId, assignmentIds))
      : [];
  const ansByAssignment = new Map<string, StudentAnswer[]>();
  for (const a of ansRows) {
    const list = ansByAssignment.get(a.assignmentId) ?? [];
    list.push({
      questionId: a.questionId,
      selectedOptionIds: (a.payload.selectedOptionIds as string[]) ?? [],
      textAnswer: (a.payload.textAnswer as string) ?? "",
      matching: (a.payload.matching as Record<string, string>) ?? {},
      order: (a.payload.order as string[]) ?? [],
      autoScore: n(a.autoScore),
      manualScore: n(a.manualScore),
      needsManualReview: a.needsManualReview,
      isCorrect: a.isCorrect,
      teacherComment: a.teacherComment ?? undefined,
    });
    ansByAssignment.set(a.assignmentId, list);
  }

  const homeworkAssignments: HomeworkAssignment[] = assignmentRows.map((a) => {
    const snap = snapById.get(a.id);
    const keys = (snap?.answerKeys as Record<string, unknown>) ?? {};
    const publicQ = (snap?.questions as Homework["questions"]) ?? [];
    const showKeys =
      includeKeys || a.status === "reviewed";
    const questions = showKeys
      ? mergeQuestionsWithKeys(publicQ, keys)
      : publicQ;
    // Ученику даже после reviewed не отдаём сырые keys в отдельном поле —
    // только вопросы (с explanation после reviewed через merge если нужно).
    // Для reviewed merge добавляет correct* — для разбора. Ок по политике «после reviewed».
    const studentSafeQuestions =
      ctx.role === "student" && a.status !== "reviewed"
        ? publicQ
        : ctx.role === "student" && a.status === "reviewed"
          ? mergeQuestionsWithKeys(publicQ, keys)
          : questions;

    return {
      id: a.id,
      homeworkId: a.testId,
      topicId: a.topicId,
      teacherId: a.teacherId,
      studentId: a.studentId,
      lessonId: a.lessonId ?? undefined,
      dueAt: a.dueAt?.toISOString(),
      status: a.status as HomeworkAssignment["status"],
      score: n(a.score),
      maxScore: n(a.maxScore),
      feedback: a.feedback ?? undefined,
      answerText: a.answerText ?? undefined,
      completedAt: a.completedAt?.toISOString(),
      reviewedAt: a.reviewedAt?.toISOString(),
      testSnapshot: snap
        ? {
            title: snap.title,
            description: snap.description ?? undefined,
            questions:
              ctx.role === "student" ? studentSafeQuestions : questions,
            maxScore: Number(snap.maxScore),
          }
        : undefined,
      answers: ansByAssignment.get(a.id) ?? [],
    };
  });

  const mappedTeachers: Teacher[] = teacherRows.map((t) => ({
    id: t.id,
    fullName: t.fullName,
    avatarInitials: t.avatarInitials ?? undefined,
    subjects: (t.subjects as string[]) ?? [],
    specializations: (t.specializations as string[]) ?? undefined,
    phone: t.phone ?? undefined,
    email: t.email ?? undefined,
    startedAt: t.startedAt?.toISOString(),
    status: t.status as Teacher["status"],
    lessonPrice: n(t.lessonPrice),
    teacherPay: n(t.teacherPay),
    defaultDurationMin: t.defaultDurationMin ?? undefined,
    workDays: (t.workDays as number[]) ?? undefined,
    workIntervals: t.workIntervals ?? undefined,
    adminNotes: t.adminNotes ?? undefined,
  }));

  const mappedStudents: Student[] = studentRows.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    contacts: s.contacts ?? undefined,
    status: s.status as Student["status"],
    teacherId: s.primaryTeacherId ?? "",
    notes: s.notes ?? undefined,
  }));

  const mappedLessons: Lesson[] = lessonRows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentIds: studentsByLesson.get(l.id) ?? [],
    subject: l.subject ?? undefined,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    status: l.status as Lesson["status"],
    topicId: l.topicId ?? undefined,
  }));

  const mappedAttendances: Attendance[] = attRows.map((a) => ({
    lessonId: a.lessonId,
    studentId: a.studentId,
    status: a.status as Attendance["status"],
  }));

  const mappedSections: TopicSection[] = sectionRows.map((s) => ({
    id: s.id,
    teacherId: s.teacherId,
    title: s.title,
    sortOrder: s.sortOrder,
  }));

  const mappedTopics: Topic[] = topicRows.map((t) => ({
    id: t.id,
    teacherId: t.teacherId,
    sectionId: t.sectionId,
    title: t.title,
    subject: t.subject,
    description: t.description ?? undefined,
    programNote: t.programNote ?? undefined,
    status: t.status as Topic["status"],
    sortOrder: t.sortOrder,
  }));

  const currentTeacherId =
    ctx.role === "teacher"
      ? ctx.teacherId ?? mappedTeachers[0]?.id ?? ""
      : mappedTeachers[0]?.id ?? "";

  const currentStudentId =
    ctx.role === "student"
      ? ctx.studentId ?? ""
      : mappedStudents[0]?.id ?? "";

  return {
    version: 5,
    teachers: mappedTeachers,
    students: mappedStudents,
    lessons: mappedLessons,
    attendances: mappedAttendances,
    topicSections: mappedSections,
    topics: mappedTopics,
    homeworks,
    homeworkAssignments,
    currentTeacherId,
    direkciyaTeacherId: currentTeacherId,
    currentStudentId,
  };
}

/** Узкий хелпер — проверка org на сущности */
export function assertOrg(
  rowOrgId: string,
  ctx: AuthContext
): void {
  if (rowOrgId !== ctx.organizationId) {
    throw new Error("org mismatch");
  }
}

export async function getTeacherRow(db: AppDb, id: string) {
  const [row] = await db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  return row ?? null;
}

export async function getStudentRow(db: AppDb, id: string) {
  const [row] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return row ?? null;
}
