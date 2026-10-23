import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessons,
  tariffLessonDebitState,
  tariffLessonLedger,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { resolveLearningAccess } from "@/server/services/learning-access";
import {
  completeLesson,
  deleteLesson,
  setAttendance,
  upsertLesson,
  upsertStudent,
} from "@/server/services/platform-mutations";
import {
  createLessonSchedule,
  materializeSchedule,
} from "@/server/services/schedule-service";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  refreshExpiredAssignments,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("tariff balance + attendance", () => {
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
    director: Awaited<ReturnType<typeof asRole>>,
    studentId: string,
    extra?: { lessonsLimit?: number; startsAt?: Date; endsAt?: Date }
  ) {
    const tariff = await upsertTariff(db, director, {
      name: "Пакет-тест",
      price: 1000,
      durationDays: 28,
      lessonsLimit: extra?.lessonsLimit ?? 8,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(db, director, {
      studentId,
      tariffId: tariff.id,
      startsAt: extra?.startsAt?.toISOString(),
      endsAt: extra?.endsAt?.toISOString(),
    });
    await adminMarkPaymentPaid(db, director, {
      paymentId: assigned.paymentId,
      reason: "Тестовая оплата пакета",
    });
    return { tariff, assigned };
  }

  async function makeLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    studentIds: string[],
    slotHour = 16
  ) {
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(slotHour, 15, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    const created = await upsertLesson(db, teacher, {
      teacherId: "t1",
      studentIds,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Баланс",
    });
    return created.id;
  }

  it("present attendance debits one lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"]);

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(7);
  });

  it("unexcused absence debits; excused and teacher cancel do not", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");

    const unexcusedId = await makeLesson(t.db, anna, ["s11"], 12);
    await setAttendance(t.db, anna, unexcusedId, "s11", "absent_unexcused");
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);

    const excusedId = await makeLesson(t.db, anna, ["s11"], 13);
    await setAttendance(t.db, anna, excusedId, "s11", "absent_excused");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);

    const cancelId = await makeLesson(t.db, anna, ["s11"], 14);
    await setAttendance(t.db, anna, cancelId, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(6);

    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, cancelId))
      .limit(1);
    await upsertLesson(t.db, anna, {
      id: cancelId,
      teacherId: "t1",
      studentIds: ["s11"],
      startsAt: lesson!.startsAt.toISOString(),
      endsAt: lesson!.endsAt.toISOString(),
      status: "cancelled",
      subject: "Баланс",
    });
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);
  });

  it("teacher cancel without prior mark does not debit a lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"], 15);
    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    await upsertLesson(t.db, anna, {
      id: lessonId,
      teacherId: "t1",
      studentIds: ["s11"],
      startsAt: lesson!.startsAt.toISOString(),
      endsAt: lesson!.endsAt.toISOString(),
      status: "cancelled",
      subject: "Отмена",
    });
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(8);
    const rows = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
    expect(rows).toHaveLength(0);
  });

  it("does not double-debit the same lesson/student", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"]);

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await completeLesson(t.db, anna, {
      lessonId,
      attendances: [{ studentId: "s11", status: "present" }],
    });

    const rows = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
    const net = rows.reduce((sum, r) => sum + r.delta, 0);
    expect(net).toBe(-1);
    const states = await t.db
      .select()
      .from(tariffLessonDebitState)
      .where(eq(tariffLessonDebitState.lessonId, lessonId));
    expect(states).toHaveLength(1);
  });

  it("retrying the same present mark after a failed client does not double-debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"], 16);

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");

    const rows = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
    const debits = rows.filter((r) => r.delta < 0);
    expect(debits).toHaveLength(1);
    expect(rows.reduce((sum, r) => sum + r.delta, 0)).toBe(-1);
  });

  it("correcting attendance reverses previous debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"]);

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");

    const rows = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
    expect(rows.some((r) => r.reason === "reversal" && r.delta === 1)).toBe(
      true
    );
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(8);
    expect(access.allowed).toBe(true);
  });

  it("keeps remaining after predicted end date; blocks at zero remaining", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const startsAt = new Date(Date.now() - 40 * 86_400_000);
    const endsAt = new Date(Date.now() - 10 * 86_400_000);
    await paidPackage(t.db, director, "s11", {
      lessonsLimit: 1,
      startsAt,
      endsAt,
    });

    await refreshExpiredAssignments(t.db, director.organizationId);
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(1);

    const lessonId = await makeLesson(t.db, anna, ["s11"]);
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("exhausted");
    expect(access.remaining).toBe(0);

    const login = await loginWithPassword(t.db, {
      email: "s11@demo.local",
      password: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(t.db, login.session.rawToken);
    expect(studentCtx.role).toBe("student");
  });

  it("assigns tariff to a newly created student after the student is saved", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await upsertStudent(t.db, director, {
      fullName: "Новый Ученик Пакета",
      status: "active",
      teacherId: "t1",
    });
    const tariff = await upsertTariff(t.db, director, {
      name: "Новому",
      price: 500,
      durationDays: 21,
      lessonsLimit: 6,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(t.db, director, {
      studentId: student.id,
      tariffId: tariff.id,
    });
    expect(assigned.id).toBeTruthy();
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: assigned.paymentId,
      reason: "Назначение новому ученику",
    });
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      student.id,
      "homework"
    );
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(6);
  });

  it("debits parallel independent lessons separately", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11");
    await paidPackage(t.db, director, "s10");
    const lessonA = await makeLesson(t.db, anna, ["s11"]);
    const lessonB = await makeLesson(t.db, anna, ["s10"]);

    await setAttendance(t.db, anna, lessonA, "s11", "present");
    await setAttendance(t.db, anna, lessonB, "s10", "absent_excused");

    const a11 = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    const a10 = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s10",
      "homework"
    );
    expect(a11.remaining).toBe(7);
    expect(a10.remaining).toBe(8);
  });

  it("enforces roles for tariff assign and attendance", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s11@demo.local");
    const tariff = await upsertTariff(t.db, director, {
      name: "Роли",
      price: 100,
      durationDays: 14,
      lessonsLimit: 4,
      weeklyFrequency: 1,
      features: ["individual_lessons", "homework"],
    });

    await expect(
      assignTariffToStudent(t.db, anna, {
        studentId: "s11",
        tariffId: tariff.id,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assignTariffToStudent(t.db, student, {
        studentId: "s11",
        tariffId: tariff.id,
      })
    ).rejects.toMatchObject({ status: 403 });

    await paidPackage(t.db, director, "s11");
    const lessonId = await makeLesson(t.db, anna, ["s11"]);
    await expect(
      setAttendance(t.db, student, lessonId, "s11", "present")
    ).rejects.toMatchObject({ status: 403 });
    await setAttendance(t.db, director, lessonId, "s11", "present");
  });

  it("deleted scheduled occurrence is not recreated on materialize", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const now = new Date(2026, 9, 14, 10, 0, 0, 0);
    const created = await createLessonSchedule(
      t.db,
      anna,
      {
        teacherId: "t1",
        studentIds: ["s11"],
        weekdays: [3],
        startTime: "06:15",
        durationMin: 60,
        subject: "Исключение",
      },
      now
    );
    const rows = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.scheduleId, created.id));
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0]!;
    await deleteLesson(t.db, anna, first.id);

    const again = await materializeSchedule(
      t.db,
      anna.organizationId,
      created.id,
      now
    );
    expect(again).toBe(0);
    const after = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.scheduleId, created.id));
    expect(after.some((r) => r.id === first.id)).toBe(false);
    expect(
      after.some(
        (r) => r.scheduleOccurrenceKey === first.scheduleOccurrenceKey
      )
    ).toBe(false);
  });
});
