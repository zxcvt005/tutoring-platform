import { describe, expect, it } from "vitest";

import { landingRequisites } from "@/lib/landing/requisites";
import {
  buildSettlementRequisiteSnapshot,
  settlementOperatorFio,
  settlementServiceName,
  settlementSettlerSurname,
  SETTLEMENT_SETTLER_POSITION,
  SETTLEMENT_TAX_SYSTEM,
  SETTLEMENT_VAT_NOTE,
} from "@/lib/settlements/requisites";

describe("settlement requisites", () => {
  it("strips ИП and extracts surname Гусын", () => {
    expect(settlementOperatorFio()).toBe("Гусын Анатолий Владимирович");
    expect(settlementSettlerSurname()).toBe("Гусын");
  });

  it("fixes VAT note as Без НДС permanently (never 0%)", () => {
    expect(SETTLEMENT_VAT_NOTE).toBe("Без НДС");
    expect(SETTLEMENT_VAT_NOTE).not.toMatch(/0\s*%/);
  });

  it("builds snapshot with constant Без НДС", () => {
    const snap = buildSettlementRequisiteSnapshot();
    expect(snap.taxSystem).toBe(SETTLEMENT_TAX_SYSTEM);
    expect(snap.vatNote).toBe("Без НДС");
    expect(snap.vatNote).toBe(SETTLEMENT_VAT_NOTE);
    expect(snap.vatNote).not.toMatch(/0\s*%/);
    expect(snap.settlerPosition).toBe(SETTLEMENT_SETTLER_POSITION);
    expect(snap.settlerSurname).toBe("Гусын");
    expect(snap.inn).toBe(landingRequisites.inn);
    expect(snap.siteUrl).toBe("https://neodinschool.ru");
  });

  it("formats service name with lessons", () => {
    expect(settlementServiceName("Старт", 8)).toBe(
      "Покупка абонемента: Старт, 8 занятий"
    );
  });
});
