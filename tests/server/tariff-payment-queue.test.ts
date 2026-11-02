import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthContext } from "@/server/authz/context";
import { resolveAuthContext } from "@/server/authz/context";
import {
  payments,
  studentTariffAssignments,
  tariffLessonLedger,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  findDebitAssignment,
  getAssignmentBalance,
} from "@/server/services/lesson-balance";
import { resolveLearningAccess } from "@/server/services/learning-access";
import { setAttendance, upsertLesson } from "@/server/services/platform-mutations";
import {
  adminMarkPaymentPaid,
  adminRejectPayment,
  assignTariffToStudent,
  setStudentPurchaseTariff,
  studentStartCheckout,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("tariff payment review and queue", () => {
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
    lessonsLimit: number,
    name = `Пакет ${lessonsLimit}`
  ) {
    const tariff = await upsertTariff(db, director, {
      name,
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
      paymentId: assigned.paymentId!,
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
      subject: "Оплата",
    });
    return created.id;
  }

  it("checkout creates a pending review request without auto-confirm", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const first = await studentStartCheckout(t.db, student);
    expect(first.status).toBe("pending");
    expect(first.alreadyPending).toBe(false);
    expect(first.checkoutUrl).toContain("tochkaplace.com");
    const [pay] = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, first.paymentId));
    expect(pay.status).toBe("pending");
    expect(pay.paidAt).toBeNull();
  });

  it("return or reload does not duplicate the pending request", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const a = await studentStartCheckout(t.db, student);
    const b = await studentStartCheckout(t.db, student);
    expect(a.paymentId).toBe(b.paymentId);
    expect(b.alreadyPending).toBe(true);
    const pending = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.studentId, "s11"), eq(payments.status, "pending"))
      );
    expect(pending).toHaveLength(1);
  });

  it("rejects a second active pending request for the same student", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    await studentStartCheckout(t.db, student);
    await expect(
      assignTariffToStudent(t.db, director, {
        studentId: "s11",
        tariffId: (await upsertTariff(t.db, director, {
          name: "Другой",
          price: 2000,
          durationDays: 28,
          lessonsLimit: 8,
          weeklyFrequency: 2,
        })).id,
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps a rejected request in history and allows a retry", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const first = await studentStartCheckout(t.db, student);
    const current = await findDebitAssignment(
      t.db,
      director.organizationId,
      "s11"
    );
    const before = current
      ? await getAssignmentBalance(
          t.db,
          current.id,
          current.lessonsLimitSnapshot
        )
      : null;
    await adminRejectPayment(t.db, director, {
      paymentId: first.paymentId,
      reason: "Деньги не поступили",
    });
    const [rejected] = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, first.paymentId));
    expect(rejected.status).toBe("rejected");
    const after = current
      ? await getAssignmentBalance(
          t.db,
          current.id,
          current.lessonsLimitSnapshot
        )
      : null;
    expect(after?.remaining).toBe(before?.remaining);
    const retry = await studentStartCheckout(t.db, student);
    expect(retry.paymentId).not.toBe(first.paymentId);
    expect(retry.status).toBe("pending");
  });

  it("confirm creates exactly one paid payment and one paid assignment", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const tariff = await upsertTariff(t.db, director, {
      name: "Новый ученик",
      price: 3000,
      durationDays: 28,
      lessonsLimit: 4,
      weeklyFrequency: 1,
    });
    const assigned = await assignTariffToStudent(t.db, director, {
      studentId: "s11",
      tariffId: tariff.id,
    });
    const paid = await adminMarkPaymentPaid(t.db, director, {
      paymentId: assigned.paymentId!,
      reason: "Поступление проверено",
    });
    expect(paid.alreadyPaid).toBe(false);
    const replay = await adminMarkPaymentPaid(t.db, director, {
      paymentId: assigned.paymentId!,
      reason: "Повтор",
    });
    expect(replay.alreadyPaid).toBe(true);
    const paidRows = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.studentId, "s11"), eq(payments.status, "paid"))
      );
    expect(paidRows).toHaveLength(1);
    const active = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.studentId, "s11"),
          eq(studentTariffAssignments.status, "active"),
          eq(studentTariffAssignments.paymentStatus, "paid")
        )
      );
    expect(active).toHaveLength(1);
  });

  it("queues a newly confirmed tariff while the old one is still active", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const first = await paidPackage(t.db, director, "s11", 2, "Текущий");
    const student = await asRole(t.db, "s11@demo.local");
    const checkout = await studentStartCheckout(t.db, student);
    const confirmed = await adminMarkPaymentPaid(t.db, director, {
      paymentId: checkout.paymentId,
      reason: "Вторая оплата проверена",
    });
    expect(confirmed.queued).toBe(true);
    const debiting = await findDebitAssignment(
      t.db,
      director.organizationId,
      "s11"
    );
    expect(debiting?.id).toBe(first.assigned.id);
    const queued = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.studentId, "s11"),
          eq(studentTariffAssignments.status, "queued")
        )
      );
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(checkout.assignmentId);
  });

  it("activates the queued tariff after the old package reaches -1", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    await paidPackage(t.db, director, "s11", 1, "Короткий");
    const longer = await upsertTariff(t.db, director, {
      name: "Длинный",
      price: 4000,
      durationDays: 28,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    await setStudentPurchaseTariff(t.db, director, {
      studentId: "s11",
      tariffId: longer.id,
      reason: "Согласован переход на пакет 8",
    });
    const student = await asRole(t.db, "s11@demo.local");
    const checkout = await studentStartCheckout(t.db, student);
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: checkout.paymentId,
      reason: "Очередь",
    });
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 10),
      "s11",
      "present"
    );
    let debiting = await findDebitAssignment(
      t.db,
      director.organizationId,
      "s11"
    );
    expect(debiting?.id).not.toBe(checkout.assignmentId);
    await setAttendance(
      t.db,
      anna,
      await makeLesson(t.db, anna, ["s11"], 11),
      "s11",
      "present"
    );
    debiting = await findDebitAssignment(
      t.db,
      director.organizationId,
      "s11"
    );
    expect(debiting?.id).toBe(checkout.assignmentId);
    const bal = await getAssignmentBalance(
      t.db,
      checkout.assignmentId,
      debiting?.lessonsLimitSnapshot
    );
    expect(bal.remaining).toBe(7);
  });

  it("director purchase assignment does not create a payment until checkout", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const tariff = await upsertTariff(t.db, director, {
      name: "Назначен без оплаты",
      price: 2500,
      durationDays: 28,
      lessonsLimit: 4,
      weeklyFrequency: 1,
    });
    const assigned = await assignTariffToStudent(t.db, director, {
      studentId: "s11",
      tariffId: tariff.id,
      mode: "purchase",
    });
    expect(assigned.paymentId).toBeNull();
    const pending = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.studentId, "s11"), eq(payments.status, "pending"))
      );
    expect(pending).toHaveLength(0);
    const student = await asRole(t.db, "s11@demo.local");
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );
    const boot = await buildBootstrap(t.db, student);
    expect(boot.tariffs.some((item) => item.id === tariff.id)).toBe(true);
    const checkout = await studentStartCheckout(t.db, student);
    expect(checkout.status).toBe("pending");
    const created = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, checkout.paymentId));
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe("pending");
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: checkout.paymentId,
      reason: "Оплата после Аудитории",
    });
    const active = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.studentId, "s11"),
          eq(studentTariffAssignments.status, "active"),
          eq(studentTariffAssignments.paymentStatus, "paid")
        )
      );
    expect(active).toHaveLength(1);
  });

  it("changing the future purchase tariff does not rewrite old assignments", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const first = await paidPackage(t.db, director, "s11", 2, "Старый снимок");
    const other = await upsertTariff(t.db, director, {
      name: "Новый каталог",
      price: 9999,
      durationDays: 30,
      lessonsLimit: 20,
      weeklyFrequency: 3,
    });
    await setStudentPurchaseTariff(t.db, director, {
      studentId: "s11",
      tariffId: other.id,
      reason: "Смена тарифа для будущей покупки",
    });
    const [old] = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(eq(studentTariffAssignments.id, first.assigned.id!));
    expect(old.tariffNameSnapshot).toBe("Старый снимок");
    expect(Number(old.priceSnapshot)).toBe(1000);
    expect(old.lessonsLimitSnapshot).toBe(2);
    const ledger = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.assignmentId, first.assigned.id!));
    expect(ledger).toHaveLength(0);
  });

  it("does not create two simultaneously debiting tariffs", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const checkout = await studentStartCheckout(t.db, student);
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: checkout.paymentId,
      reason: "Очередь",
    });
    const activePaid = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.studentId, "s11"),
          eq(studentTariffAssignments.status, "active"),
          eq(studentTariffAssignments.paymentStatus, "paid")
        )
      );
    expect(activePaid).toHaveLength(1);
  });

  it("parallel checkout and confirm requests do not duplicate", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const [a, b] = await Promise.all([
      studentStartCheckout(t.db, student),
      studentStartCheckout(t.db, student),
    ]);
    expect(a.paymentId).toBe(b.paymentId);
    const pending = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.studentId, "s11"), eq(payments.status, "pending"))
      );
    expect(pending).toHaveLength(1);

    const [c1, c2] = await Promise.all([
      adminMarkPaymentPaid(t.db, director, {
        paymentId: a.paymentId,
        reason: "Параллельное подтверждение 1",
      }),
      adminMarkPaymentPaid(t.db, director, {
        paymentId: a.paymentId,
        reason: "Параллельное подтверждение 2",
      }),
    ]);
    expect([c1.alreadyPaid, c2.alreadyPaid].sort()).toEqual([false, true]);
    const paidRows = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.assignmentId, a.assignmentId), eq(payments.status, "paid"))
      );
    expect(paidRows).toHaveLength(1);
    const assignments = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(eq(studentTariffAssignments.id, a.assignmentId));
    expect(assignments).toHaveLength(1);
    expect(assignments[0].paymentStatus).toBe("paid");
  });

  it("forbids a student from confirming payment or changing another tariff", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const assigned = await paidPackage(t.db, director, "s11", 2);
    const student = await asRole(t.db, "s11@demo.local");
    const checkout = await studentStartCheckout(t.db, student);
    await expect(
      adminMarkPaymentPaid(t.db, student, {
        paymentId: checkout.paymentId,
        reason: "Сам себе подтвердил",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setStudentPurchaseTariff(t.db, student, {
        studentId: "s1",
        tariffId: assigned.tariff.id,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assignTariffToStudent(t.db, student, {
        studentId: "s1",
        tariffId: assigned.tariff.id,
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("pending request keeps original snapshots after future-tariff change", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await paidPackage(t.db, director, "s11", 2, "Заявка снимок");
    const student = await asRole(t.db, "s11@demo.local");
    const checkout = await studentStartCheckout(t.db, student);
    const other = await upsertTariff(t.db, director, {
      name: "После смены",
      price: 7777,
      durationDays: 14,
      lessonsLimit: 3,
      weeklyFrequency: 1,
    });
    await setStudentPurchaseTariff(t.db, director, {
      studentId: "s11",
      tariffId: other.id,
      reason: "Куратор согласовал другой тариф",
    });
    const [asg] = await t.db
      .select()
      .from(studentTariffAssignments)
      .where(eq(studentTariffAssignments.id, checkout.assignmentId));
    expect(asg.tariffNameSnapshot).toBe("Заявка снимок");
    expect(Number(asg.priceSnapshot)).toBe(1000);
    expect(asg.lessonsLimitSnapshot).toBe(2);
    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework"
    );
    expect(access.allowed).toBe(true);
  });
});
