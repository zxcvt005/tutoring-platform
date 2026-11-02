import { describe, expect, it } from "vitest";

import { studentTariffLabel } from "@/lib/tariff-package";
import type { StudentTariffAssignment } from "@/lib/types";

describe("studentTariffLabel", () => {
  it("falls back to the purchase tariff when there is no assignment", () => {
    const labeled = studentTariffLabel({
      assignments: [],
      studentId: "s1",
      tariffs: [{ id: "tar_1", name: "Стандарт" }],
      purchaseTariffId: "tar_1",
    });
    expect(labeled?.name).toBe("Стандарт");
    expect(labeled?.awaitingPayment).toBe(true);
    expect(labeled?.assignment).toBeNull();
  });

  it("prefers a paid current assignment over the purchase tariff", () => {
    const assignment = {
      id: "sta_1",
      studentId: "s1",
      tariffId: "tar_old",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
      priceSnapshot: 8000,
      currency: "RUB" as const,
      status: "active" as const,
      paymentStatus: "paid" as const,
      lessonsLimitSnapshot: 8,
      tariffName: "Текущий",
    } satisfies StudentTariffAssignment;
    const labeled = studentTariffLabel({
      assignments: [assignment],
      studentId: "s1",
      tariffs: [{ id: "tar_new", name: "Новый" }],
      purchaseTariffId: "tar_new",
    });
    expect(labeled?.name).toBe("Текущий");
    expect(labeled?.awaitingPayment).toBe(false);
  });
});
