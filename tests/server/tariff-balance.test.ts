import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonDebitState,
  lessons,
  studentLessonLedger,
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
import { upsertTariff } from "@/server/services/tariffs-service";
import {
  makePlannedLesson,
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("direction lesson balance + attendance", () => {
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

  async function credit(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    director: Awaited<ReturnType<typeof asRole>>,
    studentId: string,
    lessons = 8
  ) {
    const directionId = await physicsDirectionId(db, director.organizationId);
    await seedPaidLessons(db, director, studentId, {
      directionId,
      lessons,
    });
    return directionId;
  }

  it("present attendance debits one lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(7);
  });

  it("unexcused absence debits; excused and teacher cancel do not", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");

    const unexcusedId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 12,
    });
    await setAttendance(t.db, anna, unexcusedId, "s11", "absent_unexcused");
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(7);

    const excusedId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 13,
    });
    await setAttendance(t.db, anna, excusedId, "s11", "absent_excused");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(7);

    const cancelId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 14,
    });
    await setAttendance(t.db, anna, cancelId, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
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
      directionId,
      startsAt: lesson!.startsAt.toISOString(),
      endsAt: lesson!.endsAt.toISOString(),
      status: "cancelled",
      subject: "Баланс",
    });
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(7);
  });

  it("teacher cancel without prior mark does not debit a lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 15,
    });
    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    await upsertLesson(t.db, anna, {
      id: lessonId,
      teacherId: "t1",
      studentIds: ["s11"],
      directionId,
      startsAt: lesson!.startsAt.toISOString(),
      endsAt: lesson!.endsAt.toISOString(),
      status: "cancelled",
      subject: "Отмена",
    });
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(8);
    const rows = await t.db
      .select()
      .from(studentLessonLedger)
      .where(eq(studentLessonLedger.lessonId, lessonId));
    expect(rows).toHaveLength(0);
  });

  it("does not double-debit the same lesson/student", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await completeLesson(t.db, anna, {
      lessonId,
      attendances: [{ studentId: "s11", status: "present" }],
    });

    const rows = await t.db
      .select()
      .from(studentLessonLedger)
      .where(eq(studentLessonLedger.lessonId, lessonId));
    const net = rows.reduce((sum, r) => sum + r.delta, 0);
    expect(net).toBe(-1);
    const states = await t.db
      .select()
      .from(lessonDebitState)
      .where(eq(lessonDebitState.lessonId, lessonId));
    expect(states).toHaveLength(1);
  });

  it("correcting attendance reverses previous debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });

    await setAttendance(t.db, anna, lessonId, "s11", "present");
    await setAttendance(t.db, anna, lessonId, "s11", "absent_excused");

    const rows = await t.db
      .select()
      .from(studentLessonLedger)
      .where(eq(studentLessonLedger.lessonId, lessonId));
    expect(rows.some((r) => r.reason === "reversal" && r.delta === 1)).toBe(
      true
    );
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(8);
    expect(access.allowed).toBe(true);
  });

  it("allows one debt lesson at remaining 0, blocks below -2", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11", 1);

    const lesson1 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 10,
    });
    await setAttendance(t.db, anna, lesson1, "s11", "present");
    let access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(0);

    const lesson2 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 11,
    });
    await setAttendance(t.db, anna, lesson2, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(-1);

    const lesson3 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 12,
    });
    await setAttendance(t.db, anna, lesson3, "s11", "present");
    access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(-2);

    const lesson4 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 13,
    });
    await expect(
      setAttendance(t.db, anna, lesson4, "s11", "present")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("credits a newly created student after purchase", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await upsertStudent(t.db, director, {
      fullName: "Новый Ученик Пакета",
      status: "active",
      teacherId: "t1",
    });
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    await seedPaidLessons(t.db, director, student.id, {
      directionId,
      lessons: 6,
    });
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      student.id,
      "homework",
      directionId
    );
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(6);
  });

  it("debits parallel independent lessons separately", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await credit(t.db, director, "s11");
    await credit(t.db, director, "s10");
    const lessonA = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });
    const lessonB = await makePlannedLesson(t.db, anna, {
      studentIds: ["s10"],
      directionId,
      slotHour: 17,
    });

    await setAttendance(t.db, anna, lessonA, "s11", "present");
    await setAttendance(t.db, anna, lessonB, "s10", "absent_excused");

    const a11 = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    const a10 = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s10",
      "homework",
      directionId
    );
    expect(a11.remaining).toBe(7);
    expect(a10.remaining).toBe(8);
  });

  it("enforces roles for tariff edit and attendance", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s11@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    await expect(
      upsertTariff(t.db, anna, {
        directionId,
        name: "Роли",
        features: ["individual_lessons"],
        purchaseOptions: [
          { lessonsCount: 4, totalPrice: 100, sortOrder: 0, isActive: true },
        ],
      })
    ).rejects.toMatchObject({ status: 403 });

    await credit(t.db, director, "s11");
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });
    await expect(
      setAttendance(t.db, student, lessonId, "s11", "present")
    ).rejects.toMatchObject({ status: 403 });
    await setAttendance(t.db, director, lessonId, "s11", "present");
  });

  it("deleted scheduled occurrence is not recreated on materialize", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await physicsDirectionId(t.db, anna.organizationId);
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
        directionId,
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