import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonOrders,
  lessonScheduleStudents,
  lessonSchedules,
  lessonStudents,
  lessons,
  memberships,
  payments,
  settlementDocuments,
  studentLessonLedger,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import { setChatObjectStoreForTests } from "@/server/media/chat-storage";
import { loginWithPassword } from "@/server/services/auth-service";
import { permanentlyDeleteStudent } from "@/server/services/student-permanent-delete";
import {
  makePlannedLesson,
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("permanentlyDeleteStudent", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string | undefined;
  let previousUploadRoot: string | undefined;
  let previousDriver: string | undefined;

  beforeEach(async () => {
    previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
    previousDriver = process.env.CHAT_STORAGE_DRIVER;
    uploadRoot = await mkdtemp(path.join(tmpdir(), "student-wipe-"));
    process.env.CHAT_UPLOAD_ROOT = uploadRoot;
    process.env.CHAT_STORAGE_DRIVER = "local";
    setChatObjectStoreForTests(null);
  });

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    setChatObjectStoreForTests(null);
    if (previousUploadRoot === undefined) delete process.env.CHAT_UPLOAD_ROOT;
    else process.env.CHAT_UPLOAD_ROOT = previousUploadRoot;
    if (previousDriver === undefined) delete process.env.CHAT_STORAGE_DRIVER;
    else process.env.CHAT_STORAGE_DRIVER = previousDriver;
    if (uploadRoot) {
      await rm(uploadRoot, { recursive: true, force: true }).catch(() => undefined);
    }
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

  it("director deletes learning data but retains paid finance detached", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    const teachersBefore = await t.db.select().from(teachers);
    const directorsBefore = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.role, "director"));

    const [s11] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(s11).toBeTruthy();

    const seeded = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 2,
      tariffName: "Удаление",
      totalPrice: 2000,
    });

    // Неуспешная попытка — должна удалиться
    const pendingOrderId = `lo_pending_${Date.now()}`;
    const pendingPayId = `pay_pending_${Date.now()}`;
    await t.db.insert(lessonOrders).values({
      id: pendingOrderId,
      organizationId: director.organizationId,
      payerUserId: s11.userId!,
      studentId: "s11",
      tariffId: seeded.tariffId,
      directionId,
      tariffNameSnapshot: "Черновик",
      lessonsCount: 1,
      totalAmount: "500",
      unitPrice: "500",
      status: "awaiting_payment",
    });
    await t.db.insert(payments).values({
      id: pendingPayId,
      organizationId: director.organizationId,
      studentId: "s11",
      orderId: pendingOrderId,
      amount: "500",
      status: "pending",
      provider: "stub",
      idempotencyKey: `idem_pending_${Date.now()}`,
    });

    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });

    const settlementsBefore = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, seeded.paymentId));
    expect(settlementsBefore.length).toBeGreaterThanOrEqual(1);
    const settlementPdfKeys = settlementsBefore.map((d) => d.pdfStorageKey);

    await expect(
      permanentlyDeleteStudent(t.db, anna, {
        id: "s11",
        confirmFullName: s11.fullName,
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      permanentlyDeleteStudent(t.db, director, {
        id: "s11",
        confirmFullName: "Не то имя",
      })
    ).rejects.toMatchObject({ status: 400 });

    const result = await permanentlyDeleteStudent(t.db, director, {
      id: "s11",
      confirmFullName: s11.fullName,
    });
    expect(result.ok).toBe(true);
    expect(result.retained.payments).toBeGreaterThanOrEqual(1);
    expect(result.retained.settlements).toBeGreaterThanOrEqual(1);
    expect(result.deleted.payments).toBeGreaterThanOrEqual(1);
    expect(result.deleted.lessonOrders).toBeGreaterThanOrEqual(1);

    const [gone] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(gone).toBeUndefined();

    // Успешный платёж сохранён и отвязан
    const [keptPay] = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, seeded.paymentId))
      .limit(1);
    expect(keptPay).toBeTruthy();
    expect(keptPay.studentId).toBeNull();
    expect(keptPay.studentNameSnapshot).toBe(s11.fullName);
    expect(keptPay.status).toBe("paid");

    const linkedToDeleted = await t.db
      .select()
      .from(payments)
      .where(eq(payments.studentId, "s11"));
    expect(linkedToDeleted).toHaveLength(0);

    const [pendingGone] = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, pendingPayId))
      .limit(1);
    expect(pendingGone).toBeUndefined();

    const [keptOrder] = await t.db
      .select()
      .from(lessonOrders)
      .where(eq(lessonOrders.id, seeded.orderId))
      .limit(1);
    expect(keptOrder).toBeTruthy();
    expect(keptOrder.studentId).toBeNull();
    expect(keptOrder.payerUserId).toBeNull();
    expect(keptOrder.studentNameSnapshot).toBe(s11.fullName);
    expect(keptOrder.creditLedgerEntryId).toBeNull();

    const settlementsAfter = await t.db
      .select()
      .from(settlementDocuments)
      .where(eq(settlementDocuments.paymentId, seeded.paymentId));
    expect(settlementsAfter.length).toBe(settlementsBefore.length);
    expect(settlementsAfter.map((d) => d.pdfStorageKey)).toEqual(
      settlementPdfKeys
    );

    const ledger = await t.db
      .select()
      .from(studentLessonLedger)
      .where(eq(studentLessonLedger.studentId, "s11"));
    expect(ledger).toHaveLength(0);

    const parts = await t.db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.studentId, "s11"));
    expect(parts).toHaveLength(0);

    const [orphanLesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    expect(orphanLesson).toBeUndefined();

    const studentMem = await t.db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.role, "student"), eq(memberships.userId, s11.userId!))
      );
    expect(studentMem).toHaveLength(0);

    if (s11.userId) {
      const [userRow] = await t.db
        .select()
        .from(users)
        .where(eq(users.id, s11.userId))
        .limit(1);
      expect(userRow).toBeUndefined();
    }

    // Финансы директора всё ещё видят detached payments
    const orphanFinance = await t.db
      .select()
      .from(payments)
      .where(and(isNull(payments.studentId), eq(payments.status, "paid")));
    expect(orphanFinance.some((p) => p.id === seeded.paymentId)).toBe(true);

    const teachersAfter = await t.db.select().from(teachers);
    expect(teachersAfter).toHaveLength(teachersBefore.length);
    const directorsAfter = await t.db
      .select()
      .from(memberships)
      .where(eq(memberships.role, "director"));
    expect(directorsAfter).toHaveLength(directorsBefore.length);

    const [s12] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s12"))
      .limit(1);
    expect(s12).toBeTruthy();
  });

  it("keeps shared schedule when another student remains", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");

    const [s11] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);

    const scheduleId = `sch_wipe_${Date.now()}`;
    await t.db.insert(lessonSchedules).values({
      id: scheduleId,
      organizationId: director.organizationId,
      teacherId: anna.teacherId!,
      weekdays: [1, 3],
      startTime: "17:00",
      durationMin: 60,
      subject: "Физика",
      activeFrom: new Date(),
      status: "active",
    });
    await t.db.insert(lessonScheduleStudents).values([
      { scheduleId, studentId: "s11" },
      { scheduleId, studentId: "s12" },
    ]);

    await permanentlyDeleteStudent(t.db, director, {
      id: "s11",
      confirmFullName: s11.fullName,
    });

    const [sched] = await t.db
      .select()
      .from(lessonSchedules)
      .where(eq(lessonSchedules.id, scheduleId))
      .limit(1);
    expect(sched).toBeTruthy();

    const links = await t.db
      .select()
      .from(lessonScheduleStudents)
      .where(eq(lessonScheduleStudents.scheduleId, scheduleId));
    expect(links).toHaveLength(1);
    expect(links[0]?.studentId).toBe("s12");
  });
});
