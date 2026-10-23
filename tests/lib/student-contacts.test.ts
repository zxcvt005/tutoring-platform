import { describe, expect, it } from "vitest";

import {
  gradeLabel,
  normalizeGrade,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";

describe("student contacts", () => {
  it("normalizes grade", () => {
    expect(normalizeGrade("10")).toBe("10");
    expect(normalizeGrade("7")).toBeNull();
    expect(normalizeGrade("")).toBeNull();
  });

  it("labels missing grade", () => {
    expect(gradeLabel(null)).toBe("Не указан");
    expect(gradeLabel("9")).toBe("9 класс");
  });

  it("builds safe telegram links", () => {
    expect(telegramHref("@student_user")).toBe("https://t.me/student_user");
    expect(telegramHref("https://t.me/student_user")).toBe(
      "https://t.me/student_user"
    );
    expect(telegramHref("https://evil.com/x")).toBeNull();
    expect(telegramHref("javascript:alert(1)")).toBeNull();
    expect(telegramDisplay("@student_user")).toBe("@student_user");
  });

  it("builds tel links without dropping plus", () => {
    expect(phoneHref("+7 (999) 111-22-33")).toBe("tel:+79991112233");
    expect(phoneHref("123")).toBeNull();
  });
});
