import { describe, expect, it } from "vitest";

import {
  formulaCountPhrase,
  landingBonuses,
  landingFaq,
  landingFooter,
  landingGuarantees,
  landingHero,
  landingMeta,
  landingNav,
  landingTeachers,
} from "@/lib/landing/content";
import {
  LANDING_LEAD_DELIVERY,
  validateLandingLead,
  validateLandingStudentStep,
} from "@/lib/landing/lead";
import {
  landingAverageScore,
  landingScoreCount,
  landingScoreYears,
} from "@/lib/landing/results";

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
  "progress-guarantee",
  "part-two",
  "admission",
  "not-school",
];

describe("landing content", () => {
  it("keeps the brand promise and drops school / price showcase language", () => {
    const blob = JSON.stringify({
      landingHero,
      landingMeta,
      landingFooter,
      landingGuarantees,
      landingBonuses,
    });
    expect(landingHero.primaryCta.toLowerCase()).not.toContain("бесплат");
    expect(blob.toLowerCase()).not.toContain("онлайн-школа");
    expect(blob).not.toMatch(/12\s*000|24\s*000|35\s*000/);
    expect(landingGuarantees.status).toBe("active");
    expect(landingGuarantees.items).toHaveLength(2);
  });

  it("publishes teachers and verified score years", () => {
    expect(landingTeachers.map((item) => item.id)).toEqual([
      "anatoly",
      "georgy",
      "anya",
    ]);
    expect(landingTeachers[0]?.points).toEqual([
      "Личный результат ЕГЭ — 100 баллов",
      "Готовит к экзаменам больше 5 лет, из них последние 3 года — только старшие школьники",
      "100+ подготовленных учеников",
      "Умеет выстраивать приятную атмосферу на занятиях",
    ]);
    expect(landingAverageScore).toBe(82);
    expect(landingScoreCount()).toBe(52);
    expect(landingScoreYears.map((item) => item.year)).toEqual([
      2023, 2024, 2025, 2026,
    ]);
  });

  it("exposes decision-oriented landing nav anchors", () => {
    expect(landingNav.map((item) => item.href)).toEqual([
      "#product",
      "#method",
      "#platform",
      "#teachers",
      "#results",
      "#guarantees",
      "#faq",
      "#apply",
    ]);
  });

  it("answers the required objections without draft badges", () => {
    expect(landingFaq.map((item) => item.id)).toEqual(REQUIRED_FAQ);
    expect(landingFaq.every((item) => item.answer.length > 20)).toBe(true);
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
  };

  it("marks public delivery as connected", () => {
    expect(LANDING_LEAD_DELIVERY.connected).toBe(true);
    expect(LANDING_LEAD_DELIVERY.endpoint).toBe("/api/landing/leads");
  });

  it("asks for the student before the parent step", () => {
    expect(
      validateLandingStudentStep({ studentName: "М", gradeId: "", level: "" })
    ).toMatchObject({
      studentName: expect.any(String),
      gradeId: expect.any(String),
    });
  });

  it("rejects a short contact", () => {
    const errors = validateLandingLead({
      ...valid,
      contact: "нет",
    });
    expect(errors.contact).toBeTruthy();
  });

  it("accepts a valid payload shape", () => {
    expect(validateLandingLead(valid)).toEqual({});
  });
});
