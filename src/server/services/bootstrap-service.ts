import { and, eq, inArray, sql } from "drizzle-orm";

import { canManageSchoolKnowledgeBase } from "@/lib/auth/school-knowledge";
import type { AuthContext } from "@/server/authz/context";
import {
  assignmentAnswers,
  assignmentSnapshots,
  attemptAnswers,
  attendances,
  lessonStudents,
  lessons,
  learningDirections,
  lessonOrders,
  payments,
  studentLessonLedger,
  students,
  tariffPurchaseOptions,
  tariffs,
  teachers,
  testAnswerKeys,
  testAssignments,
  testAttempts,
  tests,
  topicSections,
  topics,
  materialFolders,
  users,
} from "@/server/db/schema";
import { publicMediaUrl } from "@/server/media/storage";
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
import { loadOriginMap, originKey } from "@/server/services/material-origins";
import { loadLessonTopicsMap } from "@/server/services/platform-mutations";
import { mergeQuestionsWithKeys, stripQuestionKeys } from "@/server/services/question-merge";
import { isStudentFullyOnboarded } from "@/lib/students/availability";
import type {
  Attendance,
  DemoData,
  Homework,
  HomeworkAssignment,
  HomeworkAssignmentStatus,
  Lesson,
  LearningDirection,
  LessonOrder,
  PaymentRecord,
  Product,
  SettlementDocumentSummary,
  Student,
  StudentAnswer,
  StudentAvailabilitySlot,
  StudentDirectionBalance,
  StudentDirectionBalanceRow,
  StudentOnboardingStatus,
  Tariff,
  TariffFeatureKey,
  TariffPurchaseOption,
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
  if (
    ctx.role === "director" ||
    ctx.role === "teacher" ||
    ctx.role === "press"
  ) {
    const { ensureOrgSchedulesMaterialized } = await import(
      "@/server/services/schedule-service"
    );
    await ensureOrgSchedulesMaterialized(db, orgId);
  }

  let teacherRows = await db
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

  let folderRows = await db
    .select()
    .from(materialFolders)
    .where(eq(materialFolders.organizationId, orgId));

  let topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.organizationId, orgId));

  let testRows = await db
    .select()
    .from(tests)
    .where(eq(tests.organizationId, orgId));

  if (!canManageSchoolKnowledgeBase(ctx.role) && ctx.role !== "teacher") {
    topicRows = topicRows.filter((row) => row.libraryScope !== "school");
    testRows = testRows.filter((row) => row.libraryScope !== "school");
  }

  let assignmentRows = await db
    .select()
    .from(testAssignments)
    .where(eq(testAssignments.organizationId, orgId));

  if (ctx.role === "teacher") {
    if (!ctx.teacherId) {
      // Orphan teacher membership (profile deleted): never expose org-wide data.
      studentRows = [];
      lessonRows = [];
      sectionRows = [];
      folderRows = [];
      topicRows = [];
      testRows = [];
      assignmentRows = [];
      teacherRows = [];
    } else {
      const tid = ctx.teacherId;
      studentRows = studentRows.filter(
        (s) =>
          s.primaryTeacherId === tid &&
          isStudentFullyOnboarded(s.onboardingStatus)
      );
      lessonRows = lessonRows.filter((l) => l.teacherId === tid);
      sectionRows = sectionRows.filter((s) => s.teacherId === tid);
      folderRows = folderRows.filter(
        (f) =>
          f.ownerScope === "school" ||
          (f.ownerScope === "teacher" && f.teacherId === tid)
      );
      topicRows = topicRows.filter(
        (t) => t.teacherId === tid || t.libraryScope === "school"
      );
      testRows = testRows.filter(
        (t) => t.teacherId === tid || t.libraryScope === "school"
      );
      assignmentRows = assignmentRows.filter((a) => a.teacherId === tid);
    }
  }

  if (ctx.role === "director" || ctx.role === "assistant") {
    // Незавершённые enrollment-регистрации — только в блоке «Приглашения».
    studentRows = studentRows.filter((s) =>
      isStudentFullyOnboarded(s.onboardingStatus)
    );
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
    // Школьные папки ученику не отдаём (как assertCanReadSpace в folder-service).
    folderRows = folderRows.filter(
      (f) => f.ownerScope === "teacher" && f.teacherId === myTeacherId
    );
  }

  if (ctx.role === "press") {
    // Пресс не использует explorer материалов и не проходит assertCanReadSpace.
    folderRows = [];
  }

  if (ctx.role === "assistant") {
    studentRows = [];
    lessonRows = [];
    assignmentRows = [];
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

  const includeKeys =
    canManageSchoolKnowledgeBase(ctx.role) || ctx.role === "teacher";
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

  const originMap =
    ctx.role === "student"
      ? new Map()
      : await loadOriginMap(db, orgId);

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
      folderId: t.folderId ?? t.sectionId ?? null,
      teacherId: t.teacherId ?? "",
      libraryScope: (t.libraryScope as Homework["libraryScope"]) ?? "teacher",
      origin:
        ctx.role === "student"
          ? null
          : (originMap.get(originKey("test", t.id)) ?? null),
      updatedAt: t.updatedAt.toISOString(),
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
    lessonPrice:
      ctx.role === "press" || ctx.role === "assistant"
        ? undefined
        : n(t.lessonPrice),
    teacherPay:
      ctx.role === "press" || ctx.role === "assistant"
        ? undefined
        : n(t.teacherPay),
    defaultDurationMin: t.defaultDurationMin ?? undefined,
    workDays: (t.workDays as number[]) ?? undefined,
    workIntervals: t.workIntervals ?? undefined,
    adminNotes:
      ctx.role === "director" ? t.adminNotes ?? undefined : undefined,
    userId: t.userId,
    accountEmail: t.userId ? accountEmailById.get(t.userId) ?? null : null,
    accountRole: t.userId ? ("teacher" as const) : null,
  }));

  const studentIdsForSlots = studentRows.map((s) => s.id);
  const availabilityByStudent = new Map<string, StudentAvailabilitySlot[]>();
  if (
    studentIdsForSlots.length &&
    (ctx.role === "director" ||
      ctx.role === "teacher" ||
      ctx.role === "assistant" ||
      ctx.role === "student")
  ) {
    const { studentAvailabilitySlots } = await import("@/server/db/schema");
    try {
      const slotRows = await db
        .select({
          studentId: studentAvailabilitySlots.studentId,
          weekday: studentAvailabilitySlots.weekday,
          hourStart: studentAvailabilitySlots.hourStart,
        })
        .from(studentAvailabilitySlots)
        .where(inArray(studentAvailabilitySlots.studentId, studentIdsForSlots));
      for (const row of slotRows) {
        const list = availabilityByStudent.get(row.studentId) ?? [];
        list.push({ weekday: row.weekday, hourStart: row.hourStart });
        availabilityByStudent.set(row.studentId, list);
      }
    } catch {
      // Таблица может отсутствовать до миграции 0054.
    }
  }

  const mappedStudents: Student[] = studentRows.map((s) => {
    const base: Student = {
      id: s.id,
      fullName: s.fullName,
      grade: (s.grade as Student["grade"]) ?? null,
      telegram: s.telegram ?? null,
      phone: s.phone ?? null,
      contacts: s.contacts ?? undefined,
      onboardingStatus:
        (s.onboardingStatus as StudentOnboardingStatus | undefined) ??
        "complete",
      availabilitySlots: availabilityByStudent.get(s.id) ?? [],
      status: s.status as Student["status"],
      teacherId: s.primaryTeacherId ?? "",
      archivedAt: s.archivedAt?.toISOString() ?? null,
      archivedReason: (s.archivedReason as Student["archivedReason"]) ?? null,
      archivedComment: s.archivedComment ?? null,
      previousTeacherId: s.previousTeacherId ?? null,
      createdAt: s.createdAt.toISOString(),
      userId: s.userId,
      accountEmail: s.userId ? accountEmailById.get(s.userId) ?? null : null,
      accountRole: s.userId ? ("student" as const) : null,
    };
    // Ученик не получает внутренние заметки и контакты родителей
    if (ctx.role === "student") {
      return {
        ...base,
        parentName: s.parentName ?? null,
        learningGoal: s.learningGoal ?? null,
      };
    }
    if (ctx.role === "press") {
      return {
        ...base,
        parentContacts: s.parentContacts ?? null,
      };
    }
    return {
      ...base,
      parentName: s.parentName ?? null,
      learningGoal: s.learningGoal ?? null,
      parentContacts: s.parentContacts ?? null,
      notes: s.notes ?? undefined,
    };
  });
  const lessonTopicMap = await loadLessonTopicsMap(db, lessonIds);
  const mappedLessons: Lesson[] = lessonRows.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    directionId: l.directionId ?? null,
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
    teacherId: t.teacherId ?? "",
    libraryScope: (t.libraryScope as Topic["libraryScope"]) ?? "teacher",
    origin:
      ctx.role === "student"
        ? null
        : (originMap.get(originKey("topic", t.id)) ?? null),
    updatedAt: t.updatedAt.toISOString(),
    sectionId: t.sectionId,
    folderId: t.folderId ?? t.sectionId ?? null,
    title: t.title,
    subject: t.subject,
    description: t.description ?? undefined,
    programNote: t.programNote ?? undefined,
    status: t.status as Topic["status"],
    sortOrder: t.sortOrder,
  }));

  // Системные папки БЗ: школа + пространства преподавателей в снимке.
  try {
    const { ensureSystemKnowledgeFolders } = await import(
      "@/server/services/folder-service"
    );
    if (ctx.role === "director" || ctx.role === "assistant") {
      await ensureSystemKnowledgeFolders(db, orgId, {
        ownerScope: "school",
        teacherId: null,
      });
      for (const t of teacherRows) {
        await ensureSystemKnowledgeFolders(db, orgId, {
          ownerScope: "teacher",
          teacherId: t.id,
        });
      }
    } else if (ctx.role === "teacher" && ctx.teacherId) {
      await ensureSystemKnowledgeFolders(db, orgId, {
        ownerScope: "teacher",
        teacherId: ctx.teacherId,
      });
    }
    if (ctx.role !== "press") {
      let refreshed = await db
        .select()
        .from(materialFolders)
        .where(eq(materialFolders.organizationId, orgId));
      if (ctx.role === "teacher" && ctx.teacherId) {
        const tid = ctx.teacherId;
        refreshed = refreshed.filter(
          (f) =>
            f.ownerScope === "school" ||
            (f.ownerScope === "teacher" && f.teacherId === tid)
        );
      } else if (ctx.role === "student") {
        const myTeacherId = studentRows[0]?.primaryTeacherId ?? "";
        refreshed = refreshed.filter(
          (f) => f.ownerScope === "teacher" && f.teacherId === myTeacherId
        );
      }
      folderRows = refreshed;
    }
  } catch {
    // Колонка system_key может отсутствовать до миграции — не ломаем bootstrap.
  }

  const mappedMaterialFolders = folderRows.map((f) => {
    const contentKind =
      f.contentKind === "topic" ||
      f.contentKind === "theory" ||
      f.contentKind === "test" ||
      f.contentKind === "intensive" ||
      f.contentKind === "shared"
        ? (f.contentKind as
            | "topic"
            | "theory"
            | "test"
            | "intensive"
            | "shared")
        : null;
    return {
      id: f.id,
      ownerScope: (f.ownerScope === "school" ? "school" : "teacher") as
        | "school"
        | "teacher",
      teacherId: f.teacherId,
      systemKey: f.systemKey ?? null,
      parentId: f.parentId,
      title: f.title,
      sortOrder: f.sortOrder,
      contentKind,
    };
  });

  const directionRows = await db
    .select()
    .from(learningDirections)
    .where(eq(learningDirections.organizationId, orgId));
  const directionById = new Map(directionRows.map((d) => [d.id, d]));
  const mappedDirections: LearningDirection[] = directionRows.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    status: d.status as LearningDirection["status"],
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  let tariffRows = await db
    .select()
    .from(tariffs)
    .where(eq(tariffs.organizationId, orgId));
  let orderRows = await db
    .select()
    .from(lessonOrders)
    .where(eq(lessonOrders.organizationId, orgId));
  let paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, orgId));

  if (ctx.role === "student" && ctx.studentId) {
    const visibleOrderIds = new Set(
      orderRows
        .filter(
          (o) =>
            o.studentId === ctx.studentId || o.payerUserId === ctx.userId
        )
        .map((o) => o.id)
    );
    orderRows = orderRows.filter((o) => visibleOrderIds.has(o.id));
    paymentRows = paymentRows.filter(
      (p) =>
        p.studentId === ctx.studentId || visibleOrderIds.has(p.orderId)
    );
    tariffRows = tariffRows.filter((t) => t.status === "active");
  }

  if (ctx.role === "teacher") {
    const studentIds = new Set(studentRows.map((s) => s.id));
    orderRows = orderRows.filter(
      (o) => o.studentId != null && studentIds.has(o.studentId)
    );
    paymentRows = [];
    const tariffIds = new Set(orderRows.map((o) => o.tariffId));
    tariffRows = tariffRows.filter(
      (t) => tariffIds.has(t.id) || t.status === "active"
    );
  }

  if (ctx.role === "press") {
    paymentRows = [];
    orderRows = [];
    tariffRows = [];
  }

  const optionRows = await db
    .select()
    .from(tariffPurchaseOptions)
    .where(eq(tariffPurchaseOptions.organizationId, orgId));
  const optionsByTariff = new Map<string, TariffPurchaseOption[]>();
  for (const opt of optionRows) {
    if (ctx.role === "press") continue;
    if (
      (ctx.role === "student" || ctx.role === "teacher") &&
      !tariffRows.some((t) => t.id === opt.tariffId)
    ) {
      continue;
    }
    const list = optionsByTariff.get(opt.tariffId) ?? [];
    list.push({
      id: opt.id,
      tariffId: opt.tariffId,
      lessonsCount: opt.lessonsCount,
      totalPrice: Number(opt.totalPrice),
      sortOrder: opt.sortOrder,
      isActive: opt.isActive,
      createdAt: opt.createdAt.toISOString(),
      updatedAt: opt.updatedAt.toISOString(),
    });
    optionsByTariff.set(opt.tariffId, list);
  }

  const activeOrderCount = new Map<string, number>();
  const allOrders =
    ctx.role === "press"
      ? []
      : await db
          .select({
            tariffId: lessonOrders.tariffId,
            status: lessonOrders.status,
          })
          .from(lessonOrders)
          .where(eq(lessonOrders.organizationId, orgId));
  for (const o of allOrders) {
    if (o.status !== "awaiting_payment" && o.status !== "paid") continue;
    activeOrderCount.set(o.tariffId, (activeOrderCount.get(o.tariffId) ?? 0) + 1);
  }

  const { loadTariffProductIdsByTariff } = await import(
    "@/server/services/products-service"
  );
  const productIdsByTariff = await loadTariffProductIdsByTariff(db, orgId);

  const mappedTariffs: Tariff[] = tariffRows.map((t) => {
    const direction = directionById.get(t.directionId);
    return {
      id: t.id,
      directionId: t.directionId,
      name: t.name,
      price: t.price != null ? Number(t.price) : undefined,
      currency: "RUB",
      durationDays: t.durationDays ?? undefined,
      lessonsLimit: t.lessonsLimit ?? undefined,
      weeklyFrequency: t.weeklyFrequency,
      includesText: t.includesText ?? undefined,
      features: (t.features as TariffFeatureKey[]) ?? [],
      status: t.status as Tariff["status"],
      adminNotes:
        ctx.role === "director" ? t.adminNotes ?? undefined : undefined,
      activeOrderCount: activeOrderCount.get(t.id) ?? 0,
      purchaseOptions: optionsByTariff.get(t.id) ?? [],
      productIds: productIdsByTariff.get(t.id) ?? [],
      directionName: direction?.name,
    };
  });

  const payerUserIds = [
    ...new Set(
      orderRows
        .map((o) => o.payerUserId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const payerNameByUserId = new Map<string, string>();
  if (payerUserIds.length > 0 && ctx.role === "director") {
    const payerRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, payerUserIds));
    for (const u of payerRows) payerNameByUserId.set(u.id, u.fullName);
  } else {
    for (const s of mappedStudents) {
      if (s.userId) payerNameByUserId.set(s.userId, s.fullName);
    }
  }

  const studentById = new Map(mappedStudents.map((s) => [s.id, s]));
  const mappedLessonOrders: LessonOrder[] = orderRows.map((o) => {
    const student = o.studentId ? studentById.get(o.studentId) : undefined;
    const livePayerName = o.payerUserId
      ? payerNameByUserId.get(o.payerUserId) ?? null
      : null;
    const payerName =
      o.payerNameSnapshot?.trim() ||
      (student?.userId &&
      o.payerUserId &&
      student.userId === o.payerUserId
        ? student.fullName
        : livePayerName) ||
      null;
    const direction = directionById.get(o.directionId);
    return {
      id: o.id,
      studentId: o.studentId,
      payerUserId: o.payerUserId,
      payerName,
      studentNameSnapshot:
        o.studentNameSnapshot?.trim() || student?.fullName || null,
      tariffId: o.tariffId,
      optionId: o.optionId,
      directionId: o.directionId,
      directionName: direction?.name ?? null,
      tariffNameSnapshot: o.tariffNameSnapshot,
      lessonsCount: o.lessonsCount,
      totalAmount: Number(o.totalAmount),
      unitPrice: Number(o.unitPrice),
      currency: "RUB" as const,
      featuresSnapshot: (o.featuresSnapshot as TariffFeatureKey[]) ?? [],
      productIdsSnapshot: (o.productIdsSnapshot as string[]) ?? [],
      status: o.status as LessonOrder["status"],
      paidAt: o.paidAt?.toISOString() ?? null,
      creditedAt: o.creditedAt?.toISOString() ?? null,
      creditLedgerEntryId: o.creditLedgerEntryId,
      accessRevoked: o.accessRevoked,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });

  const mappedPayments: PaymentRecord[] = paymentRows.map((p) => {
    const student = p.studentId ? studentById.get(p.studentId) : undefined;
    return {
      id: p.id,
      studentId: p.studentId,
      studentNameSnapshot:
        p.studentNameSnapshot?.trim() || student?.fullName || null,
      orderId: p.orderId,
      amount: Number(p.amount),
      currency: "RUB",
      status: p.status as PaymentRecord["status"],
      provider: p.provider,
      externalId: p.externalId ?? undefined,
      paymentLinkId: p.paymentLinkId ?? undefined,
      paidAt: p.paidAt?.toISOString(),
      createdAt: p.createdAt.toISOString(),
      failureReason: p.failureReason ?? null,
    };
  });

  let mappedSettlementDocuments: SettlementDocumentSummary[] = [];
  if (ctx.role !== "teacher" && ctx.role !== "press" && mappedPayments.length > 0) {
    try {
      const {
        listSettlementDocumentsForPayments,
        toSettlementDocumentSummary,
      } = await import("@/server/services/settlement-documents-service");
      const rows = await listSettlementDocumentsForPayments(
        db,
        orgId,
        mappedPayments.map((p) => p.id)
      );
      mappedSettlementDocuments = rows.map(toSettlementDocumentSummary);
    } catch (err) {
      console.error("bootstrap settlement documents failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      mappedSettlementDocuments = [];
    }
  }

  const relevantStudentIds = studentRows.map((s) => s.id);
  let studentDirectionBalances: StudentDirectionBalanceRow[] = [];
  if (relevantStudentIds.length > 0 && ctx.role !== "press") {
    const balanceRows = await db
      .select({
        studentId: studentLessonLedger.studentId,
        directionId: studentLessonLedger.directionId,
        remaining: sql<number>`coalesce(sum(${studentLessonLedger.delta}), 0)`,
        used: sql<number>`coalesce(sum(case when ${studentLessonLedger.delta} < 0 then -${studentLessonLedger.delta} else 0 end), 0)`,
      })
      .from(studentLessonLedger)
      .where(
        and(
          eq(studentLessonLedger.organizationId, orgId),
          inArray(studentLessonLedger.studentId, relevantStudentIds)
        )
      )
      .groupBy(
        studentLessonLedger.studentId,
        studentLessonLedger.directionId
      );
    studentDirectionBalances = balanceRows.map((r) => ({
      studentId: r.studentId,
      directionId: r.directionId,
      remaining: Number(r.remaining ?? 0),
      used: Number(r.used ?? 0),
    }));
  }

  const balancesByStudent = new Map<string, StudentDirectionBalance[]>();
  for (const row of studentDirectionBalances) {
    const direction = directionById.get(row.directionId);
    const list = balancesByStudent.get(row.studentId) ?? [];
    list.push({
      directionId: row.directionId,
      directionName: direction?.name,
      directionSlug: direction?.slug,
      balance: row.remaining,
    });
    balancesByStudent.set(row.studentId, list);
  }
  for (let i = 0; i < mappedStudents.length; i++) {
    const sid = mappedStudents[i]!.id;
    const dirBalances = balancesByStudent.get(sid);
    if (dirBalances?.length) {
      mappedStudents[i] = { ...mappedStudents[i]!, directionBalances: dirBalances };
    }
  }

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
      ? ctx.teacherId ?? ""
      : mappedTeachers[0]?.id ?? "";

  const currentStudentId =
    ctx.role === "student"
      ? ctx.studentId ?? ""
      : mappedStudents[0]?.id ?? "";

  const { listTrialLessonsForSchedule } = await import(
    "@/server/services/trial-lessons-service"
  );
  const trialLessonsForSchedule =
    ctx.role === "assistant"
      ? []
      : await listTrialLessonsForSchedule(db, ctx);

  const { listTheoryMaterialsForBootstrap } = await import(
    "@/server/services/theory-service"
  );
  const { theories, theoryAssignments } =
    await listTheoryMaterialsForBootstrap(db, ctx);

  const { loadMockExamsForBootstrap } = await import(
    "@/server/services/mock-exams-service"
  );
  const { mockExams, mockExamResults } = await loadMockExamsForBootstrap(
    db,
    ctx
  );

  const { listIntensivesForBootstrap } = await import(
    "@/server/services/intensives-service"
  );
  const { intensives, intensiveAssignments } = await listIntensivesForBootstrap(
    db,
    ctx
  );

  let productsCatalog: Product[] = [];
  let availableProductSlugs: string[] = [];
  if (ctx.role === "director") {
    const { listProducts } = await import("@/server/services/products-service");
    productsCatalog = await listProducts(db, ctx);
  } else if (ctx.role === "student") {
    const { studentAccessibleProductSlugs } = await import(
      "@/server/services/products-service"
    );
    availableProductSlugs = await studentAccessibleProductSlugs(db, ctx);
  }

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

  const payload = {
    version: 6 as const,
    teachers: mappedTeachers,
    students: mappedStudents,
    lessons: mappedLessons,
    trialLessons: trialLessonsForSchedule,
    attendances: mappedAttendances,
    topicSections: mappedSections,
    materialFolders: mappedMaterialFolders,
    topics: mappedTopics,
    homeworks,
    homeworkAssignments: homeworkAssignmentsWithTheory,
    theories,
    theoryAssignments,
    intensives,
    intensiveAssignments,
    mockExams,
    mockExamResults,
    learningDirections: mappedDirections,
    tariffs: mappedTariffs,
    lessonOrders: mappedLessonOrders,
    tariffAssignments: [],
    studentDirectionBalances,
    payments: mappedPayments,
    settlementDocuments: mappedSettlementDocuments,
    products: productsCatalog,
    availableProductSlugs,
    currentTeacherId,
    direkciyaTeacherId: currentTeacherId,
    currentStudentId,
  };

  if (ctx.role === "assistant") {
    return {
      ...payload,
      students: [],
      lessons: [],
      trialLessons: [],
      attendances: [],
      homeworkAssignments: [],
      theoryAssignments: [],
      intensiveAssignments: [],
      mockExams: [],
      mockExamResults: [],
      learningDirections: [],
      tariffs: [],
      lessonOrders: [],
      tariffAssignments: [],
      studentDirectionBalances: [],
      payments: [],
      settlementDocuments: [],
      products: [],
      availableProductSlugs: [],
      currentTeacherId: "",
      direkciyaTeacherId: "",
      currentStudentId: "",
    };
  }

  return payload;
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
