import { describe, expect, it } from "vitest";

import { questionnaireValue } from "@/components/students/student-questionnaire-sections";

describe("student questionnaire display", () => {
  it("shows saved answers as-is and empty as Не указано", () => {
    expect(questionnaireValue("Иванов Иван")).toBe("Иванов Иван");
    expect(questionnaireValue("  @parent  ")).toBe("@parent");
    expect(questionnaireValue("")).toBe("Не указано");
    expect(questionnaireValue("   ")).toBe("Не указано");
    expect(questionnaireValue(null)).toBe("Не указано");
    expect(questionnaireValue(undefined)).toBe("Не указано");
  });
});
