import { describe, expect, it } from "vitest";

import { buildFeedbackPrompt } from "@/lib/feedback-prompt";
import { emptyMonthlyFeedbackMetrics } from "@/lib/monthly-feedback";

describe("feedback prompt", () => {
  it("fills a single template with facts and does not invent exams", () => {
    const metrics = emptyMonthlyFeedbackMetrics(2026, 10);
    const prompt = buildFeedbackPrompt({
      studentName: "Алиса Иванова",
      periodYear: 2026,
      periodMonth: 10,
      teacherComment: "Уверенно решает линейные уравнения, путает знаки.",
      metrics,
    });
    expect(prompt).toContain("Алиса Иванова");
    expect(prompt).toContain("Уверенно решает линейные уравнения");
    expect(prompt).toContain("Не придумывай отсутствующие показатели");
    expect(prompt).toContain("занятий ученика с этим преподавателем в периоде не найдено");
    expect(prompt).toContain("Отдельных контрольных, пробников и экзаменов");
    expect(prompt).not.toContain("телефон");
    expect(prompt).not.toContain("WhatsApp");
  });
});
