import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  attendances,
  tariffLessonLedger,
  teacherPayrollEntries,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { resetLessonConduct } from "@/server/services/lesson-conduct-reset";
import {
  setAttendance,
  upsertLesson,
} from "@/server/services/platform-mutations";
import { setTeacherPayRates } from "@/server/services/teacher-payroll-service";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("attendance status transitions and finance", () => {
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
      name: "Пакет переходов",
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
    hour = 15
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
      subject: "Переходы",
    });
    return created.id;
  }

  async function ledger(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    lessonId: string
  ) {
    return db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, lessonId));
  }

  async function statusOf(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    lessonId: string
  ) {
    const [row] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.lessonId, lessonId),
          eq(attendances.studentId, "s11")
        )
      )
      .limit(1);
    return row?.status ?? null;
  }

  function netDelta(
    rows: { delta: number }[]
  ): { debits: number; reversals: number; net: number } {
    let debits = 0;
    let reversals = 0;
    let net = 0;
    for (const r of rows) {
      net += r.delta;
      if (r.delta < 0) debits += 1;
      if (r.delta > 0) reversals += 1;
    }
    return { debits, reversals, net };
  }

  it("1 unmarked → present: one debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    await setTeacherPayRates(t.db, director, {
      teacherId: "t1",
      rates: { 1: 100_000, 2: 150_000, 3: 180_000, 4: 200_000, 5: 220_000 },
    });
    const lessonId = await makeLesson(t.db, anna);

    expect(await statusOf(t.db, lessonId)).toBeNull();
    const result = await setAttendance(
      t.db,
      anna,
      lessonId,
      "s11",
      "present"
    );
    expect(result.ok).toBe(true);
    expect(await statusOf(t.db, lessonId)).toBe("present");
    const stats = netDelta(await ledger(t.db, lessonId));
    expect(stats).toEqual({ debits: 1, reversals: 0, net: -1 });
    expect(result.remaining).toBe(7);
  });

  it("2 present → present again: no extra debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 16);
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const again = await setAttendance(
      t.db,
      anna,
      lessonId,
      "s11",
      "present"
    );
    expect(again.remaining).toBe(7);
    expect(netDelta(await ledger(t.db, lessonId))).toEqual({
      debits: 1,
      reversals: 0,
      net: -1,
    });
  });

  it("3 present → absent_unexcused: same net debit, no second charge", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 17);
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const result = await setAttendance(
      t.db,
      anna,
      lessonId,
      "s11",
      "absent_unexcused"
    );
    expect(await statusOf(t.db, lessonId)).toBe("absent_unexcused");
    expect(result.remaining).toBe(7);
    expect(netDelta(await ledger(t.db, lessonId))).toEqual({
      debits: 1,
      reversals: 0,
      net: -1,
    });
  });

  it("4 absent_unexcused → absent_excused: one reversal", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 18);
    await setAttendance(t.db, anna, lessonId, "s11", "absent_unexcused");
    const result = await setAttendance(
      t.db,
      anna,
      lessonId,
      "s11",
      "absent_excused"
    );
    expect(await statusOf(t.db, lessonId)).toBe("absent_excused");
    expect(result.remaining).toBe(8);
    expect(netDelta(await ledger(t.db, lessonId))).toEqual({
      debits: 1,
      reversals: 1,
      net: 0,
    });
  });

  it("5 absent_excused → present: one new debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 19);
    await setAttendance(t.db, anna, lessonId, "s11", "absent_unexcused");
    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");
    const result = await setAttendance(
      t.db,
      anna,
      lessonId,
      "s11",
      "present"
    );
    expect(await statusOf(t.db, lessonId)).toBe("present");
    expect(result.remaining).toBe(7);
    expect(netDelta(await ledger(t.db, lessonId))).toEqual({
      debits: 2,
      reversals: 1,
      net: -1,
    });
  });

  it("6 present → cleared via reset: reversal and unmarked", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    const lessonId = await makeLesson(t.db, anna, 20);
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await resetLessonConduct(t.db, anna, lessonId);
    expect(await statusOf(t.db, lessonId)).toBeNull();
    expect(netDelta(await ledger(t.db, lessonId))).toEqual({
      debits: 1,
      reversals: 1,
      net: 0,
    });
  });

  it("7 parallel different statuses: final ledger matches final attendance", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director);
    await setTeacherPayRates(t.db, director, {
      teacherId: "t1",
      rates: { 1: 100_000, 2: 150_000, 3: 180_000, 4: 200_000, 5: 220_000 },
    });
    const lessonId = await makeLesson(t.db, anna, 21);

    const results = await Promise.allSettled([
      setAttendance(t.db, anna, lessonId, "s11", "present"),
      setAttendance(t.db, anna, lessonId, "s11", "absent_excused"),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const finalStatus = await statusOf(t.db, lessonId);
    expect(["present", "absent_excused"]).toContain(finalStatus);
    const stats = netDelta(await ledger(t.db, lessonId));
    if (finalStatus === "present") {
      expect(stats.net).toBe(-1);
    } else {
      expect(stats.net).toBe(0);
    }
    const payroll = await t.db
      .select()
      .from(teacherPayrollEntries)
      .where(eq(teacherPayrollEntries.teacherId, "t1"));
    const accrualNet = payroll.reduce((s, r) => s + Number(r.amountRub), 0);
    if (finalStatus === "present") {
      expect(accrualNet).toBeGreaterThan(0);
    }
  });
});
