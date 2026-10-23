import {
  addAppDateKey,
  appDateKey,
  parseAppInstant,
  startOfAppDay,
} from "@/lib/app-time";
import { listOccurrencesInRange } from "@/lib/recurring-schedule";
import { attemptPercent, retryQuestionIds } from "@/lib/tests/attempts";
import { gradeSubmission } from "@/lib/tests/grading";
import type {
  HomeworkAssignmentStatus,
  StudentAnswer,
  TestQuestion,
} from "@/lib/types";
import { splitQuestions } from "@/server/db/question-split";
import * as t from "@/server/db/schema";
import { deepWin1251Safe } from "@/server/db/unicode-safe";
import {
  maxScoreOf,
  PHYSICS_SECTION_DEFS,
  schoolPhysicsTests,
  sectionIdFor,
  topicIdFor,
  type SchoolPhysicsTestDef,
} from "@/server/db/school-physics-catalog";

export const SCHOOL_HISTORY_PAST_DAYS = 70;
export const SCHOOL_HISTORY_FUTURE_DAYS = 28;

type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => any;
};

export type SchoolScheduleLike = {
  id: string;
  teacherId: string;
  studentIds: string[];
  weekdays: number[];
  startTime: string;
  durationMin: number;
  subject?: string;
};

export type SchoolHistoryStats = {
  sections: number;
  topics: number;
  tests: number;
  questions: number;
  pastLessons: number;
  futureLessons: number;
  homeworkAssignments: number;
};

function num(n?: number | null) {
  return n == null ? null : String(n);
}

function answerPayload(a: StudentAnswer): Record<string, unknown> {
  return {
    selectedOptionIds: a.selectedOptionIds ?? [],
    textAnswer: a.textAnswer ?? "",
    matching: a.matching ?? {},
    order: a.order ?? [],
  };
}

function teacherTopicList(teacherId: string) {
  return PHYSICS_SECTION_DEFS.flatMap((sec) =>
    sec.topics.map((tp) => ({
      id: topicIdFor(teacherId, sec.slug, tp.slug),
      title: tp.title,
    }))
  );
}

function correctAnswer(q: TestQuestion): StudentAnswer {
  if (q.type === "single_choice" || q.type === "multiple_choice") {
    return { questionId: q.id, selectedOptionIds: [...(q.correctOptionIds ?? [])] };
  }
  if (q.type === "short_answer" || q.type === "numeric") {
    return { questionId: q.id, textAnswer: q.correctAnswers?.[0] ?? "" };
  }
  return {
    questionId: q.id,
    textAnswer:
      "Ученик разобрал условие, записал исходные формулы и получил численный ответ с единицами измерения.",
  };
}

function wrongAnswer(q: TestQuestion): StudentAnswer {
  if (q.type === "single_choice" || q.type === "multiple_choice") {
    const wrong =
      q.options?.filter((o) => !q.correctOptionIds?.includes(o.id)) ?? [];
    return {
      questionId: q.id,
      selectedOptionIds: wrong.slice(0, 1).map((o) => o.id),
    };
  }
  if (q.type === "numeric") return { questionId: q.id, textAnswer: "0" };
  if (q.type === "short_answer") return { questionId: q.id, textAnswer: "неверно" };
  return { questionId: q.id, textAnswer: "Кратко и без формул." };
}

function gradeWithEssay(
  questions: TestQuestion[],
  raw: StudentAnswer[],
  essayScore: number | null
): StudentAnswer[] {
  const graded = gradeSubmission(questions, raw).answers;
  return graded.map((a) => {
    const q = questions.find((x) => x.id === a.questionId);
    if (q?.type !== "essay") return a;
    if (essayScore == null) {
      return {
        ...a,
        needsManualReview: true,
        manualScore: undefined,
        isCorrect: null,
      };
    }
    const capped = Math.max(0, Math.min(essayScore, q.maxScore || essayScore));
    return {
      ...a,
      manualScore: capped,
      needsManualReview: false,
      isCorrect: capped >= (q.maxScore || 0) * 0.999,
    };
  });
}

