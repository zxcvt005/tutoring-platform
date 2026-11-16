import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { getIncomeOverview } from "@/server/services/income-service";
import { physicsDirectionId, seedPaidLessons } from "../helpers/commerce";
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

  it("aggregates paid lesson orders without duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);

    const purchased = await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 8,
      tariffName: "Доход-пакет",
      totalPrice: 7000,
    });

    const overview = await getIncomeOverview(t.db, director);
    expect(overview.months.length).toBeGreaterThan(0);

    const ourPayment = overview.months
      .flatMap((m) => m.payments)
      .find((p) => p.id === purchased.paymentId);
    expect(ourPayment).toBeTruthy();
    expect(ourPayment!.amount).toBe(7000);
    expect(ourPayment!.status).toBe("paid");
    expect(ourPayment!.tariffName).toBe("Доход-пакет");

    const monthOfOurs = overview.months.find((m) =>
      m.payments.some((p) => p.id === purchased.paymentId)
    )!;
    expect(monthOfOurs.revenue).toBeGreaterThanOrEqual(7000);
    expect(monthOfOurs.purchasedTariffs).toBeGreaterThanOrEqual(1);
    expect(monthOfOurs.averagePurchaseAmount).toBe(
      Math.round(
        (monthOfOurs.revenue / monthOfOurs.purchasedTariffs) * 100
      ) / 100
    );

    const ids = monthOfOurs.payments.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});