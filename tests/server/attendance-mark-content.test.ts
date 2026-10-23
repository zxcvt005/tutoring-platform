import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { LESSON_MARK_CONTENT_ERROR } from "@/lib/lesson-mark-requirements";
import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonTopics,
  lessons,
  tariffLessonLedger,
  testAssignments,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  assignHomework,
  completeLesson,
  publishHomework,
  setAttendance,
  setLessonTopics,
  upsertLesson,
} from "@/server/services/platform-mutations";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("attendance requires topic, homework is optional", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  async function pastLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    studentId: string
  ) {
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    const created = await upsertLesson(db, teacher, {
      teacherId: "t1",
      studentIds: [studentId],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Механика",
    });
    const pastStart = new Date(Date.now() - 2 * 86_400_000);
    const pastEnd = new Date(pastStart.getTime() + 45 * 60_000);
    await db
      .update(lessons)
      .set({ startsAt: pastStart, endsAt: pastEnd })
      .where(eq(lessons.id, created.id));
    return created.id;
  }

  async function pay(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    director: Awaited<ReturnType<typeof asRole>>,
    studentId: string
  ) {
    const tariff = await upsertTariff(db, director, {
      name: "Пакет",
      price: 1000,
      durationDays: 28,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(db, director, {
      studentId,
      tariffId: tariff.id,
    });
    await adminMarkPaymentPaid(db, director, {
      paymentId: assigned.paymentId,
      reason: "Тест",
    });
  }

  async function netDebit(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    lessonId: string
  ) {
    const ledger = await db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
    return ledger.reduce((sum, row) => sum + row.delta, 0);
  }

  async function homeworkCount(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    lessonId: string
  ) {
    const hw = await db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.lessonId, lessonId));
    return hw.length;
  }

  it("rejects marking an occurred lesson without a topic", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");

    await expect(
      setAttendance(t.db, anna, lessonId, "s11", "present")
    ).rejects.toMatchObject({
      status: 400,
      message: LESSON_MARK_CONTENT_ERROR,
    });
  });

  it("marks a regular occurred lesson with topic and no homework", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");

    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Кинематика" }],
    });

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");

    const topics = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, lessonId));
    expect(topics.some((row) => row.title === "Кинематика")).toBe(true);
    expect(await homeworkCount(t.db, lessonId)).toBe(0);
    expect(await netDebit(t.db, lessonId)).toBe(-1);
  });

  it("marks a missed lesson through completeLesson with topic and no homework", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");

    await completeLesson(t.db, anna, {
      lessonId,
      topics: [{ title: "Статика" }],
      attendances: [{ studentId: "s11", status: "present" }],
    });

    const topics = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, lessonId));
    expect(topics.some((row) => row.title === "Статика")).toBe(true);
    expect(await homeworkCount(t.db, lessonId)).toBe(0);
    expect(await netDebit(t.db, lessonId)).toBe(-1);

    await completeLesson(t.db, anna, {
      lessonId,
      topics: [{ title: "Статика" }],
      attendances: [{ studentId: "s11", status: "present" }],
    });
    expect(await homeworkCount(t.db, lessonId)).toBe(0);
    expect(await netDebit(t.db, lessonId)).toBe(-1);
  });

  it("saves topic and homework together when both are provided", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");
    await publishHomework(t.db, anna, "hw1").catch(() => undefined);

    await completeLesson(t.db, anna, {
      lessonId,
      topics: [{ title: "Динамика" }],
      attendances: [{ studentId: "s11", status: "present" }],
      homeworkAssigns: [{ homeworkId: "hw1", studentIds: ["s11"] }],
    });

    const topics = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, lessonId));
    expect(topics.some((row) => row.title === "Динамика")).toBe(true);
    expect(await homeworkCount(t.db, lessonId)).toBe(1);
  });

  it("does not debit excused absence without homework", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");
    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Оптика" }],
    });

    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");
    expect(await netDebit(t.db, lessonId)).toBe(0);
    expect(await homeworkCount(t.db, lessonId)).toBe(0);
  });

  it("debits unexcused absence without homework and does not create empty homework", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");
    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Термодинамика" }],
    });

    await setAttendance(t.db, anna, lessonId, "s11", "absent_unexcused");
    expect(await netDebit(t.db, lessonId)).toBe(-1);
    expect(await homeworkCount(t.db, lessonId)).toBe(0);
  });

  it("does not double-debit when homework is assigned and attendance is retried", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11");

    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Кинематика" }],
    });
    await publishHomework(t.db, anna, "hw1").catch(() => undefined);
    await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      teacherId: "t1",
      studentIds: ["s11"],
      lessonId,
    });

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");

    const hw = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.lessonId, lessonId));
    expect(hw.filter((row) => row.studentId === "s11")).toHaveLength(1);
    expect(await netDebit(t.db, lessonId)).toBe(-1);
  });
});
