import { afterEach, describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { getIncomeOverview } from "@/server/services/income-service";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("income overview", () => {
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

  it("aggregates paid payments and current assignments without duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const tariff = await upsertTariff(t.db, director, {
      name: "Доход-пакет",
      price: 7000,
      durationDays: 30,
      lessonsLimit: 8,
      weeklyFrequency: 2,
    });

    const endsSoon = fromAppWall(2026, 10, 24, 12, 0, 0);
    const assigned = await assignTariffToStudent(t.db, director, {
      studentId: "s1",
      tariffId: tariff.id,
      startsAt: fromAppWall(2026, 10, 1, 12, 0, 0).toISOString(),
      endsAt: endsSoon.toISOString(),
    });
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: assigned.paymentId,
      reason: "Фиксация для теста доходов",
    });

    const overview = await getIncomeOverview(t.db, director);
    expect(overview.months.length).toBeGreaterThan(0);

    const ourPayment = overview.months
      .flatMap((m) => m.payments)
      .find((p) => p.id === assigned.paymentId);
    expect(ourPayment).toBeTruthy();
    expect(ourPayment!.amount).toBe(7000);
    expect(ourPayment!.status).toBe("paid");
    expect(ourPayment!.tariffName).toBe("Доход-пакет");

    const monthOfOurs = overview.months.find((m) =>
      m.payments.some((p) => p.id === assigned.paymentId)
    )!;
    expect(monthOfOurs.revenue).toBeGreaterThanOrEqual(7000);
    expect(monthOfOurs.purchasedTariffs).toBeGreaterThanOrEqual(1);
    // Средняя = сумма paid / число paid; один платёж не учитывается дважды
    expect(monthOfOurs.averagePurchaseAmount).toBe(
      Math.round(
        (monthOfOurs.revenue / monthOfOurs.purchasedTariffs) * 100
      ) / 100
    );

    const s1Rows = overview.current.byTariff.flatMap((g) =>
      g.students.filter((s) => s.studentId === "s1")
    );
    expect(s1Rows.length).toBeLessThanOrEqual(1);
  });

  it("forbids students from income overview", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    await expect(getIncomeOverview(t.db, student)).rejects.toMatchObject({
      status: 403,
    });
  });
});
