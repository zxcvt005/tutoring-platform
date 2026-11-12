import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  attendances,
  lessons,
  tariffLessonLedger,
  teacherPayrollEntries,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { resolveLearningAccess } from "@/server/services/learning-access";
import {
  setAttendance,
  upsertLesson,
} from "@/server/services/platform-mutations";
import {
  settleLessonPayroll,
  setTeacherPayRates,
} from "@/server/services/teacher-payroll-service";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("attendance save does not duplicate finance", () => {
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

  async function paidPackage(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    director: Awaited<ReturnType<typeof asRole>>
  ) {
    const tariff = await upsertTariff(db, director, {
      name: "Пакет посещаемости",
      price: 1000,
      durationDays: 28,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      features: ["individual_lessons"],
    });
    const assigned = await assignTariffToStudent(db, director, {
      studentId: "s11",
      tariffId: tariff.id,
    });
    await adminMarkPaymentPaid(db, director, {
      paymentId: assigned.paymentId,
      reason: "Тестовая оплата",
    });
  }

  async function makeLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    hour = 16
  ) {
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const created = await upsertLesson(db, teacher, {
      teacherId: "t1",
      studentIds: ["s11"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Посещаемость",
    });
    return created.id;
  }

  async function debits(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    lessonId: string
  ) {
    return db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
  }

  it("starts unmarked and does not debit a forgotten lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 11);

    const marks = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, lessonId));
    expect(marks).toHaveLength(0);

    const past = new Date(Date.now() - 3 * 60 * 60_000);
    await t.db
      .update(lessons)
      .set({
        startsAt: past,
        endsAt: new Date(past.getTime() + 60 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, lessonId));

    await settleLessonPayroll(t.db, anna, lessonId);
    expect(await debits(t.db, lessonId)).toHaveLength(0);
    const stillOpen = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, lessonId));
    expect(stillOpen).toHaveLength(0);
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(8);
  });

  it("marks the existing lesson and ignores a repeated or parallel save", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await setTeacherPayRates(t.db, director, {
      teacherId: "t1",
      rates: { 1: 100_000, 2: 150_000, 3: 180_000, 4: 200_000, 5: 220_000 },
    });
    await paidPackage(t.db, director);
    const before = await t.db.select({ id: lessons.id }).from(lessons);
    const lessonId = await makeLesson(t.db, anna, 12);

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const parallel = await Promise.allSettled([
      setAttendance(t.db, anna, lessonId, "s11", "present"),
      setAttendance(t.db, anna, lessonId, "s11", "present"),
    ]);
    expect(parallel.some((item) => item.status === "rejected")).toBe(false);

    const rows = await debits(t.db, lessonId);
    expect(rows.filter((row) => row.delta === -1)).toHaveLength(1);
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);

    const after = await t.db.select({ id: lessons.id }).from(lessons);
    expect(after).toHaveLength(before.length + 1);
    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    expect(lesson?.id).toBe(lessonId);
    expect(lesson?.status).toBe("done");

    const payroll = await t.db
      .select()
      .from(teacherPayrollEntries)
      .where(
        and(
          eq(teacherPayrollEntries.teacherId, "t1"),
          eq(teacherPayrollEntries.entryType, "accrual")
        )
      );
    expect(payroll).toHaveLength(1);

    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");
    const edited = await debits(t.db, lessonId);
    expect(edited.filter((row) => row.delta === -1)).toHaveLength(1);
    expect(edited.filter((row) => row.delta === 1)).toHaveLength(1);
    const restored = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(restored.remaining).toBe(8);
    const [mark] = await t.db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.lessonId, lessonId),
          eq(attendances.studentId, "s11")
        )
      );
    expect(mark?.status).toBe("absent_excused");
  });

  it("rejects a user who cannot mark the lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const igor = await asRole(t.db, "igor@example.com");
    const student = await asRole(t.db, "s1@demo.local");
    const lessonId = await makeLesson(t.db, anna, 13);

    await expect(
      setAttendance(t.db, igor, lessonId, "s11", "present")
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setAttendance(t.db, student, lessonId, "s11", "present")
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await t.db
        .select()
        .from(attendances)
        .where(eq(attendances.lessonId, lessonId))
    ).toHaveLength(0);
  });
});
