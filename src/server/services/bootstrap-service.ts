import { eq, inArray } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  assignmentAnswers,
  assignmentSnapshots,
  attemptAnswers,
  attendances,
  lessonStudents,
  lessons,
  payments,
  studentTariffAssignments,
  students,
  tariffs,
  teachers,
  testAnswerKeys,
  testAssignments,
  testAttempts,
  tests,
  topicSections,
  topics,
  users,
} from "@/server/db/schema";
import { publicMediaUrl } from "@/server/media/storage";
import {
  balanceFromDelta,
  derivePackageStatus,
  getLedgerDeltaByAssignmentIds,
} from "@/server/services/lesson-balance";
import { refreshExpiredAssignments } from "@/server/services/tariffs-service";
import type { AppDb } from "@/server/db/types";
import { isMissedNextLesson } from "@/lib/homework-missed";
import {
  attemptPercent,
  buildQuestionOutcomes,
  canRevealKeys,
  mergeLatestAnswers,
  retryQuestionIds,
  unansweredQuestionIds,
} from "@/lib/tests/attempts";
import { loadLessonTopicsMap } from "@/server/services/platform-mutations";
import { mergeQuestionsWithKeys, stripQuestionKeys } from "@/server/services/question-merge";
import type {
  Attendance,
  DemoData,
  Homework,
  HomeworkAssignment,
  HomeworkAssignmentStatus,
  Lesson,
  PaymentRecord,
  Student,
  StudentAnswer,
  StudentTariffAssignment,
  Tariff,
  TariffFeatureKey,
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
  await refreshExpiredAssignments(db, orgId);
  if (ctx.role === "director" || ctx.role === "teacher") {
    const { ensureOrgSchedulesMaterialized } = await import(
      "@/server/services/schedule-service"
    );
    await ensureOrgSchedulesMaterialized(db, orgId);
  }

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

  const assignmentCountByTest = new Map<string, number>();
  for (const a of assignmentRows) {
    assignmentCountByTest.set(
      a.testId,
      (assignmentCountByTest.get(a.testId) ?? 0) + 1
    );
  }

  const homeworks: Homework[] = testRows.map((t) => {
    const publicQ = (t.questionsPublic as Homework["questions"]) ?? [];
    const keys = keysByTest.get(t.id) ?? {};
    const questions = includeKeys
      ? mergeQuestionsWithKeys(publicQ, keys)
      : (stripQuestionKeys(publicQ) as Homework["questions"]);
    const publicQs = t.questionsPublic as unknown[];
    return {
      id: t.id,
      topicId: t.topicId,
      sectionId: t.sectionId,
      teacherId: t.teacherId,
      title: t.title,
      description: t.description ?? undefined,
      status: t.status as Homework["status"],
      purpose: (t.purpose as Homework["purpose"]) ?? "homework",
      questions,
      maxScore: n(t.maxScore),
      questionCount: Array.isArray(publicQs) ? publicQs.length : 0,
      assignmentCount: assignmentCountByTest.get(t.id) ?? 0,
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

  const attemptRows =
    assignmentIds.length > 0
      ? await db
          .select()
          .from(testAttempts)
          .where(inArray(testAttempts.assignmentId, assignmentIds))
      : [];
  const attemptsByAssignment = new Map<
    string,
    { n: number; id: string; status: string }[]
  >();
  for (const row of attemptRows) {
    const list = attemptsByAssignment.get(row.assignmentId) ?? [];
    list.push({ n: row.attemptNumber, id: row.id, status: row.status });
    attemptsByAssignment.set(row.assignmentId, list);
  }
  const attemptIds = attemptRows.map((r) => r.id);
  const attemptAnsRows =
    attemptIds.length > 0
      ? await db
          .select()
          .from(attemptAnswers)
          .where(inArray(attemptAnswers.attemptId, attemptIds))
      : [];
  const answersByAttempt = new Map<string, StudentAnswer[]>();
  for (const a of attemptAnsRows) {
    const list = answersByAttempt.get(a.attemptId) ?? [];
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
    answersByAttempt.set(a.attemptId, list);
  }

  const homeworkAssignments: HomeworkAssignment[] = assignmentRows.map((a) => {
    const snap = snapById.get(a.id);
    const keys = (snap?.answerKeys as Record<string, unknown>) ?? {};
    const publicQ = (snap?.questions as Homework["questions"]) ?? [];
    const questionsWithKeys = mergeQuestionsWithKeys(publicQ, keys);
    const attempts = attemptsByAssignment.get(a.id) ?? [];
    const a1 = attempts.find((x) => x.n === 1);
    const a2 = attempts.find((x) => x.n === 2);
    const attempt1Answers = a1 ? answersByAttempt.get(a1.id) ?? [] : [];
    const attempt2Answers = a2 ? answersByAttempt.get(a2.id) ?? [] : [];
    const retryIds = retryQuestionIds(questionsWithKeys, attempt1Answers);
    const reveal = canRevealKeys({
      attempt1Submitted: a1?.status === "submitted",
      attempt2Submitted: a2?.status === "submitted",
      retryCount: retryIds.length,
    });
    const showKeys = includeKeys || (ctx.role === "student" && reveal);
    const questions = showKeys
      ? questionsWithKeys
      : (stripQuestionKeys(publicQ) as Homework["questions"]);
    const latest =
      attempt1Answers.length || attempt2Answers.length
        ? mergeLatestAnswers(questionsWithKeys, attempt1Answers, attempt2Answers)
        : ansByAssignment.get(a.id) ?? [];
    const a1Pct =
      a.attempt1Percent != null
        ? Number(a.attempt1Percent)
        : attemptPercent(questionsWithKeys, attempt1Answers);
    const a2Pct =
      a.attempt2Percent != null
        ? Number(a.attempt2Percent)
        : attemptPercent(questionsWithKeys, attempt2Answers, retryIds);

    return {
      id: a.id,
      homeworkId: a.testId,
      topicId: a.topicId,
      teacherId: a.teacherId,
      studentId: a.studentId,
      sourceKind: (a.sourceKind as HomeworkAssignment["sourceKind"]) ?? "homework",
      lessonId: a.lessonId ?? undefined,
      dueAt: a.dueAt?.toISOString(),
      assignedAt: a.createdAt?.toISOString(),
      status: a.status as HomeworkAssignmentStatus,
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
            questions,
            maxScore: Number(snap.maxScore),
          }
        : undefined,
      answers: latest,
      attempt1Answers,
      attempt2Answers,
      attempt1Percent: a1Pct,
      attempt2Percent: a2Pct,
      attempt1Submitted: a1?.status === "submitted",
      attempt2Submitted: a2?.status === "submitted",
      unansweredQuestionIds: unansweredQuestionIds(
        questionsWithKeys,
        attempt1Answers
      ),
      retryQuestionIds: retryIds,
      questionOutcomes: buildQuestionOutcomes(
        questionsWithKeys,
        attempt1Answers,
        attempt2Answers,
        a2?.status === "submitted"
      ),
      revealKeys: showKeys,
    };
  });

  const accountUserIds = [
    ...teacherRows.map((t) => t.userId).filter((id): id is string => !!id),
    ...studentRows.map((s) => s.userId).filter((id): id is string => !!id),
  ];
  const accountRows =
    accountUserIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, accountUserIds))
      : [];
  const accountEmailById = new Map(accountRows.map((u) => [u.id, u.email]));

  const mappedTeachers: Teacher[] = teacherRows.map((t) => ({
    id: t.id,
    fullName: t.fullName,
    avatarInitials: t.avatarInitials ?? undefined,
    photoUrl: publicMediaUrl(t.photoKey),
    bio: t.bio ?? undefined,
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
    adminNotes:
      ctx.role === "director" ? t.adminNotes ?? undefined : undefined,
    userId: t.userId,
    accountEmail: t.userId ? accountEmailById.get(t.userId) ?? null : null,
    accountRole: t.userId ? ("teacher" as const) : null,
  }));

  const mappedStudents: Student[] = studentRows.map((s) => {
    const base: Student = {
      id: s.id,
      fullName: s.fullName,
      grade: (s.grade as Student["grade"]) ?? null,
      telegram: s.telegram ?? null,
      phone: s.phone ?? null,
      contacts: s.contacts ?? undefined,
      status: s.status as Student["status"],
      teacherId: s.primaryTeacherId ?? "",
      createdAt: s.createdAt.toISOString(),
      userId: s.userId,
      accountEmail: s.userId ? accountEmailById.get(s.userId) ?? null : null,
      accountRole: s.userId ? ("student" as const) : null,
    };
    // Ученик не получает внутренние заметки и контакты родителей
    if (ctx.role === "student") {
      return base;
    }
    return {
      ...base,
      parentContacts: s.parentContacts ?? null,
      notes: s.notes ?? undefined,
    };
  });
  const lessonTopicMap = await loadLessonTopicsMap(db, lessonIds);
  const mappedLessons: Lesson[] = lessonRows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentIds: studentsByLesson.get(l.id) ?? [],
    subject: l.subject ?? undefined,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    status: l.status as Lesson["status"],
    topicId: l.topicId ?? undefined,
    lessonTopics: lessonTopicMap.get(l.id) ?? [],
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

  let tariffRows = await db
    .select()
    .from(tariffs)
    .where(eq(tariffs.organizationId, orgId));
  let assignmentRowsTariff = await db
    .select()
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.organizationId, orgId));
  let paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, orgId));

  if (ctx.role === "student" && ctx.studentId) {
    assignmentRowsTariff = assignmentRowsTariff.filter(
      (a) => a.studentId === ctx.studentId
    );
    paymentRows = paymentRows.filter((p) => p.studentId === ctx.studentId);
    const tariffIds = new Set(assignmentRowsTariff.map((a) => a.tariffId));
    tariffRows = tariffRows.filter((t) => tariffIds.has(t.id));
  }

  if (ctx.role === "teacher") {
    const studentIds = new Set(studentRows.map((s) => s.id));
    assignmentRowsTariff = assignmentRowsTariff.filter((a) =>
      studentIds.has(a.studentId)
    );
    paymentRows = [];
    const tariffIds = new Set(assignmentRowsTariff.map((a) => a.tariffId));
    tariffRows = tariffRows.filter((t) => tariffIds.has(t.id));
  }

  const assignedCount = new Map<string, number>();
  for (const a of await db
    .select()
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.organizationId, orgId))) {
    assignedCount.set(a.tariffId, (assignedCount.get(a.tariffId) ?? 0) + 1);
  }

  const mappedTariffs: Tariff[] = tariffRows.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: "RUB",
    durationDays: t.durationDays,
    lessonsLimit: t.lessonsLimit ?? undefined,
    weeklyFrequency: t.weeklyFrequency,
    includesText: t.includesText ?? undefined,
    features: (t.features as TariffFeatureKey[]) ?? [],
    status: t.status as Tariff["status"],
    adminNotes:
      ctx.role === "director" ? t.adminNotes ?? undefined : undefined,
    assignedCount: assignedCount.get(t.id) ?? 0,
  }));

  const tariffNameById = new Map(tariffRows.map((t) => [t.id, t]));
  const ledgerDelta = await getLedgerDeltaByAssignmentIds(
    db,
    assignmentRowsTariff.map((a) => a.id)
  );
  const mappedTariffAssignments: StudentTariffAssignment[] =
    assignmentRowsTariff.map((a) => {
      const t = tariffNameById.get(a.tariffId);
      const limit = a.lessonsLimitSnapshot ?? t?.lessonsLimit ?? null;
      const bal = balanceFromDelta(ledgerDelta.get(a.id) ?? 0, limit);
      return {
        id: a.id,
        studentId: a.studentId,
        tariffId: a.tariffId,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        priceSnapshot: Number(a.priceSnapshot),
        currency: "RUB" as const,
        status: a.status as StudentTariffAssignment["status"],
        paymentStatus: a.paymentStatus as StudentTariffAssignment["paymentStatus"],
        lessonsLimitSnapshot: a.lessonsLimitSnapshot,
        weeklyFrequencySnapshot: a.weeklyFrequencySnapshot ?? t?.weeklyFrequency,
        durationDaysSnapshot: a.durationDaysSnapshot ?? t?.durationDays,
        lessonsUsed: bal.used,
        lessonsRemaining: bal.remaining,
        packageStatus: derivePackageStatus({
          status: a.status,
          paymentStatus: a.paymentStatus,
          remaining: bal.remaining,
        }),
        tariffName: a.tariffNameSnapshot ?? t?.name,
        includesText: t?.includesText ?? undefined,
      };
    });

  const mappedPayments: PaymentRecord[] = paymentRows.map((p) => ({
    id: p.id,
    studentId: p.studentId,
    assignmentId: p.assignmentId,
    amount: Number(p.amount),
    currency: "RUB",
    status: p.status as PaymentRecord["status"],
    provider: p.provider,
    externalId: p.externalId ?? undefined,
    paidAt: p.paidAt?.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));

  const now = new Date();
  const homeworkWithMissed: HomeworkAssignment[] = homeworkAssignments.map(
    (a) => ({
      ...a,
      missedNextLesson: isMissedNextLesson(
        a,
        mappedLessons,
        now,
        mappedAttendances
      ),
    })
  );

  const currentTeacherId =
    ctx.role === "teacher"
      ? ctx.teacherId ?? mappedTeachers[0]?.id ?? ""
      : mappedTeachers[0]?.id ?? "";

  const currentStudentId =
    ctx.role === "student"
      ? ctx.studentId ?? ""
      : mappedStudents[0]?.id ?? "";

  const { listTheoryMaterialsForBootstrap } = await import(
    "@/server/services/theory-service"
  );
  const { theories, theoryAssignments } =
    await listTheoryMaterialsForBootstrap(db, ctx);

  const theoryByTestAssignment = new Map(
    theoryAssignments
      .filter((a) => a.testAssignmentId)
      .map((a) => [a.testAssignmentId!, a])
  );
  const homeworkAssignmentsWithTheory: HomeworkAssignment[] =
    homeworkWithMissed.map((a) => {
      const theory = theoryByTestAssignment.get(a.id);
      if (!theory) return a;
      return {
        ...a,
        sourceKind: "theory" as const,
        theoryAssignmentId: theory.id,
        theoryTitle: theory.title,
      };
    });

  return {
    version: 6,
    teachers: mappedTeachers,
    students: mappedStudents,
    lessons: mappedLessons,
    attendances: mappedAttendances,
    topicSections: mappedSections,
    topics: mappedTopics,
    homeworks,
    homeworkAssignments: homeworkAssignmentsWithTheory,
    theories,
    theoryAssignments,
    tariffs: mappedTariffs,
    tariffAssignments: mappedTariffAssignments,
    payments: mappedPayments,
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
