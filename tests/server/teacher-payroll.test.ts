import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { teacherPayrollEntries } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  completeLesson,
  setAttendance,
  upsertLesson,
} from "@/server/services/platform-mutations";
import {
  createTeacherPayout,
  setTeacherPayRates,
} from "@/server/services/teacher-payroll-service";
import { getPayrollOverview } from "@/server/services/teacher-payroll-overview";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

const RATES = { 1: 120_000, 2: 160_000, 3: 200_000, 4: 240_000, 5: 280_000 };
const STUDENTS = ["s1", "s2", "s3", "s5", "s6"] as const;

describe("teacher payroll", () => {
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

  async function configureRates(
    db: Awaited<ReturnType<typeof createTestDb>>["db"]
  ) {
    const director = await asRole(db, "director@demo.local");
    await setTeacherPayRates(db, director, { teacherId: "t1", rates: RATES });
    return director;
  }

  async function makeSlot(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    studentIds: string[],
    hour = 16
  ) {
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const ids: string[] = [];
    for (const studentId of studentIds) {
      const created = await upsertLesson(db, teacher, {
        teacherId: "t1",
        studentIds: [studentId],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: "planned",
        subject: "Зарплата",
      });
      ids.push(created.id);
    }
    return { ids, startsAt };
  }

  async function mark(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    lessonId: string,
    studentId: string,
    status: "present" | "absent_excused" | "absent_unexcused"
  ) {
    await setAttendance(db, teacher, lessonId, studentId, status);
  }

  async function entriesForTeacher(
    db: Awaited<ReturnType<typeof createTestDb>>["db"]
  ) {
    return db
      .select()
      .from(teacherPayrollEntries)
      .where(eq(teacherPayrollEntries.teacherId, "t1"));
  }

  it("accrues the 1–5 person rates from actual presence", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");

    for (let n = 1; n <= 5; n++) {
      const { ids } = await makeSlot(t.db, anna, STUDENTS.slice(0, n) as string[], 10 + n);
      for (let i = 0; i < n; i++) {
        await mark(t.db, anna, ids[i]!, STUDENTS[i]!, "present");
      }
    }

    const rows = (await entriesForTeacher(t.db)).filter((r) => r.entryType === "accrual");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.amountKopecks).sort((a, b) => a - b)).toEqual([
      120_000, 160_000, 200_000, 240_000, 280_000,
    ]);
  });

  it("ignores scheduled absentees when choosing the rate", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2", "s3", "s5"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    await mark(t.db, anna, ids[1]!, "s2", "present");
    await mark(t.db, anna, ids[2]!, "s3", "present");
    await mark(t.db, anna, ids[3]!, "s5", "absent_unexcused");
    const rows = await entriesForTeacher(t.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountKopecks).toBe(200_000);
    expect(rows[0]!.presentCount).toBe(3);
  });

  it("uses only actual presence for excused and unexcused absences", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2", "s3"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    await mark(t.db, anna, ids[1]!, "s2", "absent_excused");
    await mark(t.db, anna, ids[2]!, "s3", "absent_unexcused");
    const rows = await entriesForTeacher(t.db);
    expect(rows[0]!.amountKopecks).toBe(120_000);
    expect(rows[0]!.presentCount).toBe(1);
  });

  it("does not accrue a fully cancelled slot", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids, startsAt } = await makeSlot(t.db, anna, ["s1", "s2"]);
    await upsertLesson(t.db, anna, {
      id: ids[0],
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      status: "cancelled",
      subject: "Зарплата",
    });
    await upsertLesson(t.db, anna, {
      id: ids[1],
      teacherId: "t1",
      studentIds: ["s2"],
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      status: "cancelled",
      subject: "Зарплата",
    });
    expect(await entriesForTeacher(t.db)).toHaveLength(0);
  });

  it("does not finalize accrual while attendance is incomplete", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    expect(await entriesForTeacher(t.db)).toHaveLength(0);
  });

  it("does not create a second accrual on repeated attendance save", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    await mark(t.db, anna, ids[0]!, "s1", "present");
    await completeLesson(t.db, anna, {
      lessonId: ids[0]!,
      attendances: [{ studentId: "s1", status: "present" }],
    });
    const rows = await entriesForTeacher(t.db);
    expect(rows.filter((r) => r.entryType === "accrual")).toHaveLength(1);
  });

  it("rejects a sixth student in the same slot via a direct upsert", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const { startsAt } = await makeSlot(t.db, anna, ["s1", "s2", "s3", "s5", "s6"], 18);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    await expect(
      upsertLesson(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s7"],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: "planned",
        subject: "Шестой",
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps historical accruals when rates change", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2", "s3"]);
    for (let i = 0; i < 3; i++) {
      await mark(t.db, anna, ids[i]!, STUDENTS[i]!, "present");
    }
    await setTeacherPayRates(t.db, director, {
      teacherId: "t1",
      rates: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
    });
    const rows = await entriesForTeacher(t.db);
    expect(rows[0]!.amountKopecks).toBe(200_000);
  });

  it("creates an idempotent adjustment when attendance is corrected", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2", "s3"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    await mark(t.db, anna, ids[1]!, "s2", "present");
    await mark(t.db, anna, ids[2]!, "s3", "present");
    await mark(t.db, anna, ids[2]!, "s3", "absent_unexcused");
    await mark(t.db, anna, ids[2]!, "s3", "absent_unexcused");
    const rows = await entriesForTeacher(t.db);
    expect(rows.filter((r) => r.entryType === "accrual")).toHaveLength(1);
    expect(rows.filter((r) => r.entryType === "adjustment")).toHaveLength(1);
    expect(rows.find((r) => r.entryType === "accrual")!.amountKopecks).toBe(200_000);
    expect(rows.find((r) => r.entryType === "adjustment")!.amountKopecks).toBe(-40_000);
  });

  it("applies a full or partial payout to the current debt", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2", "s3"]);
    for (let i = 0; i < 3; i++) {
      await mark(t.db, anna, ids[i]!, STUDENTS[i]!, "present");
    }
    await createTeacherPayout(t.db, director, {
      teacherId: "t1",
      amountKopecks: 50_000,
      occurredAt: new Date().toISOString(),
      idempotencyKey: "pay-partial",
    });
    let overview = await getPayrollOverview(t.db, director, {});
    const row = overview.teachers.find((x) => x.teacherId === "t1")!;
    expect(row.debtKopecks).toBe(150_000);

    await createTeacherPayout(t.db, director, {
      teacherId: "t1",
      amountKopecks: 150_000,
      occurredAt: new Date().toISOString(),
      idempotencyKey: "pay-rest",
    });
    overview = await getPayrollOverview(t.db, director, {});
    expect(overview.teachers.find((x) => x.teacherId === "t1")!.debtKopecks).toBe(0);
  });

  it("rejects zero or negative payouts and duplicate keys", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await configureRates(t.db);
    await expect(
      createTeacherPayout(t.db, director, {
        teacherId: "t1",
        amountKopecks: 0,
        occurredAt: new Date().toISOString(),
        idempotencyKey: "zero",
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createTeacherPayout(t.db, director, {
        teacherId: "t1",
        amountKopecks: -100,
        occurredAt: new Date().toISOString(),
        idempotencyKey: "neg",
      })
    ).rejects.toMatchObject({ status: 400 });

    await createTeacherPayout(t.db, director, {
      teacherId: "t1",
      amountKopecks: 10_000,
      occurredAt: new Date().toISOString(),
      idempotencyKey: "dup",
    });
    const second = await createTeacherPayout(t.db, director, {
      teacherId: "t1",
      amountKopecks: 10_000,
      occurredAt: new Date().toISOString(),
      idempotencyKey: "dup",
    });
    expect(second.replayed).toBe(true);
    const payouts = (await entriesForTeacher(t.db)).filter((r) => r.entryType === "payout");
    expect(payouts).toHaveLength(1);
  });

  it("keeps school debt equal to the sum of teacher debts", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1"]);
    await mark(t.db, anna, ids[0]!, "s1", "present");
    const overview = await getPayrollOverview(t.db, director, {});
    const sum = overview.teachers.reduce((s, row) => s + row.debtKopecks, 0);
    expect(overview.school.debtKopecks).toBe(sum);
    expect(overview.school.teacherDebtSumKopecks).toBe(sum);
  });

  it("does not let a teacher change rates or payouts", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      setTeacherPayRates(t.db, anna, { teacherId: "t1", rates: RATES })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createTeacherPayout(t.db, student, {
        teacherId: "t1",
        amountKopecks: 1000,
        occurredAt: new Date().toISOString(),
        idempotencyKey: "nope",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not duplicate accrual under concurrent attendance saves", async () => {
    const t = await createTestDb();
    close = t.close;
    await configureRates(t.db);
    const anna = await asRole(t.db, "anna@example.com");
    const { ids } = await makeSlot(t.db, anna, ["s1", "s2"]);
    await Promise.all([
      mark(t.db, anna, ids[0]!, "s1", "present"),
      mark(t.db, anna, ids[1]!, "s2", "present"),
    ]);
    const rows = await entriesForTeacher(t.db);
    expect(rows.filter((r) => r.entryType === "accrual")).toHaveLength(1);
    expect(rows[0]!.amountKopecks).toBe(160_000);
  });
});
