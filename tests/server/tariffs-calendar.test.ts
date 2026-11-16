import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  buildMonthGrid,
  dateKeyLocal,
  parseIsoToLocalDateKey,
} from "@/lib/calendar-month";
import { resolveAuthContext } from "@/server/authz/context";
import { payments, tariffPurchaseOptions } from "@/server/db/schema";
import { insertPendingLessonOrder } from "@/server/db/seed-commerce";
import { loginWithPassword } from "@/server/services/auth-service";
import { resolveLearningAccess } from "@/server/services/learning-access";
import {
  confirmPaidFromBank,
  createCheckout,
} from "@/server/services/lesson-orders-service";
import { upsertTariff } from "@/server/services/tariffs-service";
import { physicsDirectionId } from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("tariffs + calendar helpers + unassigned", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("month grid has 42 cells and local date keys avoid UTC day shift for evening lessons", () => {
    const anchor = fromAppWall(2026, 3, 1, 12, 0);
    const cells = buildMonthGrid(anchor, fromAppWall(2026, 3, 15, 12, 0));
    expect(cells).toHaveLength(42);
    expect(cells.filter((c) => c.inMonth).length).toBe(31);

    const evening = fromAppWall(2026, 3, 10, 20, 0, 0);
    expect(parseIsoToLocalDateKey(evening.toISOString())).toBe("2026-03-10");
    expect(dateKeyLocal(evening)).toBe("2026-03-10");
  });

  it("seed has unassigned active students for direkciya alert", async () => {
    const t = await createTestDb();
    close = t.close;
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);
    const data = await buildBootstrap(t.db, ctx);
    const unassigned = data.students.filter(
      (s) => !s.teacherId && s.status === "active"
    );
    expect(unassigned.length).toBeGreaterThan(0);
  });

  it("teacher bio is exposed in bootstrap; unpaid tariff blocks homework access", async () => {
    const t = await createTestDb();
    close = t.close;

    const dir = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const dirCtx = await resolveAuthContext(t.db, dir.session.rawToken);
    const { buildBootstrap } = await import(
      "@/server/services/bootstrap-service"
    );
    const boot = await buildBootstrap(t.db, dirCtx);
    const anna = boot.teachers.find((x) => x.id === "t1");
    expect(anna?.bio).toBeTruthy();

    const directionId = await physicsDirectionId(t.db, dirCtx.organizationId);

    // s2 has pending unpaid order in seed
    const access = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s2",
      "homework",
      directionId
    );
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("no_assignment");

    // s1 paid+active
    const ok = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s1",
      "homework",
      directionId
    );
    expect(ok.allowed).toBe(true);
  });

  it("checkout is idempotent; confirm paid opens access", async () => {
    const t = await createTestDb();
    close = t.close;

    const dir = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const dirCtx = await resolveAuthContext(t.db, dir.session.rawToken);
    const directionId = await physicsDirectionId(t.db, dirCtx.organizationId);

    const tariff = await upsertTariff(t.db, dirCtx, {
      directionId,
      name: "Тест-тариф",
      features: ["individual_lessons", "homework"],
      purchaseOptions: [
        { lessonsCount: 8, totalPrice: 1000, sortOrder: 0, isActive: true },
      ],
    });
    const [option] = await t.db
      .select()
      .from(tariffPurchaseOptions)
      .where(
        and(
          eq(tariffPurchaseOptions.organizationId, dirCtx.organizationId),
          eq(tariffPurchaseOptions.tariffId, tariff.id)
        )
      )
      .limit(1);
    expect(option).toBeTruthy();

    const studentLogin = await loginWithPassword(t.db, {
      email: "s11@demo.local",
      password: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(
      t.db,
      studentLogin.session.rawToken
    );

    const orderId = `lord_cal_${randomBytes(3).toString("hex")}`;
    const paymentId = `pay_cal_${randomBytes(3).toString("hex")}`;
    const now = new Date();
    await insertPendingLessonOrder(t.db, {
      orderId,
      organizationId: dirCtx.organizationId,
      studentId: "s11",
      payerUserId: studentCtx.userId!,
      tariffId: tariff.id,
      optionId: option!.id,
      directionId,
      tariffName: "Тест-тариф",
      lessonsCount: 8,
      totalAmount: "1000",
      features: ["individual_lessons", "homework"],
      createdAt: now,
      paymentId,
    });
    await t.db
      .update(payments)
      .set({
        idempotencyKey: `checkout:s11:${option!.id}`,
        metadata: {
          source: "student_checkout",
          checkoutUrl: "https://stub.tochka/checkout",
        },
        updatedAt: now,
      })
      .where(eq(payments.id, paymentId));

    const a = await createCheckout(t.db, studentCtx, {
      tariffId: tariff.id,
      optionId: option!.id,
    });
    const b = await createCheckout(t.db, studentCtx, {
      tariffId: tariff.id,
      optionId: option!.id,
    });
    expect(a.paymentId).toBe(b.paymentId);
    expect(a.orderId).toBe(b.orderId);
    expect(a.alreadyPending).toBe(true);

    let access = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.allowed).toBe(false);

    await confirmPaidFromBank(t.db, dirCtx, {
      paymentId: a.paymentId,
      amount: 1000,
      raw: { test: "calendar" },
    });

    access = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.allowed).toBe(true);
  });

  it("student without active tariff can still login", async () => {
    const t = await createTestDb();
    close = t.close;
    const login = await loginWithPassword(t.db, {
      email: "s11@demo.local",
      password: DEMO_PASSWORD,
    });
    expect(login.session.rawToken).toBeTruthy();
  });
});