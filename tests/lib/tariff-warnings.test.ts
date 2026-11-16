import { describe, expect, it } from "vitest";

import {
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

  it("at remaining 0 package is finished but one more debit is still allowed", () => {
    const alert = tariffBalanceAlert(0);
    expect(alert.tone).toBe("zero");
    expect(alert.message).toBe(
      "Занятия по направлению закончились. Продлите пакет, чтобы снова открыть материалы"
    );
    expect(alert.needsRenewal).toBe(true);
    expect(alert.showRenewCta).toBe(true);
    expect(alert.allowsLastDebtLesson).toBe(true);
    expect(alert.allowsLearning).toBe(false);
    expect(canDebitFromRemaining(0)).toBe(true);
  });

  it("at remaining -1 blocks new lessons and learning", () => {
    const alert = tariffBalanceAlert(-1);
    expect(alert.tone).toBe("debt");
    expect(alert.message).toBe("Занятие в долг — требуется продление");
    expect(alert.allowsDebit).toBe(true);
    expect(alert.allowsLearning).toBe(false);
    expect(alert.showRenewCta).toBe(true);
    expect(canDebitFromRemaining(-1)).toBe(true);
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