function mixAnswers(
  questions: TestQuestion[],
  pattern: Array<"ok" | "bad" | "skip">,
  essayScore: number | null
): StudentAnswer[] {
  const raw: StudentAnswer[] = [];
  questions.forEach((q, i) => {
    const p = pattern[i % pattern.length] ?? "ok";
    if (p === "skip") return;
    raw.push(p === "ok" ? correctAnswer(q) : wrongAnswer(q));
  });
  return gradeWithEssay(questions, raw, essayScore);
}

type AttemptSpec = {
  answers: StudentAnswer[];
  submitted: boolean;
  at?: Date;
};

async function insertHomework(
  db: DbLike,
  orgId: string,
  input: {
    id: string;
    test: SchoolPhysicsTestDef;
    studentId: string;
    lessonId: string;
    topicId: string;
    status: HomeworkAssignmentStatus;
    createdAt: Date;
    attempt1?: AttemptSpec;
    attempt2?: AttemptSpec;
    completedAt?: Date;
    reviewedAt?: Date;
    feedback?: string;
  }
) {
  const questions = input.test.questions;
  const { publicQuestions, answerKeys } = splitQuestions(questions);
  const maxScore = maxScoreOf(questions);
  const a1 = input.attempt1?.answers ?? [];
  const a2 = input.attempt2?.answers ?? [];
  const retry = retryQuestionIds(questions, a1);
  const a1Pct = input.attempt1?.submitted
    ? attemptPercent(questions, a1)
    : a1.length
      ? attemptPercent(questions, a1)
      : null;
  const a2Pct = input.attempt2
    ? attemptPercent(questions, a2, retry)
    : null;

  let score: number | null = null;
  if (input.status === "reviewed" || input.status === "completed") {
    const latest = a2.length ? a2 : a1;
    score = latest.reduce((s, a) => {
      const q = questions.find((x) => x.id === a.questionId);
      if (q?.type === "essay") return s + (a.manualScore ?? 0);
      return s + (a.autoScore ?? 0);
    }, 0);
    if (input.status === "completed" && latest.some((a) => a.needsManualReview)) {
      score = null;
    }
  }

  await db.insert(t.testAssignments).values({
    id: input.id,
    organizationId: orgId,
    testId: input.test.id,
    topicId: input.topicId,
    teacherId: input.test.teacherId,
    studentId: input.studentId,
    lessonId: input.lessonId,
    status: input.status,
    attempt1Percent: num(a1Pct),
    attempt2Percent: num(a2Pct),
    score: num(score),
    maxScore: num(maxScore),
    feedback: input.feedback ?? null,
    completedAt: input.completedAt ?? null,
    reviewedAt: input.reviewedAt ?? null,
    createdAt: input.createdAt,
    updatedAt: input.completedAt ?? input.createdAt,
  });

  await db.insert(t.assignmentSnapshots).values({
    assignmentId: input.id,
    title: input.test.title,
    description: input.test.description,
    questions: publicQuestions,
    maxScore: String(maxScore),
    answerKeys,
    createdAt: input.createdAt,
  });

  const latest = a2.length ? a2 : a1;
  for (const ans of latest) {
    await db.insert(t.assignmentAnswers).values({
      id: `sch_ans_${input.id}_${ans.questionId}`,
      assignmentId: input.id,
      questionId: ans.questionId,
      payload: answerPayload(ans),
      autoScore: num(ans.autoScore),
      manualScore: num(ans.manualScore),
      needsManualReview: Boolean(ans.needsManualReview),
      isCorrect: ans.isCorrect ?? null,
    });
  }

  if (input.attempt1) {
    const attId = `sch_att1_${input.id}`;
    await db.insert(t.testAttempts).values({
      id: attId,
      assignmentId: input.id,
      attemptNumber: 1,
      status: input.attempt1.submitted ? "submitted" : "in_progress",
      score: num(
        input.attempt1.answers.reduce((s, a) => s + (a.autoScore ?? 0) + (a.manualScore ?? 0), 0)
      ),
      maxScore: num(maxScore),
      submittedAt: input.attempt1.submitted ? input.attempt1.at ?? input.createdAt : null,
      createdAt: input.createdAt,
    });
    for (const ans of input.attempt1.answers) {
      await db.insert(t.attemptAnswers).values({
        id: `sch_aa1_${input.id}_${ans.questionId}`,
        attemptId: attId,
        questionId: ans.questionId,
        payload: answerPayload(ans),
        autoScore: num(ans.autoScore),
        manualScore: num(ans.manualScore),
        needsManualReview: Boolean(ans.needsManualReview),
        isCorrect: ans.isCorrect ?? null,
      });
    }
  }

  if (input.attempt2) {
    const attId = `sch_att2_${input.id}`;
    await db.insert(t.testAttempts).values({
      id: attId,
      assignmentId: input.id,
      attemptNumber: 2,
      status: input.attempt2.submitted ? "submitted" : "in_progress",
      score: num(
        input.attempt2.answers.reduce((s, a) => s + (a.autoScore ?? 0) + (a.manualScore ?? 0), 0)
      ),
      maxScore: num(maxScore),
      submittedAt: input.attempt2.submitted ? input.attempt2.at ?? input.createdAt : null,
      createdAt: input.attempt2.at ?? input.createdAt,
    });
    for (const ans of input.attempt2.answers) {
      await db.insert(t.attemptAnswers).values({
        id: `sch_aa2_${input.id}_${ans.questionId}`,
        attemptId: attId,
        questionId: ans.questionId,
        payload: answerPayload(ans),
        autoScore: num(ans.autoScore),
        manualScore: num(ans.manualScore),
        needsManualReview: Boolean(ans.needsManualReview),
        isCorrect: ans.isCorrect ?? null,
      });
    }
  }

  await db.insert(t.gradeEvents).values({
    id: `sch_ge_as_${input.id}`,
    organizationId: orgId,
    assignmentId: input.id,
    eventType: "assigned",
    payload: { source: "school-seed" },
    createdAt: input.createdAt,
  });
}

