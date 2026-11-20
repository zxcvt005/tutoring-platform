import { eq } from "drizzle-orm";
import { describe, it, expect, afterEach } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students, tariffPurchaseOptions } from "@/server/db/schema";
import { insertPendingLessonOrder } from "@/server/db/seed-commerce";
import { loginWithPassword } from "@/server/services/auth-service";
import { createCheckout } from "@/server/services/lesson-orders-service";
import { upsertStudent } from "@/server/services/platform-mutations";
import { upsertTariff } from "@/server/services/tariffs-service";
import { physicsDirectionId } from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("assigned tariff checkout gate", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function seedTwoTariffs(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const dir = await loginWithPassword(db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const dirCtx = await resolveAuthContext(db, dir.session.rawToken);
    const directionId = await physicsDirectionId(db, dirCtx.organizationId);

    const ege = await upsertTariff(db, dirCtx, {
      directionId,
      name: "ЕГЭ — физика",
      features: ["individual_lessons"],
      purchaseOptions: [
        { lessonsCount: 4, totalPrice: 4000, sortOrder: 0, isActive: true },
        { lessonsCount: 8, totalPrice: 7000, sortOrder: 1, isActive: true },
      ],
    });
    const oge = await upsertTariff(db, dirCtx, {
      directionId,
      name: "ОГЭ — физика",
      features: ["individual_lessons"],
      purchaseOptions: [
        { lessonsCount: 4, totalPrice: 3000, sortOrder: 0, isActive: true },
      ],
    });

    const egeOptions = await db
      .select()
      .from(tariffPurchaseOptions)
      .where(eq(tariffPurchaseOptions.tariffId, ege.id));
    const ogeOptions = await db
      .select()
      .from(tariffPurchaseOptions)
      .where(eq(tariffPurchaseOptions.tariffId, oge.id));

    return {
      dirCtx,
      directionId,
      egeId: ege.id,
      ogeId: oge.id,
      egeOptionId: egeOptions.find((o) => o.lessonsCount === 4)!.id,
      egeOptionId2: egeOptions.find((o) => o.lessonsCount === 8)!.id,
      ogeOptionId: ogeOptions[0]!.id,
    };
  }

  async function studentCtxFor(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email = "s11@demo.local"
  ) {
    const studentLogin = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, studentLogin.session.rawToken);
  }

  /** Готовит reusable pending checkout без реального Tochka. */
  async function seedReusableCheckout(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    args: {
      organizationId: string;
      studentId: string;
      payerUserId: string;
      tariffId: string;
      optionId: string;
      directionId: string;
      tariffName: string;
      lessonsCount: number;
      totalAmount: string;
    }
  ) {
    const orderId = `lord_test_${args.optionId.slice(-6)}`;
    const paymentId = `pay_test_${args.optionId.slice(-6)}`;
    const now = new Date();
    await insertPendingLessonOrder(db, {
      orderId,
      organizationId: args.organizationId,
      studentId: args.studentId,
      payerUserId: args.payerUserId,
      tariffId: args.tariffId,
      optionId: args.optionId,
      directionId: args.directionId,
      tariffName: args.tariffName,
      lessonsCount: args.lessonsCount,
      totalAmount: args.totalAmount,
      features: ["individual_lessons"],
      createdAt: now,
      paymentId,
    });
    const { payments } = await import("@/server/db/schema");
    await db
      .update(payments)
      .set({
        idempotencyKey: `checkout:${args.studentId}:${args.optionId}`,
        metadata: {
          source: "student_checkout",
          checkoutUrl: "https://stub.tochka/checkout",
        },
        updatedAt: now,
      })
      .where(eq(payments.id, paymentId));
  }

  it("unassigned student can checkout any active tariff", async () => {
    const t = await createTestDb();
    close = t.close;
    const seeded = await seedTwoTariffs(t.db);
    const studentCtx = await studentCtxFor(t.db);

    await t.db
      .update(students)
      .set({ assignedTariffId: null })
      .where(eq(students.id, "s11"));

    await seedReusableCheckout(t.db, {
      organizationId: seeded.dirCtx.organizationId,
      studentId: "s11",
      payerUserId: studentCtx.userId!,
      tariffId: seeded.ogeId,
      optionId: seeded.ogeOptionId,
      directionId: seeded.directionId,
      tariffName: "ОГЭ — физика",
      lessonsCount: 4,
      totalAmount: "3000",
    });

    const checkout = await createCheckout(t.db, studentCtx, {
      tariffId: seeded.ogeId,
      optionId: seeded.ogeOptionId,
    });
    expect(checkout.alreadyPending).toBe(true);
    expect(checkout.checkoutUrl).toContain("stub.tochka");
  });

  it("assigned student can buy packages inside assigned tariff only", async () => {
    const t = await createTestDb();
    close = t.close;
    const seeded = await seedTwoTariffs(t.db);

    await upsertStudent(t.db, seeded.dirCtx, {
      id: "s11",
      fullName: "Ученик 11",
      status: "active",
      teacherId: "t1",
      assignedTariffId: seeded.egeId,
    });

    const studentCtx = await studentCtxFor(t.db);

    await seedReusableCheckout(t.db, {
      organizationId: seeded.dirCtx.organizationId,
      studentId: "s11",
      payerUserId: studentCtx.userId!,
      tariffId: seeded.egeId,
      optionId: seeded.egeOptionId,
      directionId: seeded.directionId,
      tariffName: "ЕГЭ — физика",
      lessonsCount: 4,
      totalAmount: "4000",
    });
    await seedReusableCheckout(t.db, {
      organizationId: seeded.dirCtx.organizationId,
      studentId: "s11",
      payerUserId: studentCtx.userId!,
      tariffId: seeded.egeId,
      optionId: seeded.egeOptionId2,
      directionId: seeded.directionId,
      tariffName: "ЕГЭ — физика",
      lessonsCount: 8,
      totalAmount: "7000",
    });

    const ok = await createCheckout(t.db, studentCtx, {
      tariffId: seeded.egeId,
      optionId: seeded.egeOptionId,
    });
    expect(ok.paymentId).toBeTruthy();

    const otherPackage = await createCheckout(t.db, studentCtx, {
      tariffId: seeded.egeId,
      optionId: seeded.egeOptionId2,
    });
    expect(otherPackage.paymentId).toBeTruthy();

    await expect(
      createCheckout(t.db, studentCtx, {
        tariffId: seeded.ogeId,
        optionId: seeded.ogeOptionId,
      })
    ).rejects.toThrow(/назначен другой тариф/i);
  });

  it("bootstrap exposes assignedTariffId and changing it updates the gate", async () => {
    const t = await createTestDb();
    close = t.close;
    const seeded = await seedTwoTariffs(t.db);
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );

    await upsertStudent(t.db, seeded.dirCtx, {
      id: "s11",
      fullName: "Ученик 11",
      status: "active",
      teacherId: "t1",
      assignedTariffId: seeded.egeId,
    });

    const studentCtx = await studentCtxFor(t.db);
    const boot = await buildBootstrap(t.db, studentCtx);
    const self = boot.students.find((s) => s.id === "s11");
    expect(self?.assignedTariffId).toBe(seeded.egeId);

    await upsertStudent(t.db, seeded.dirCtx, {
      id: "s11",
      fullName: "Ученик 11",
      status: "active",
      teacherId: "t1",
      assignedTariffId: seeded.ogeId,
    });

    await expect(
      createCheckout(t.db, studentCtx, {
        tariffId: seeded.egeId,
        optionId: seeded.egeOptionId,
      })
    ).rejects.toThrow(/назначен другой тариф/i);

    await seedReusableCheckout(t.db, {
      organizationId: seeded.dirCtx.organizationId,
      studentId: "s11",
      payerUserId: studentCtx.userId!,
      tariffId: seeded.ogeId,
      optionId: seeded.ogeOptionId,
      directionId: seeded.directionId,
      tariffName: "ОГЭ — физика",
      lessonsCount: 4,
      totalAmount: "3000",
    });

    const ok = await createCheckout(t.db, studentCtx, {
      tariffId: seeded.ogeId,
      optionId: seeded.ogeOptionId,
    });
    expect(ok.paymentId).toBeTruthy();
  });

  it("teacher cannot assign tariff via API and does not see assignment in bootstrap", async () => {
    const t = await createTestDb();
    close = t.close;
    const seeded = await seedTwoTariffs(t.db);
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );

    await upsertStudent(t.db, seeded.dirCtx, {
      id: "s1",
      fullName: "Алиса Иванова",
      status: "active",
      teacherId: "t1",
      assignedTariffId: seeded.egeId,
    });

    const teacherLogin = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacherCtx = await resolveAuthContext(
      t.db,
      teacherLogin.session.rawToken
    );

    await expect(
      upsertStudent(t.db, teacherCtx, {
        id: "s1",
        fullName: "Алиса Иванова",
        status: "active",
        teacherId: teacherCtx.teacherId!,
        assignedTariffId: seeded.ogeId,
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      upsertStudent(t.db, teacherCtx, {
        id: "s1",
        fullName: "Алиса Иванова",
        status: "active",
        teacherId: teacherCtx.teacherId!,
        assignedTariffId: null,
      })
    ).rejects.toMatchObject({ status: 403 });

    const [row] = await t.db
      .select({ assignedTariffId: students.assignedTariffId })
      .from(students)
      .where(eq(students.id, "s1"))
      .limit(1);
    expect(row?.assignedTariffId).toBe(seeded.egeId);

    // Без поля assignedTariffId преподаватель по-прежнему может сохранить карточку.
    await upsertStudent(t.db, teacherCtx, {
      id: "s1",
      fullName: "Алиса Иванова",
      status: "active",
      teacherId: teacherCtx.teacherId!,
    });
    const [rowAfter] = await t.db
      .select({ assignedTariffId: students.assignedTariffId })
      .from(students)
      .where(eq(students.id, "s1"))
      .limit(1);
    expect(rowAfter?.assignedTariffId).toBe(seeded.egeId);

    const boot = await buildBootstrap(t.db, teacherCtx);
    const student = boot.students.find((s) => s.id === "s1");
    expect(student?.assignedTariffId).toBeUndefined();
  });

  it("press can assign tariff and sees active tariffs for selection", async () => {
    const t = await createTestDb();
    close = t.close;
    const seeded = await seedTwoTariffs(t.db);
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );

    const pressLogin = await loginWithPassword(t.db, {
      email: "press@demo.local",
      password: DEMO_PASSWORD,
    });
    const pressCtx = await resolveAuthContext(t.db, pressLogin.session.rawToken);

    await upsertStudent(t.db, pressCtx, {
      id: "s11",
      fullName: "Ученик 11",
      status: "active",
      teacherId: "t1",
      assignedTariffId: seeded.egeId,
    });

    const [row] = await t.db
      .select({ assignedTariffId: students.assignedTariffId })
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(row?.assignedTariffId).toBe(seeded.egeId);

    const boot = await buildBootstrap(t.db, pressCtx);
    expect(boot.payments).toEqual([]);
    expect(boot.lessonOrders ?? []).toEqual([]);
    expect(boot.tariffs.some((x) => x.id === seeded.egeId)).toBe(true);
    expect(boot.students.find((s) => s.id === "s11")?.assignedTariffId).toBe(
      seeded.egeId
    );
  });
});
