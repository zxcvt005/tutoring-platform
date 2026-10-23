/**
 * Seed демо-организации из createSeedData().
 * Идемпотентен по фиксированным id: повторный запуск обновляет/дописывает demo-org.
 * Не трогает другие organization id.
 */
import { eq, inArray, or } from "drizzle-orm";

import { createSeedData } from "@/lib/demo/seed";
import type { StudentAnswer, TestQuestion } from "@/lib/types";
import { hashPassword } from "@/server/auth/password";
import { splitQuestions } from "@/server/db/question-split";
import * as t from "@/server/db/schema";
import { deepWin1251Safe } from "@/server/db/unicode-safe";

export const DEMO_ORG_ID = "org_demo";
export const DEMO_ORG_SLUG = "demo-school";

/** Только для локального/тестового seed — не для продакшн-аккаунтов. */
/** Только для локального seed; соответствует политике пароля (≥10, буквы+цифры). */
export const DEMO_PASSWORD = "Demo-Pass-Change-Me1!";

export type SeedOptions = {
  /** Нужно на Windows/embedded PG с server_encoding=WIN1251 */
  win1251Safe?: boolean;
};

type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (...args: any[]) => any;
};

function userIdForTeacher(teacherId: string) {
  return `user_${teacherId}`;
}

function userIdForStudent(studentId: string) {
  return `user_${studentId}`;
}

function directorUserId() {
  return "user_director_demo";
}

function toDate(iso?: string) {
  return iso ? new Date(iso) : null;
}

function num(n?: number | null) {
  return n == null ? null : String(n);
}

export async function backfillLedgerFromAttendances(
  db: DbLike,
  organizationId: string
) {
  const lessonRows: {
    id: string;
    startsAt: Date;
    status: string;
  }[] = await db
    .select()
    .from(t.lessons)
    .where(eq(t.lessons.organizationId, organizationId));
  if (lessonRows.length === 0) return;
  const lessonIds = lessonRows.map((l) => l.id);
  const attendances: {
    lessonId: string;
    studentId: string;
    status: string;
  }[] = await db
    .select()
    .from(t.attendances)
    .where(inArray(t.attendances.lessonId, lessonIds));
  const assignments: {
    id: string;
    studentId: string;
    paymentStatus: string;
    startsAt: Date;
  }[] = await db
    .select()
    .from(t.studentTariffAssignments)
    .where(eq(t.studentTariffAssignments.organizationId, organizationId));

  const lessonById = new Map(lessonRows.map((l) => [l.id, l]));

  for (const att of attendances) {
    if (att.status !== "present" && att.status !== "absent_unexcused") continue;
    const lesson = lessonById.get(att.lessonId);
    if (!lesson || lesson.status === "cancelled") continue;
    const sta = assignments
      .filter(
        (a) =>
          a.studentId === att.studentId &&
          a.paymentStatus === "paid" &&
          a.startsAt.getTime() <= lesson.startsAt.getTime()
      )
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
    if (!sta) continue;
    const ledId = `led_seed_${att.lessonId}_${att.studentId}`;
    await db.insert(t.tariffLessonLedger).values({
      id: ledId,
      organizationId,
      assignmentId: sta.id,
      lessonId: att.lessonId,
      studentId: att.studentId,
      delta: -1,
      reason: att.status === "present" ? "present" : "absent_unexcused",
      attendanceStatus: att.status,
    });
    await db.insert(t.tariffLessonDebitState).values({
      lessonId: att.lessonId,
      studentId: att.studentId,
      assignmentId: sta.id,
      ledgerEntryId: ledId,
    });
  }
}

function answerPayload(a: StudentAnswer): Record<string, unknown> {
  return {
    selectedOptionIds: a.selectedOptionIds,
    textAnswer: a.textAnswer,
    matching: a.matching,
    order: a.order,
  };
}

/**
 * Удаляет только demo-организацию и связанные строки (CASCADE),
 * затем заливает свежий seed. Другие org не затрагивает.
 */
