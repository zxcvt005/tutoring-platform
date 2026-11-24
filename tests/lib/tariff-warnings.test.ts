import { describe, expect, it } from "vitest";

import {
  allowsLearningMaterials,
  assignmentTariffAlert,
  canDebitFromRemaining,
  tariffBalanceAlert,
} from "@/lib/tariff-warnings";

describe("tariff balance warnings", () => {
  it("shows the remaining-2 warning", () => {
    const alert = tariffBalanceAlert(2);
    expect(alert.tone).toBe("warn2");
    expect(alert.message).toBe("Скоро закончатся занятия — осталось 2");
    expect(alert.needsRenewal).toBe(false);
    expect(alert.showRenewCta).toBe(true);
    expect(alert.allowsDebit).toBe(true);
    expect(alert.allowsLearning).toBe(true);
  });

  it("shows the remaining-1 warning", () => {
    const alert = tariffBalanceAlert(1);
    expect(alert.tone).toBe("warn1");
    expect(alert.message).toBe(
      "Осталось последнее занятие. Скоро потребуется продление"
    );
    expect(alert.needsRenewal).toBe(false);
    expect(alert.showRenewCta).toBe(true);
    expect(alert.allowsDebit).toBe(true);
  });

  it("at remaining 0 keeps full learning access and allows debit", () => {
    const alert = tariffBalanceAlert(0);
    expect(alert.tone).toBe("zero");
    expect(alert.needsRenewal).toBe(true);
    expect(alert.showRenewCta).toBe(true);
    expect(alert.allowsLastDebtLesson).toBe(true);
    expect(alert.allowsLearning).toBe(true);
    expect(canDebitFromRemaining(0)).toBe(true);
    expect(allowsLearningMaterials(0)).toBe(true);
  });

  it("at remaining -1 and -2 keeps full learning access", () => {
    expect(tariffBalanceAlert(-1).allowsLearning).toBe(true);
    expect(tariffBalanceAlert(-2).allowsLearning).toBe(true);
    expect(allowsLearningMaterials(-1)).toBe(true);
    expect(allowsLearningMaterials(-2)).toBe(true);
    expect(canDebitFromRemaining(-1)).toBe(true);
    expect(canDebitFromRemaining(-2)).toBe(true);
    expect(canDebitFromRemaining(-4)).toBe(true);
  });

  it("at remaining -3 locks learning materials but still allows debit", () => {
    const alert = tariffBalanceAlert(-3);
    expect(alert.tone).toBe("debt");
    expect(alert.allowsLearning).toBe(false);
    expect(alert.allowsDebit).toBe(true);
    expect(alert.showRenewCta).toBe(true);
    expect(alert.message).toMatch(/Пополните/);
    expect(allowsLearningMaterials(-3)).toBe(false);
    expect(allowsLearningMaterials(-4)).toBe(false);
  });

  it("uses packageStatus debt/exhausted when remaining is stale", () => {
    expect(
      assignmentTariffAlert({ lessonsRemaining: 3, packageStatus: "debt" }).tone
    ).toBe("debt");
    expect(
      assignmentTariffAlert({
        lessonsRemaining: 3,
        packageStatus: "exhausted",
      }).tone
    ).toBe("zero");
  });
});
