import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonOrders,
  payments,
  studentLessonLedger,
} from "@/server/db/schema";
import {
  insertPendingLessonOrder,
} from "@/server/db/seed-commerce";
import { loginWithPassword } from "@/server/services/auth-service";
import { getDirectionBalance } from "@/server/services/lesson-balance";
import {
  confirmPaidFromBank,
} from "@/server/services/lesson-orders-service";
import {
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("lesson orders checkout and confirm", () => {
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

  it("confirmPaidFromBank credits ledger once", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    const seeded = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 4,
      tariffName: "Подтверждение",
    });

    const balance = await getDirectionBalance(
      t.db,
      director.organizationId,
      "s11",
      directionId
    );
    expect(balance.remaining).toBe(4);

    const replay = await confirmPaidFromBank(t.db, director, {
      paymentId: seeded.paymentId,
      amount: seeded.totalAmount,
    });
    expect(replay.alreadyPaid).toBe(true);

    const ledger = await t.db
      .select()
      .from(studentLessonLedger)
      .where(
        and(
          eq(studentLessonLedger.studentId, "s11"),
          eq(studentLessonLedger.reason, "purchase")
        )
      );
    expect(ledger.filter((r) => r.orderId === seeded.orderId)).toHaveLength(1);
  });

  it("reuses the same pending order when checkout idempotency key collides", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await asRole(t.db, "s11@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    const base = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 2,
      tariffId: "tar_checkout_base",
    });

    const orderId = "lord_idem_test";
    const paymentId = "pay_idem_test";
    const now = new Date();
    await insertPendingLessonOrder(t.db, {
      orderId,
      organizationId: director.organizationId,
      studentId: "s11",
      payerUserId: student.userId!,
      tariffId: base.tariffId,
      optionId: base.optionId,
      directionId,
      tariffName: "Повтор checkout",
      lessonsCount: 2,
      totalAmount: "2000",
      features: ["individual_lessons"],
      createdAt: now,
      paymentId,
    });

    const [orderBefore] = await t.db
      .select()
      .from(lessonOrders)
      .where(eq(lessonOrders.id, orderId));
    expect(orderBefore.status).toBe("awaiting_payment");

    const pendingPayments = await t.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.studentId, "s11"), eq(payments.status, "pending"))
      );
    expect(pendingPayments.length).toBeGreaterThanOrEqual(1);

    const confirmed = await confirmPaidFromBank(t.db, director, {
      paymentId,
      amount: 2000,
    });
    expect(confirmed.alreadyPaid).toBe(false);

    const [orderAfter] = await t.db
      .select()
      .from(lessonOrders)
      .where(eq(lessonOrders.id, orderId));
    expect(orderAfter.status).toBe("paid");
    expect(orderAfter.creditLedgerEntryId).toBeTruthy();
  });

  it("does not credit balance until payment is confirmed", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const student = await asRole(t.db, "s11@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    const base = await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 2,
      tariffId: "tar_pending_only",
    });

    const paymentId = "pay_still_pending";
    const orderId = "lord_still_pending";
    await insertPendingLessonOrder(t.db, {
      orderId,
      organizationId: director.organizationId,
      studentId: "s11",
      payerUserId: student.userId!,
      tariffId: base.tariffId,
      optionId: base.optionId,
      directionId,
      tariffName: "Только pending",
      lessonsCount: 3,
      totalAmount: "3000",
      features: ["individual_lessons"],
      createdAt: new Date(),
      paymentId,
    });

    const before = await getDirectionBalance(
      t.db,
      director.organizationId,
      "s11",
      directionId
    );
    expect(before.remaining).toBe(2);

    const [pay] = await t.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(pay.status).toBe("pending");
  });
});