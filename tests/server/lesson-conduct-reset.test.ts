import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  attendances,
  lessonScheduleExceptions,
  lessonTopics,
  lessons,
  tariffLessonLedger,
  teacherPayrollEntries,
  teacherPayrollSlots,
  testAssignments,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { resetLessonConduct } from "@/server/services/lesson-conduct-reset";
import {
  assignHomework,
  publishHomework,
  setAttendance,
  setLessonTopics,
  upsertLesson,
} from "@/server/services/platform-mutations";
import { setTeacherPayRates } from "@/server/services/teacher-payroll-service";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

const RATES = { 1: 120_000, 2: 160_000, 3: 200_000, 4: 240_000, 5: 280_000 };

describe("reset lesson conduct", () => {
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

  async function pay(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    director: Awaited<ReturnType<typeof asRole>>,
    studentId: string
  ) {
    const tariff = await upsertTariff(db, director, {
      name: "Пакет сброса",
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
      paymentId: assigned.paymentId!,
      reason: "Тест сброса",
    });
  }

  async function pastLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    studentId: string,
    hour = 16
  ) {
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(hour, 0, 0, 0);
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
    pastStart.setHours(hour, 0, 0, 0);
    const pastEnd = new Date(pastStart.getTime() + 45 * 60_000);
    await db
      .update(lessons)
      .set({ startsAt: pastStart, endsAt: pastEnd })
      .where(eq(lessons.id, created.id));
    return created.id;
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

  it("clears attendance, topic, debit and allows a new mark", async () => {
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
    expect(await netDebit(t.db, lessonId)).toBe(-1);

    const first = await resetLessonConduct(t.db, anna, lessonId);
    expect(first.alreadyReset).toBe(false);
    const [lesson] = await t.db.select().from(lessons).where(eq(lessons.id, lessonId));
    expect(lesson.status).toBe("planned");
    const att = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, lessonId));
    expect(att).toHaveLength(0);
    const topics = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, lessonId));
    expect(topics).toHaveLength(0);
    expect(await netDebit(t.db, lessonId)).toBe(0);

    const second = await resetLessonConduct(t.db, anna, lessonId);
    expect(second.alreadyReset).toBe(true);

    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Динамика" }],
    });
    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");
    const [marked] = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, lessonId));
    expect(marked.status).toBe("absent_excused");
    expect(await netDebit(t.db, lessonId)).toBe(0);
  });

  it("restores a teacher-cancelled lesson without deleting it", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const lessonId = await pastLesson(t.db, anna, "s11", 15);
    const [before] = await t.db.select().from(lessons).where(eq(lessons.id, lessonId));
    await upsertLesson(t.db, anna, {
      id: lessonId,
      teacherId: before.teacherId,
      studentIds: ["s11"],
      startsAt: before.startsAt.toISOString(),
      endsAt: before.endsAt.toISOString(),
      status: "cancelled",
      subject: before.subject,
    });
    const [cancelled] = await t.db.select().from(lessons).where(eq(lessons.id, lessonId));
    expect(cancelled.status).toBe("cancelled");

    await resetLessonConduct(t.db, anna, lessonId);
    const [restored] = await t.db.select().from(lessons).where(eq(lessons.id, lessonId));
    expect(restored.status).toBe("planned");
    const exceptions = await t.db
      .select()
      .from(lessonScheduleExceptions)
      .where(eq(lessonScheduleExceptions.lessonId, lessonId));
    expect(exceptions.filter((row) => row.reason === "cancelled")).toHaveLength(0);
  });

  it("hides homework assigned on the lesson and keeps started results", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s11");
    const lessonId = await pastLesson(t.db, anna, "s11", 14);
    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Статика" }],
    });
    await publishHomework(t.db, anna, "hw1").catch(() => undefined);
    await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      teacherId: "t1",
      studentIds: ["s11"],
      lessonId,
    });
    const [openHw] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.lessonId, lessonId));
    expect(openHw.status).toBe("assigned");

    await resetLessonConduct(t.db, anna, lessonId);
    const afterDelete = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.id, openHw.id));
    expect(afterDelete).toHaveLength(0);

    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Статика" }],
    });
    await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      teacherId: "t1",
      studentIds: ["s11"],
      lessonId,
    });
    const [started] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.lessonId, lessonId));
    await t.db
      .update(testAssignments)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(testAssignments.id, started.id));

    await resetLessonConduct(t.db, anna, lessonId);
    const [withdrawn] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.id, started.id));
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("reverses teacher payroll after a present mark", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await setTeacherPayRates(t.db, director, { teacherId: "t1", rates: RATES });
    const anna = await asRole(t.db, "anna@example.com");
    await pay(t.db, director, "s1");
    const lessonId = await pastLesson(t.db, anna, "s1", 11);
    await setLessonTopics(t.db, anna, {
      lessonId,
      topics: [{ title: "Оптика" }],
    });
    await setAttendance(t.db, anna, lessonId, "s1", "present");
    const accrued = await t.db.select().from(teacherPayrollEntries);
    const beforeNet = accrued
      .filter((e) => e.entryType === "accrual" || e.entryType === "adjustment")
      .reduce((sum, e) => sum + e.amountKopecks, 0);
    expect(beforeNet).toBeGreaterThan(0);

    await resetLessonConduct(t.db, anna, lessonId);
    const after = await t.db.select().from(teacherPayrollEntries);
    const afterNet = after
      .filter((e) => e.entryType === "accrual" || e.entryType === "adjustment")
      .reduce((sum, e) => sum + e.amountKopecks, 0);
    expect(afterNet).toBe(0);
    const slots = await t.db.select().from(teacherPayrollSlots);
    expect(slots.every((slot) => slot.attendanceClosed === false)).toBe(true);
  });

  it("forbids a student from resetting a lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const lessonId = await pastLesson(t.db, anna, "s11", 10);
    const student = await asRole(t.db, "s11@demo.local");
    await expect(resetLessonConduct(t.db, student, lessonId)).rejects.toMatchObject({
      status: 403,
    });
  });
});
