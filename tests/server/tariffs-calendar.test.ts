import { describe, it, expect, afterEach } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  buildMonthGrid,
  dateKeyLocal,
  parseIsoToLocalDateKey,
} from "@/lib/calendar-month";
import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { resolveLearningAccess } from "@/server/services/learning-access";
import {
  assignTariffToStudent,
  adminMarkPaymentPaid,
  studentRequestPayment,
  upsertTariff,
} from "@/server/services/tariffs-service";
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

    // s2 has pending unpaid assignment in seed
    const access = await resolveLearningAccess(t.db, dirCtx.organizationId, "s2", "homework");
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("unpaid");

    // s1 paid+active
    const ok = await resolveLearningAccess(t.db, dirCtx.organizationId, "s1", "homework");
    expect(ok.allowed).toBe(true);
  });

  it("payment request is idempotent; admin mark paid opens access", async () => {
    const t = await createTestDb();
    close = t.close;

    const dir = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const dirCtx = await resolveAuthContext(t.db, dir.session.rawToken);

    const tariff = await upsertTariff(t.db, dirCtx, {
      name: "Тест-тариф",
      price: 1000,
      durationDays: 14,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(t.db, dirCtx, {
      studentId: "s11",
      tariffId: tariff.id,
    });

    const studentLogin = await loginWithPassword(t.db, {
      email: "s11@demo.local",
      password: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(
      t.db,
      studentLogin.session.rawToken
    );

    const a = await studentRequestPayment(t.db, studentCtx, assigned.id);
    const b = await studentRequestPayment(t.db, studentCtx, assigned.id);
    expect(a.paymentId).toBe(b.paymentId);
    expect(a.checkoutUrl).toBeNull();

    let access = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s11",
      "homework"
    );
    expect(access.allowed).toBe(false);

    await adminMarkPaymentPaid(t.db, dirCtx, {
      paymentId: assigned.paymentId,
      reason: "Тестовая оплата наличными",
    });

    access = await resolveLearningAccess(
      t.db,
      dirCtx.organizationId,
      "s11",
      "homework"
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
    const ctx = await resolveAuthContext(t.db, login.session.rawToken);
    expect(ctx.role).toBe("student");
    expect(ctx.studentId).toBe("s11");
  });
});
