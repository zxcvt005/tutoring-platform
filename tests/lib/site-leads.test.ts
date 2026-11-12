import { describe, expect, it } from "vitest";

import {
  gradeLabel,
  isSiteLeadStatus,
  SITE_LEAD_STATUSES,
} from "@/lib/site-leads";
import {
  validateLandingLead,
  validateLandingStudentStep,
} from "@/lib/landing/lead";

describe("site-leads helpers", () => {
  it("exposes the fixed status catalog", () => {
    expect(SITE_LEAD_STATUSES).toEqual([
      "Новая",
      "Написали",
      "Диагностика",
      "Отказ",
      "Зачислили",
    ]);
  });

  it("validates statuses and grade labels", () => {
    expect(isSiteLeadStatus("Новая")).toBe(true);
    expect(isSiteLeadStatus("Купил")).toBe(false);
    expect(gradeLabel("10")).toBe("10 класс");
    expect(gradeLabel("11")).toBe("11 класс");
    expect(gradeLabel("other")).toBe("Другой");
  });
});

describe("landing lead validation for public intake", () => {
  const valid = {
    studentName: "Мария",
    gradeId: "11",
    level: "около 60",
    parentName: "Анна",
    contact: "+7 900 111-22-33",
    comment: "",
  };

  it("rejects empty and oversized fields", () => {
    expect(
      validateLandingStudentStep({ studentName: "", gradeId: "11", level: "" })
        .studentName
    ).toBeTruthy();
    expect(
      validateLandingLead({
        ...valid,
        parentName: "А",
        contact: "x",
        comment: "c".repeat(501),
      })
    ).toMatchObject({
      parentName: expect.any(String),
      contact: expect.any(String),
      comment: expect.any(String),
    });
  });

  it("accepts telegram and phone contacts", () => {
    expect(
      validateLandingLead({ ...valid, contact: "@neodin_parent" })
    ).toEqual({});
    expect(
      validateLandingLead({ ...valid, contact: "+79001112233" })
    ).toEqual({});
  });
});
