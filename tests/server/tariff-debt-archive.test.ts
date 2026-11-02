import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthContext } from "@/server/authz/context";
import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonStudents,
  lessons,
  organizations,
  studentTariffAssignments,
  students,
  tariffLessonLedger,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { getIncomeOverview } from "@/server/services/income-service";
import {
  assertStudentLearningAccess,
  resolveLearningAccess,
} from "@/server/services/learning-access";
import {
  archiveStudent,
  restoreStudent,
  setAttendance,
  upsertLesson,
  upsertStudent,
} from "@/server/services/platform-mutations";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("tariff debt, renewal and student archive", () => {
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
    director: AuthContext,
    studentId: string,
    lessonsLimit: number
  ) {
    const tariff = await upsertTariff(db, director, {
      name: `Пакет ${lessonsLimit}`,
      price: 1000,
      durationDays: 28,
      lessonsLimit,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(db, director, {
      studentId,
      tariffId: tariff.id,
    });
    const paid = await adminMarkPaymentPaid(db, director, {
      paymentId: assigned.paymentId,
      reason: "Тестовая оплата пакета",
    });
    return { tariff, assigned, paid };
  }

  async function makeLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: AuthContext,
    studentIds: string[],
    slotHour: number
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
      subject: "Долг",
    });
    return created.id;
  }

  it("reports remaining 2 then 1 after successive debits", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11", 2);
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(2);
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 10),
      "s11",
      "present"
    );
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(1);
    expect(access.allowed).toBe(true);
  });

  it("remaining 0 allows one debt debit; remaining -1 blocks new lessons", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11", 1);

    const first = await makeLesson(t.db, anna, ["s11"], 10);
    await setAttendance(t.db, anna, first, "s11", "present");
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(0);
    expect(access.allowed).toBe(true);

    const debtLesson = await makeLesson(t.db, anna, ["s11"], 11);
    await setAttendance(t.db, anna, debtLesson, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(-1);
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("exhausted");

    const blocked = await makeLesson(t.db, anna, ["s11"], 12);
    await expect(
      setAttendance(t.db, anna, blocked, "s11", "present")
    ).rejects.toMatchObject({ status: 400 });
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(-1);

    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, blocked))
      .limit(1);
    expect(lesson).toBeTruthy();
    const [link] = await t.db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, blocked))
      .limit(1);
    expect(link?.studentId).toBe("s11");
  });

  it("does not allow remaining below -1 under parallel debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11", 1);
    const first = await makeLesson(t.db, anna, ["s11"], 10);
    await setAttendance(t.db, anna, first, "s11", "present");

    const a = await makeLesson(t.db, anna, ["s11"], 13);
    const b = await makeLesson(t.db, anna, ["s11"], 14);
    const results = await Promise.allSettled([
      setAttendance(t.db, anna, a, "s11", "present"),
      setAttendance(t.db, anna, b, "s11", "present"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(ok).toBe(1);
    expect(failed).toBe(1);
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(-1);
  });

  it("renewal at -1 settles debt once: -1 + 8 = 7, replay does not double-credit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11", 1);
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 10),
      "s11",
      "present"
    );
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 11),
      "s11",
      "present"
    );
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(-1);

    const next = await paidPackage(t.db, director, "s11", 8);
    expect(next.paid.alreadyPaid).toBe(false);
    expect(next.paid.debtSettled).toBe(true);

    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);
    expect(access.allowed).toBe(true);

    const replay = await adminMarkPaymentPaid(t.db, director, {
      paymentId: next.assigned.paymentId,
      reason: "Повторная фиксация оплаты",
    });
    expect(replay.alreadyPaid).toBe(true);
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(7);

    const settlements = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.assignmentId, next.assigned.id));
    expect(
      settlements.filter((r) => r.reason === "debt_settlement")
    ).toHaveLength(1);
    expect(settlements.reduce((sum, r) => sum + r.delta, 0)).toBe(-1);
  });

  it("blocks theory/homework actions at -1 but keeps history; income mark appears and disappears", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s11@demo.local");
    await paidPackage(t.db, director, "s11", 1);
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 10),
      "s11",
      "present"
    );
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 11),
      "s11",
      "present"
    );

    await expect(
      assertStudentLearningAccess(t.db, student, "s11", "homework")
    ).rejects.toMatchObject({ status: 403 });

    const ledgerBefore = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.studentId, "s11"));
    expect(ledgerBefore.length).toBeGreaterThan(0);

    let overview = await getIncomeOverview(t.db, director);
    const flagged = overview.current.attention.find((r) => r.studentId === "s11");
    expect(flagged?.needsRenewal).toBe(true);
    expect(flagged?.lessonsRemaining).toBe(-1);

    await paidPackage(t.db, director, "s11", 8);
    await expect(
      assertStudentLearningAccess(t.db, student, "s11", "homework")
    ).resolves.toMatchObject({ allowed: true });

    overview = await getIncomeOverview(t.db, director);
    const after = overview.current.byTariff
      .flatMap((g) => g.students)
      .find((r) => r.studentId === "s11");
    expect(after?.needsRenewal).toBe(false);
    expect(after?.lessonsRemaining).toBe(7);

    const ledgerAfter = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.studentId, "s11"));
    expect(ledgerAfter.length).toBeGreaterThanOrEqual(ledgerBefore.length);
  });

  it("archives without settling debt, unlinks teacher, restores without duplicate", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s11@demo.local");
    await upsertStudent(t.db, director, {
      id: "s11",
      fullName: "Никита Белов",
      status: "active",
      teacherId: "t1",
    });
    await paidPackage(t.db, director, "s11", 1);
    const lessonId = await makeLesson(t.db, anna, ["s11"], 10);
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 11),
      "s11",
      "present"
    );

    await expect(
      archiveStudent(t.db, anna, { id: "s11", reason: "stopped" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      archiveStudent(t.db, student, { id: "s11", reason: "stopped" })
    ).rejects.toMatchObject({ status: 403 });

    const archived = await archiveStudent(t.db, director, {
      id: "s11",
      reason: "stopped",
    });
    expect(archived.alreadyArchived).toBe(false);

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(row?.status).toBe("archived");
    expect(row?.primaryTeacherId).toBeNull();
    expect(row?.previousTeacherId).toBe("t1");
    expect(row?.archivedReason).toBe("stopped");

    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.remaining).toBe(-1);

    const [stillLesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    expect(stillLesson).toBeTruthy();
    const [link] = await t.db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, lessonId))
      .limit(1);
    expect(link?.studentId).toBe("s11");

    const assignments = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(eq(studentTariffAssignments.studentId, "s11"));
    expect(assignments.length).toBeGreaterThan(0);

    const restored = await restoreStudent(t.db, director, "s11");
    expect(restored.alreadyActive).toBe(false);
    const [again] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(again?.status).toBe("active");
    expect(again?.primaryTeacherId).toBeNull();
    const twins = await t.db
      .select()
      .from(students)
      .where(eq(students.fullName, again!.fullName));
    expect(twins.filter((s) => s.id === "s11")).toHaveLength(1);

    await expect(
      restoreStudent(t.db, anna, "s11")
    ).rejects.toMatchObject({ status: 403 });

    await t.db.insert(organizations).values({
      id: "org_other_archive",
      name: "Другая",
      slug: "other-archive",
    });
    const otherDirector: AuthContext = {
      ...director,
      organizationId: "org_other_archive",
    };
    await expect(
      archiveStudent(t.db, otherDirector, { id: "s11", reason: "stopped" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      restoreStudent(t.db, otherDirector, "s11")
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      upsertStudent(t.db, otherDirector, {
        id: "s11",
        fullName: "Чужой",
        status: "active",
        teacherId: "",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