export async function seedDemoOrganization(
  db: DbLike,
  options: SeedOptions = {}
): Promise<void> {
  const raw = createSeedData();
  const demo = options.win1251Safe ? deepWin1251Safe(raw) : raw;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // audit_log.organization_id = SET NULL при удалении org — чистим явно
  await db
    .delete(t.auditLog)
    .where(
      or(
        eq(t.auditLog.organizationId, DEMO_ORG_ID),
        eq(t.auditLog.entityId, DEMO_ORG_ID),
        eq(t.auditLog.id, "audit_seed_demo")
      )
    );

  await db.delete(t.organizations).where(eq(t.organizations.id, DEMO_ORG_ID));

  // Пользователи demo — не cascade от org; удаляем явно
  const demoUserIds = [
    directorUserId(),
    ...demo.teachers.map((x) => userIdForTeacher(x.id)),
    ...demo.students.map((x) => userIdForStudent(x.id)),
  ];
  for (const id of demoUserIds) {
    await db.delete(t.users).where(eq(t.users.id, id));
  }

  await db.insert(t.organizations).values({
    id: DEMO_ORG_ID,
    name: "Демо-школа (seed)",
    slug: DEMO_ORG_SLUG,
  });

  await db.insert(t.users).values({
    id: directorUserId(),
    email: "director@demo.local",
    passwordHash,
    fullName: "Директор Демо",
    status: "active",
  });

  await db.insert(t.memberships).values({
    id: "mem_director_demo",
    organizationId: DEMO_ORG_ID,
    userId: directorUserId(),
    role: "director",
  });

  for (const teacher of demo.teachers) {
    const uid = userIdForTeacher(teacher.id);
    await db.insert(t.users).values({
      id: uid,
      email: teacher.email ?? `${teacher.id}@demo.local`,
      passwordHash,
      fullName: teacher.fullName,
      phone: teacher.phone,
      status: "active",
    });
    await db.insert(t.memberships).values({
      id: `mem_${teacher.id}`,
      organizationId: DEMO_ORG_ID,
      userId: uid,
      role: "teacher",
    });
    await db.insert(t.teachers).values({
      id: teacher.id,
      organizationId: DEMO_ORG_ID,
      userId: uid,
      fullName: teacher.fullName,
      avatarInitials: teacher.avatarInitials,
      bio: teacher.bio ?? null,
      photoKey: null,
      subjects: teacher.subjects,
      specializations: teacher.specializations,
      phone: teacher.phone,
      email: teacher.email,
      startedAt: toDate(teacher.startedAt),
      status: teacher.status,
      lessonPrice: num(teacher.lessonPrice),
      teacherPay: num(teacher.teacherPay),
      defaultDurationMin: teacher.defaultDurationMin,
      workDays: teacher.workDays,
      workIntervals: teacher.workIntervals,
      adminNotes: teacher.adminNotes,
    });
  }

  for (const student of demo.students) {
    const uid = userIdForStudent(student.id);
    await db.insert(t.users).values({
      id: uid,
      email: `${student.id}@demo.local`,
      passwordHash,
      fullName: student.fullName,
      status: "active",
    });
    await db.insert(t.memberships).values({
      id: `mem_${student.id}`,
      organizationId: DEMO_ORG_ID,
      userId: uid,
      role: "student",
    });
    await db.insert(t.students).values({
      id: student.id,
      organizationId: DEMO_ORG_ID,
      userId: uid,
      primaryTeacherId: student.teacherId || null,
      fullName: student.fullName,
      contacts: student.contacts,
      status: student.status,
      notes: student.notes,
    });
  }

  for (const section of demo.topicSections) {
    await db.insert(t.topicSections).values({
      id: section.id,
      organizationId: DEMO_ORG_ID,
      teacherId: section.teacherId,
      title: section.title,
      sortOrder: section.sortOrder,
    });
  }

  for (const topic of demo.topics) {
    await db.insert(t.topics).values({
      id: topic.id,
      organizationId: DEMO_ORG_ID,
      teacherId: topic.teacherId,
      sectionId: topic.sectionId,
      title: topic.title,
      subject: topic.subject,
      description: topic.description,
      programNote: topic.programNote,
      status: topic.status,
      sortOrder: topic.sortOrder,
    });
  }

  for (const hw of demo.homeworks) {
    const questions = (hw.questions ?? []) as TestQuestion[];
    const { publicQuestions, answerKeys } = splitQuestions(questions);
    const topic = demo.topics.find((x) => x.id === hw.topicId);
    await db.insert(t.tests).values({
      id: hw.id,
      organizationId: DEMO_ORG_ID,
      topicId: hw.topicId ?? null,
      sectionId: hw.sectionId ?? topic?.sectionId ?? null,
      teacherId: hw.teacherId,
      title: hw.title,
      description: hw.description,
      status: hw.status,
      maxScore: num(hw.maxScore),
      questionsPublic: publicQuestions,
    });
    for (const [questionId, payload] of Object.entries(answerKeys)) {
      await db.insert(t.testAnswerKeys).values({
        id: `key_${hw.id}_${questionId}`,
        testId: hw.id,
        questionId,
        payload,
      });
    }
  }

  for (const lesson of demo.lessons) {
    await db.insert(t.lessons).values({
      id: lesson.id,
      organizationId: DEMO_ORG_ID,
      teacherId: lesson.teacherId,
      topicId: lesson.topicId ?? null,
      subject: lesson.subject,
      startsAt: new Date(lesson.startsAt),
      endsAt: new Date(lesson.endsAt),
      status: lesson.status,
    });
    for (const studentId of lesson.studentIds) {
      await db.insert(t.lessonStudents).values({
        lessonId: lesson.id,
        studentId,
      });
    }
    if (lesson.topicId || lesson.subject) {
      const catalogTitle = demo.topics.find((x) => x.id === lesson.topicId)
        ?.title;
      await db.insert(t.lessonTopics).values({
        id: `lt_${lesson.id}`,
        organizationId: DEMO_ORG_ID,
        lessonId: lesson.id,
        topicId: lesson.topicId ?? null,
        title: catalogTitle || lesson.subject || "Тема",
        sortOrder: 0,
      });
    }
  }

  for (const row of demo.attendances) {
    await db.insert(t.attendances).values({
      lessonId: row.lessonId,
      studentId: row.studentId,
      status: row.status,
    });
  }

  for (const a of demo.homeworkAssignments) {
    const snapQuestions = (a.testSnapshot?.questions ?? []) as TestQuestion[];
    const { publicQuestions, answerKeys } = splitQuestions(snapQuestions);

    await db.insert(t.testAssignments).values({
      id: a.id,
      organizationId: DEMO_ORG_ID,
      testId: a.homeworkId,
      topicId: a.topicId,
      teacherId: a.teacherId,
      studentId: a.studentId,
      lessonId: a.lessonId ?? null,
      dueAt: toDate(a.dueAt),
      status: a.status,
      score: num(a.score),
      maxScore: num(a.maxScore ?? a.testSnapshot?.maxScore),
      feedback: a.feedback,
      answerText: a.answerText,
      completedAt: toDate(a.completedAt),
      reviewedAt: toDate(a.reviewedAt),
    });

    await db.insert(t.assignmentSnapshots).values({
      assignmentId: a.id,
      title: a.testSnapshot?.title ?? "Задание",
      description: a.testSnapshot?.description,
      questions: publicQuestions,
      maxScore: num(a.testSnapshot?.maxScore ?? a.maxScore ?? 0)!,
      answerKeys,
    });

    const answers = a.answers ?? [];
    for (const ans of answers) {
      await db.insert(t.assignmentAnswers).values({
        id: `ans_${a.id}_${ans.questionId}`,
        assignmentId: a.id,
        questionId: ans.questionId,
        payload: answerPayload(ans),
        autoScore: num(ans.autoScore),
        manualScore: num(ans.manualScore),
        needsManualReview: Boolean(ans.needsManualReview),
        isCorrect: ans.isCorrect ?? null,
        teacherComment: ans.teacherComment,
      });
    }

    if (
      answers.length > 0 ||
      a.status === "in_progress" ||
      a.status === "completed" ||
      a.status === "reviewed" ||
      a.status === "overdue"
    ) {
      const submitted = a.status === "completed" || a.status === "reviewed";
      await db.insert(t.testAttempts).values({
        id: `att1_${a.id}`,
        assignmentId: a.id,
        attemptNumber: 1,
        status: submitted ? "submitted" : "in_progress",
        score: num(a.score),
        maxScore: num(a.maxScore),
        submittedAt: submitted ? toDate(a.completedAt) : null,
      });
      for (const ans of answers) {
        await db.insert(t.attemptAnswers).values({
          id: `aa_${a.id}_${ans.questionId}`,
          attemptId: `att1_${a.id}`,
          questionId: ans.questionId,
          payload: answerPayload(ans),
          autoScore: num(ans.autoScore),
          manualScore: num(ans.manualScore),
          needsManualReview: Boolean(ans.needsManualReview),
          isCorrect: ans.isCorrect ?? null,
          teacherComment: ans.teacherComment,
        });
      }
    }

    await db.insert(t.gradeEvents).values({
      id: `ge_assigned_${a.id}`,
      organizationId: DEMO_ORG_ID,
      assignmentId: a.id,
      eventType: "assigned",
      actorUserId: userIdForTeacher(a.teacherId),
      payload: { source: "seed" },
    });
    if (a.status === "completed" || a.status === "reviewed") {
      await db.insert(t.gradeEvents).values({
        id: `ge_submitted_${a.id}`,
        organizationId: DEMO_ORG_ID,
        assignmentId: a.id,
        eventType: "submitted",
        actorUserId: userIdForStudent(a.studentId),
        payload: { source: "seed" },
      });
    }
    if (a.status === "reviewed") {
      await db.insert(t.gradeEvents).values({
        id: `ge_reviewed_${a.id}`,
        organizationId: DEMO_ORG_ID,
        assignmentId: a.id,
        eventType: "reviewed",
        actorUserId: userIdForTeacher(a.teacherId),
        payload: { source: "seed", score: a.score },
      });
    }
  }

  for (const tariff of demo.tariffs) {
    await db.insert(t.tariffs).values({
      id: tariff.id,
      organizationId: DEMO_ORG_ID,
      name: tariff.name,
      price: num(tariff.price)!,
      currency: "RUB",
      durationDays: tariff.durationDays,
      lessonsLimit: tariff.lessonsLimit ?? null,
      weeklyFrequency: tariff.weeklyFrequency ?? 1,
      includesText: tariff.includesText ?? null,
      features: tariff.features,
      status: tariff.status,
      adminNotes: tariff.adminNotes ?? null,
    });
  }

  for (const a of demo.tariffAssignments) {
    await db.insert(t.studentTariffAssignments).values({
      id: a.id,
      organizationId: DEMO_ORG_ID,
      studentId: a.studentId,
      tariffId: a.tariffId,
      startsAt: new Date(a.startsAt),
      endsAt: new Date(a.endsAt),
      priceSnapshot: num(a.priceSnapshot)!,
      currency: "RUB",
      status: a.status,
      paymentStatus: a.paymentStatus,
      lessonsLimitSnapshot: a.lessonsLimitSnapshot ?? null,
      weeklyFrequencySnapshot: a.weeklyFrequencySnapshot ?? null,
      durationDaysSnapshot: a.durationDaysSnapshot ?? null,
      tariffNameSnapshot: a.tariffName ?? null,
    });
  }

  for (const p of demo.payments) {
    await db.insert(t.payments).values({
      id: p.id,
      organizationId: DEMO_ORG_ID,
      studentId: p.studentId,
      assignmentId: p.assignmentId,
      amount: num(p.amount)!,
      currency: "RUB",
      status: p.status,
      provider: p.provider,
      externalId: p.externalId ?? null,
      idempotencyKey: `seed:${p.id}`,
      paidAt: p.paidAt ? new Date(p.paidAt) : null,
      createdAt: new Date(p.createdAt),
    });
  }

  await backfillLedgerFromAttendances(db, DEMO_ORG_ID);

  await db.insert(t.auditLog).values({
    id: "audit_seed_demo",
    organizationId: DEMO_ORG_ID,
    actorUserId: directorUserId(),
    action: "seed.demo_organization",
    entityType: "organization",
    entityId: DEMO_ORG_ID,
    payload: {
      teachers: demo.teachers.length,
      students: demo.students.length,
      tests: demo.homeworks.length,
      assignments: demo.homeworkAssignments.length,
      tariffs: demo.tariffs.length,
    },
  });
}