type BuiltLesson = {
  id: string;
  studentId: string;
  teacherId: string;
  startsAt: Date;
  status: "planned" | "done" | "cancelled";
  topicId: string | null;
  attendance?: "present" | "absent_excused" | "absent_unexcused" | "cancelled";
};

function studentLessons(built: BuiltLesson[], studentId: string) {
  return built
    .filter((l) => l.studentId === studentId)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function pastDone(built: BuiltLesson[], studentId: string, now: Date) {
  return studentLessons(built, studentId).filter(
    (l) =>
      l.status === "done" &&
      l.attendance === "present" &&
      l.startsAt.getTime() < now.getTime()
  );
}

function nextNonCancelled(built: BuiltLesson[], studentId: string, after: Date) {
  return studentLessons(built, studentId).find(
    (l) => l.status !== "cancelled" && l.startsAt.getTime() > after.getTime()
  );
}

function lastWithFutureNext(built: BuiltLesson[], studentId: string, now: Date) {
  const past = studentLessons(built, studentId).filter(
    (l) =>
      l.status !== "cancelled" && l.startsAt.getTime() < now.getTime()
  );
  for (let i = past.length - 1; i >= 0; i--) {
    const next = nextNonCancelled(built, studentId, past[i]!.startsAt);
    if (!next || next.startsAt.getTime() > now.getTime()) return past[i];
  }
  return past[past.length - 1] ?? pastDone(built, studentId, now).at(-1);
}

function earlyWithPastNext(built: BuiltLesson[], studentId: string, now: Date) {
  const done = pastDone(built, studentId, now);
  for (const lesson of done) {
    const next = nextNonCancelled(built, studentId, lesson.startsAt);
    if (
      next &&
      next.startsAt.getTime() <= now.getTime() &&
      next.status !== "cancelled"
    ) {
      return lesson;
    }
  }
  return done[0];
}

export async function seedSchoolCatalogAndHistory(
  db: DbLike,
  orgId: string,
  now: Date,
  schedules: SchoolScheduleLike[],
  options: { win1251Safe?: boolean } = {}
): Promise<SchoolHistoryStats> {
  const sectionDefs = deepWin1251Safe(PHYSICS_SECTION_DEFS);
  const teacherIds = ["sch_t1", "sch_t2", "sch_t3"];
  let sections = 0;
  let topics = 0;

  for (const teacherId of teacherIds) {
    for (let i = 0; i < sectionDefs.length; i++) {
      const sec = sectionDefs[i]!;
      await db.insert(t.topicSections).values({
        id: sectionIdFor(teacherId, sec.slug),
        organizationId: orgId,
        teacherId,
        title: sec.title,
        sortOrder: i,
      });
      sections += 1;
      for (let j = 0; j < sec.topics.length; j++) {
        const tp = sec.topics[j]!;
        await db.insert(t.topics).values({
          id: topicIdFor(teacherId, sec.slug, tp.slug),
          organizationId: orgId,
          teacherId,
          sectionId: sectionIdFor(teacherId, sec.slug),
          title: tp.title,
          subject: "Физика",
          description: tp.description,
          status: "active",
          sortOrder: j,
        });
        topics += 1;
      }
    }
  }

  const tests = deepWin1251Safe(schoolPhysicsTests());
  let questions = 0;
  for (const test of tests) {
    const { publicQuestions, answerKeys } = splitQuestions(test.questions);
    questions += test.questions.length;
    await db.insert(t.tests).values({
      id: test.id,
      organizationId: orgId,
      topicId: topicIdFor(test.teacherId, test.sectionSlug, test.topicSlug),
      sectionId: sectionIdFor(test.teacherId, test.sectionSlug),
      teacherId: test.teacherId,
      title: test.title,
      description: test.description,
      status: "published",
      maxScore: String(maxScoreOf(test.questions)),
      questionsPublic: publicQuestions,
    });
    for (const [questionId, payload] of Object.entries(answerKeys)) {
      await db.insert(t.testAnswerKeys).values({
        id: `sch_key_${test.id}_${questionId}`,
        testId: test.id,
        questionId,
        payload,
      });
    }
  }

  const from = startOfAppDay(
    new Date(now.getTime() - SCHOOL_HISTORY_PAST_DAYS * 86_400_000)
  );
  const to = parseAppInstant(
    addAppDateKey(appDateKey(now), SCHOOL_HISTORY_FUTURE_DAYS),
    true
  );

  const built: BuiltLesson[] = [];
  const lessonRows: Array<typeof t.lessons.$inferInsert> = [];
  const studentRows: Array<{ lessonId: string; studentId: string }> = [];
  const attRows: Array<{
    lessonId: string;
    studentId: string;
    status: string;
  }> = [];
  const exceptions: Array<{
    scheduleId: string;
    occurrenceKey: string;
    reason: "cancelled" | "moved";
    lessonId: string;
  }> = [];

  for (const sch of schedules) {
    const studentId = sch.studentIds[0];
    if (!studentId) continue;
    const topicCycle = teacherTopicList(sch.teacherId);
    const occ = listOccurrencesInRange(
      {
        weekdays: sch.weekdays,
        startTime: sch.startTime,
        durationMin: sch.durationMin,
        activeFrom: from,
      },
      from,
      to
    );

    occ.forEach((o, idx) => {
      const lessonId = `sch_l_${sch.id}_${o.occurrenceKey}`;
      const isFuture = o.startsAt.getTime() > now.getTime();
      const topic = topicCycle[idx % topicCycle.length]!;
      let status: BuiltLesson["status"] = "planned";
      let attendance: BuiltLesson["attendance"] | undefined;
      let topicId: string | null = null;
      let subject: string | null = "Физика";

      if (isFuture) {
        status = "planned";
      } else {
        const kind = idx % 8;
        if (kind === 0) {
          status = "cancelled";
          attendance = "cancelled";
          exceptions.push({
            scheduleId: sch.id,
            occurrenceKey: o.occurrenceKey,
            reason: "cancelled",
            lessonId,
          });
        } else if (kind === 3) {
          status = "done";
          attendance = "absent_excused";
          topicId = topic.id;
          subject = topic.title;
        } else if (kind === 5) {
          status = "done";
          attendance = "absent_unexcused";
          topicId = topic.id;
          subject = topic.title;
        } else if (kind === 6) {
          status = "planned";
        } else {
          status = "done";
          attendance = "present";
          topicId = topic.id;
          subject = topic.title;
        }
      }

      lessonRows.push({
        id: lessonId,
        organizationId: orgId,
        teacherId: sch.teacherId,
        topicId,
        scheduleId: sch.id,
        scheduleOccurrenceKey: o.occurrenceKey,
        subject,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        status,
      });
      studentRows.push({ lessonId, studentId });
      if (attendance) {
        attRows.push({ lessonId, studentId, status: attendance });
      }
      built.push({
        id: lessonId,
        studentId,
        teacherId: sch.teacherId,
        startsAt: o.startsAt,
        status,
        topicId,
        attendance,
      });
    });
  }

  // Перенос одного слота s01: исходное вхождение отменяем, разовое через +2 дня.
  const s01Past = pastDone(built, "sch_s01", now);
  const moveSource = s01Past[Math.max(0, s01Past.length - 4)];
  if (moveSource) {
    const src = lessonRows.find((l) => l.id === moveSource.id);
    if (src && src.scheduleId && src.scheduleOccurrenceKey) {
      src.status = "cancelled";
      src.topicId = null;
      moveSource.status = "cancelled";
      moveSource.attendance = "cancelled";
      const attIdx = attRows.findIndex((a) => a.lessonId === src.id);
      if (attIdx >= 0) attRows.splice(attIdx, 1);
      attRows.push({
        lessonId: src.id,
        studentId: "sch_s01",
        status: "cancelled",
      });
      exceptions.push({
        scheduleId: src.scheduleId,
        occurrenceKey: src.scheduleOccurrenceKey,
        reason: "moved",
        lessonId: src.id,
      });
      const movedStart = new Date(src.startsAt);
      movedStart.setDate(movedStart.getDate() + 2);
      const movedEnd = new Date(movedStart.getTime() + 60 * 60_000);
      const movedId = "sch_l_moved_s01";
      const topicId = moveSource.topicId;
      lessonRows.push({
        id: movedId,
        organizationId: orgId,
        teacherId: "sch_t1",
        topicId,
        subject: "Кинематика: перенесённое занятие",
        startsAt: movedStart,
        endsAt: movedEnd,
        status: movedStart.getTime() <= now.getTime() ? "done" : "planned",
      });
      studentRows.push({ lessonId: movedId, studentId: "sch_s01" });
      if (movedStart.getTime() <= now.getTime()) {
        attRows.push({
          lessonId: movedId,
          studentId: "sch_s01",
          status: "present",
        });
      }
      built.push({
        id: movedId,
        studentId: "sch_s01",
        teacherId: "sch_t1",
        startsAt: movedStart,
        status: movedStart.getTime() <= now.getTime() ? "done" : "planned",
        topicId,
        attendance:
          movedStart.getTime() <= now.getTime() ? "present" : undefined,
      });
    }
  }

  for (let i = 0; i < lessonRows.length; i += 80) {
    await db.insert(t.lessons).values(lessonRows.slice(i, i + 80));
  }
  const topicRows = lessonRows
    .filter((row) => row.topicId || row.subject)
    .map((row) => ({
      id: `lt_${row.id}`,
      organizationId: orgId,
      lessonId: row.id,
      topicId: row.topicId ?? null,
      title: row.subject || "Тема",
      sortOrder: 0,
    }));
  for (let i = 0; i < topicRows.length; i += 80) {
    await db.insert(t.lessonTopics).values(topicRows.slice(i, i + 80));
  }
  for (let i = 0; i < studentRows.length; i += 80) {
    await db.insert(t.lessonStudents).values(studentRows.slice(i, i + 80));
  }
  for (let i = 0; i < attRows.length; i += 80) {
    await db.insert(t.attendances).values(attRows.slice(i, i + 80));
  }
  for (const ex of exceptions) {
    await db.insert(t.lessonScheduleExceptions).values(ex);
  }

  const testById = new Map(tests.map((x) => [x.id, x]));
  const hwCount = await insertSchoolHomework(db, orgId, now, built, testById);

  const pastLessons = built.filter((l) => l.startsAt.getTime() < now.getTime()).length;
  const futureLessons = built.filter((l) => l.startsAt.getTime() >= now.getTime()).length;

  return {
    sections,
    topics,
    tests: tests.length,
    questions,
    pastLessons,
    futureLessons,
    homeworkAssignments: hwCount,
  };
}

async function insertSchoolHomework(
  db: DbLike,
  orgId: string,
  now: Date,
  built: BuiltLesson[],
  testById: Map<string, SchoolPhysicsTestDef>
): Promise<number> {
  const t01 = testById.get("sch_test_01")!;
  const t02 = testById.get("sch_test_02")!;
  const t03 = testById.get("sch_test_03")!;
  const t04 = testById.get("sch_test_04")!;
  const t05 = testById.get("sch_test_05")!;
  const t06 = testById.get("sch_test_06")!;
  const t07 = testById.get("sch_test_07")!;
  const t08 = testById.get("sch_test_08")!;
  const t09 = testById.get("sch_test_09")!;
  const t10 = testById.get("sch_test_10")!;
  const t11 = testById.get("sch_test_11")!;
  const t13 = testById.get("sch_test_13")!;
  const t14 = testById.get("sch_test_14")!;
  const t15 = testById.get("sch_test_15")!;

  type Spec = {
    id: string;
    studentId: string;
    test: SchoolPhysicsTestDef;
    pick: () => BuiltLesson | undefined;
    status: HomeworkAssignmentStatus;
    build: (lesson: BuiltLesson, questions: TestQuestion[]) => {
      attempt1?: AttemptSpec;
      attempt2?: AttemptSpec;
      completedAt?: Date;
      reviewedAt?: Date;
      feedback?: string;
    };
  };

  const specs: Spec[] = [
    {
      id: "sch_ha_new",
      studentId: "sch_s01",
      test: t01,
      pick: () => lastWithFutureNext(built, "sch_s01", now),
      status: "assigned",
      build: () => ({}),
    },
    {
      id: "sch_ha_missed",
      studentId: "sch_s01",
      test: t03,
      pick: () => earlyWithPastNext(built, "sch_s01", now),
      status: "in_progress",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "skip", "bad", "skip", "skip"], null),
          submitted: false,
          at: new Date(lesson.startsAt.getTime() + 36 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_late_done",
      studentId: "sch_s01",
      test: t04,
      pick: () => earlyWithPastNext(built, "sch_s01", now),
      status: "reviewed",
      build: (lesson, qs) => {
        const a1 = mixAnswers(qs, ["ok", "ok", "ok", "ok", "ok"], 3);
        const done = new Date(lesson.startsAt.getTime() + 10 * 86400_000);
        return {
          attempt1: { answers: a1, submitted: true, at: done },
          completedAt: done,
          reviewedAt: done,
          feedback: "Отличная работа, даже с опозданием.",
        };
      },
    },
    {
      id: "sch_ha_started",
      studentId: "sch_s04",
      test: t02,
      pick: () => lastWithFutureNext(built, "sch_s04", now),
      status: "in_progress",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "skip", "ok", "skip", "skip"], null),
          submitted: false,
          at: new Date(lesson.startsAt.getTime() + 20 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_before_next",
      studentId: "sch_s04",
      test: t04,
      pick: () => lastWithFutureNext(built, "sch_s04", now),
      status: "reviewed",
      build: (lesson, qs) => {
        const done = new Date(lesson.startsAt.getTime() + 26 * 3600_000);
        return {
          attempt1: {
            answers: mixAnswers(qs, ["ok", "ok", "ok", "ok", "ok"], 3),
            submitted: true,
            at: done,
          },
          completedAt: done,
          reviewedAt: done,
          feedback: "Сдано до следующего занятия.",
        };
      },
    },
    {
      id: "sch_ha_remaining",
      studentId: "sch_s03",
      test: t05,
      pick: () => earlyWithPastNext(built, "sch_s03", now),
      status: "remaining_questions",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "bad", "skip", "skip", "skip"], null),
          submitted: true,
          at: new Date(lesson.startsAt.getTime() + 40 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_retry",
      studentId: "sch_s05",
      test: t06,
      pick: () => lastWithFutureNext(built, "sch_s05", now),
      status: "attempt1_submitted",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "bad", "ok", "bad", "ok"], null),
          submitted: true,
          at: new Date(lesson.startsAt.getTime() + 30 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_high",
      studentId: "sch_s06",
      test: t07,
      pick: () => pastDone(built, "sch_s06", now)[2] ?? pastDone(built, "sch_s06", now)[0],
      status: "reviewed",
      build: (lesson, qs) => {
        const done = new Date(lesson.startsAt.getTime() + 48 * 3600_000);
        return {
          attempt1: {
            answers: mixAnswers(qs, ["ok", "ok", "ok", "ok", "ok"], 3),
            submitted: true,
            at: done,
          },
          completedAt: done,
          reviewedAt: done,
          feedback: "Высокий результат, теория усвоена.",
        };
      },
    },
    {
      id: "sch_ha_mid",
      studentId: "sch_s07",
      test: t01,
      pick: () => pastDone(built, "sch_s07", now)[3] ?? pastDone(built, "sch_s07", now)[0],
      status: "reviewed",
      build: (lesson, qs) => {
        const a1 = mixAnswers(qs, ["ok", "bad", "ok", "bad", "ok"], 2);
        const a2 = mixAnswers(qs, ["ok", "ok", "ok", "bad", "ok"], 2);
        const done = new Date(lesson.startsAt.getTime() + 5 * 86400_000);
        return {
          attempt1: {
            answers: a1,
            submitted: true,
            at: new Date(lesson.startsAt.getTime() + 2 * 86400_000),
          },
          attempt2: { answers: a2, submitted: true, at: done },
          completedAt: done,
          reviewedAt: done,
          feedback: "Средний результат: часть ошибок исправлена.",
        };
      },
    },
    {
      id: "sch_ha_low",
      studentId: "sch_s08",
      test: t03,
      pick: () => pastDone(built, "sch_s08", now)[2] ?? pastDone(built, "sch_s08", now)[0],
      status: "reviewed",
      build: (lesson, qs) => {
        const a1 = mixAnswers(qs, ["bad", "bad", "ok", "bad", "bad"], 0);
        const a2 = mixAnswers(qs, ["bad", "ok", "ok", "bad", "bad"], 1);
        const done = new Date(lesson.startsAt.getTime() + 6 * 86400_000);
        return {
          attempt1: {
            answers: a1,
            submitted: true,
            at: new Date(lesson.startsAt.getTime() + 2 * 86400_000),
          },
          attempt2: { answers: a2, submitted: true, at: done },
          completedAt: done,
          reviewedAt: done,
          feedback: "Низкий результат, нужно повторить силы и законы Ньютона.",
        };
      },
    },
    {
      id: "sch_ha_essay",
      studentId: "sch_s10",
      test: t09,
      pick: () => lastWithFutureNext(built, "sch_s10", now),
      status: "completed",
      build: (lesson, qs) => {
        const a1 = mixAnswers(qs, ["ok", "ok", "ok", "ok", "ok"], null);
        const done = new Date(lesson.startsAt.getTime() + 3 * 86400_000);
        return {
          attempt1: { answers: a1, submitted: true, at: done },
          completedAt: done,
        };
      },
    },
    {
      id: "sch_ha_a2",
      studentId: "sch_s09",
      test: t08,
      pick: () => lastWithFutureNext(built, "sch_s09", now),
      status: "attempt2_in_progress",
      build: (lesson, qs) => {
        const a1 = mixAnswers(qs, ["ok", "bad", "ok", "bad", "ok"], null);
        const retry = retryQuestionIds(qs, a1);
        const a2raw = qs
          .filter((q) => retry.includes(q.id))
          .map((q) => correctAnswer(q));
        const a2 = gradeWithEssay(qs, a2raw, null).filter((a) =>
          retry.includes(a.questionId)
        );
        return {
          attempt1: {
            answers: a1,
            submitted: true,
            at: new Date(lesson.startsAt.getTime() + 2 * 86400_000),
          },
          attempt2: {
            answers: a2,
            submitted: false,
            at: new Date(lesson.startsAt.getTime() + 4 * 86400_000),
          },
        };
      },
    },
    {
      id: "sch_ha_new_s16",
      studentId: "sch_s16",
      test: t13,
      pick: () => lastWithFutureNext(built, "sch_s16", now),
      status: "assigned",
      build: () => ({}),
    },
    {
      id: "sch_ha_missed_s11",
      studentId: "sch_s11",
      test: t10,
      pick: () => earlyWithPastNext(built, "sch_s11", now),
      status: "in_progress",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "skip"], null),
          submitted: false,
          at: new Date(lesson.startsAt.getTime() + 24 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_s15",
      studentId: "sch_s15",
      test: t14,
      pick: () => lastWithFutureNext(built, "sch_s15", now),
      status: "assigned",
      build: () => ({}),
    },
    {
      id: "sch_ha_remaining_missed",
      studentId: "sch_s12",
      test: t11,
      pick: () => earlyWithPastNext(built, "sch_s12", now),
      status: "remaining_questions",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["bad", "skip", "ok", "skip", "skip"], null),
          submitted: true,
          at: new Date(lesson.startsAt.getTime() + 28 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_s13_retry",
      studentId: "sch_s13",
      test: t11,
      pick: () => lastWithFutureNext(built, "sch_s13", now),
      status: "attempt1_submitted",
      build: (lesson, qs) => ({
        attempt1: {
          answers: mixAnswers(qs, ["ok", "bad", "ok", "bad", "ok"], null),
          submitted: true,
          at: new Date(lesson.startsAt.getTime() + 32 * 3600_000),
        },
      }),
    },
    {
      id: "sch_ha_s17",
      studentId: "sch_s17",
      test: t15,
      pick: () => pastDone(built, "sch_s17", now)[2] ?? pastDone(built, "sch_s17", now)[0],
      status: "reviewed",
      build: (lesson, qs) => {
        const done = new Date(lesson.startsAt.getTime() + 4 * 86400_000);
        return {
          attempt1: {
            answers: mixAnswers(qs, ["ok", "ok", "bad", "ok", "ok"], 2),
            submitted: true,
            at: done,
          },
          completedAt: done,
          reviewedAt: done,
          feedback: "Хорошая база по фотоэффекту, повторите ядерную часть.",
        };
      },
    },
  ];

  let count = 0;
  for (const spec of specs) {
    const lesson = spec.pick();
    if (!lesson) continue;
    const createdAt = new Date(lesson.startsAt.getTime() + 70 * 60_000);
    const extra = spec.build(lesson, spec.test.questions);
    await insertHomework(db, orgId, {
      id: spec.id,
      test: spec.test,
      studentId: spec.studentId,
      lessonId: lesson.id,
      topicId:
        lesson.topicId ??
        topicIdFor(spec.test.teacherId, spec.test.sectionSlug, spec.test.topicSlug),
      status: spec.status,
      createdAt,
      ...extra,
    });
    count += 1;
  }

  return count;
}
