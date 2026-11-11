import { describe, expect, it } from "vitest";

import {
  formulaCountPhrase,
  landingBonuses,
  landingFaq,
  landingGuarantees,
  landingHero,
  landingMeta,
  landingTariffs,
} from "@/lib/landing/content";
import {
  LANDING_LEAD_DELIVERY,
  submitLandingLead,
  validateLandingStudentStep,
} from "@/lib/landing/lead";

const REQUIRED_FAQ = [
  "level",
  "other-tutor",
  "diagnostic",
  "online",
  "homework",
  "stuck",
  "catch-up",
  "parents",
  "price",
  "unfit",
  "part-two",
  "admission",
];

describe("landing content", () => {
  it("keeps the published tariff prices and the same support in every format", () => {
    expect(landingTariffs.map((item) => [item.id, item.price, item.hoursPerMonth])).toEqual([
      ["compact", 12_000, 4],
      ["basic", 24_000, 8],
      ["extended", 35_000, 12],
    ]);
    for (const tariff of landingTariffs) {
      expect(tariff.features).toContain("Куратор");
      expect(tariff.features).toContain("Пробные экзамены раз в месяц");
    }
  });

  it("does not publish an unconfirmed score, a free diagnostic, or a summer school", () => {
    const blob = JSON.stringify({
      landingHero,
      landingMeta,
      landingBonuses,
      landingGuarantees,
    });
    expect(blob).not.toContain("82");
    expect(landingHero.primaryCta.toLowerCase()).not.toContain("бесплат");
    expect(landingBonuses.items.map((item) => item.id)).not.toContain("summer");
    expect(landingBonuses.items.map((item) => item.title).join(" ")).not.toMatch(/летн/i);
    expect(landingBonuses.notice.length).toBeGreaterThan(40);
  });

  it("uses the shared link-preview description", () => {
    expect(landingMeta.description).toBe(
      "Вы не останетесь одни при подготовке."
    );
  });

  it("marks guarantees as not yet an offer and answers the required objections", () => {
    expect(landingGuarantees.status).toBe("needs_agreement");
    expect(landingGuarantees.notice.length).toBeGreaterThan(40);
    expect(landingFaq.map((item) => item.id)).toEqual(REQUIRED_FAQ);
    expect(landingFaq.find((item) => item.id === "unfit")?.draft).toBe(true);
  });

  it("declines formula counts in Russian", () => {
    expect(formulaCountPhrase(1)).toBe("1 формула");
    expect(formulaCountPhrase(2)).toBe("2 формулы");
    expect(formulaCountPhrase(5)).toBe("5 формул");
    expect(formulaCountPhrase(11)).toBe("11 формул");
  });
});

describe("landing lead", () => {
  const valid = {
    studentName: "Мария",
    gradeId: "11",
    level: "около 60",
    parentName: "Анна",
    contact: "+7 900 111-22-33",
    comment: "",
    tariffId: "basic",
  };

  it("does not deliver a valid application", () => {
    expect(LANDING_LEAD_DELIVERY.connected).toBe(false);
    expect(submitLandingLead(valid)).toEqual({ status: "not_delivered" });
  });

  it("asks for the student before the parent step", () => {
    expect(validateLandingStudentStep({ studentName: "М", gradeId: "", level: "" })).toMatchObject({
      studentName: expect.any(String),
      gradeId: expect.any(String),
    });
  });

  it("rejects an unknown tariff and a short contact", () => {
    const result = submitLandingLead({
      ...valid,
      contact: "нет",
      tariffId: "vip",
    });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.contact).toBeTruthy();
      expect(result.errors.tariffId).toBeTruthy();
    }
  });
});
