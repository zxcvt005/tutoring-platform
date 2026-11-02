import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  computeMonthlyFeedbackMetrics,
  countAvailableFeedbackMetrics,
  currentFeedbackPeriod,
  feedbackMetricsSummary,
  feedbackMonthRange,
  parseFeedbackPeriod,
  shiftFeedbackPeriod,
  teacherFillStatus,
} from "@/lib/monthly-feedback";

describe("monthly feedback metrics", () => {
  const now = fromAppWall(2026, 10, 20, 12, 0);
  const { from, toExclusive } = feedbackMonthRange(2026, 10);

  it("uses Moscow calendar month bounds", () => {
    expect(from.toISOString()).toBe(fromAppWall(2026, 10, 1, 0, 0, 0).toISOString());
    expect(toExclusive.toISOString()).toBe(
      fromAppWall(2026, 11, 1, 0, 0, 0).toISOString()
    );
    expect(shiftFeedbackPeriod(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(parseFeedbackPeriod({ period: "2026-09" })).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("does not invent attendance when there are no lessons", () => {
    const metrics = computeMonthlyFeedbackMetrics({
      now,
      year: 2026,
      month: 10,
      from,
      toExclusive,
      lessons: [],
      attendances: [],
      topics: [],
      homework: [],
      previousHomework: [],
      theory: [],
    });
    expect(metrics.lessons.available).toBe(false);
    expect(metrics.homework.available).toBe(false);
    expect(metrics.topics.available).toBe(false);
    expect(countAvailableFeedbackMetrics(metrics)).toBe(0);
    expect(feedbackMetricsSummary(metrics)).toBe(
      "Недостаточно данных за этот месяц"
    );
  });

  it("counts present out of occurred lessons and keeps a real zero", () => {
    const l1 = {
      id: "l1",
      startsAt: fromAppWall(2026, 10, 5, 16, 0),
      status: "done",
    };
    const l2 = {
      id: "l2",
      startsAt: fromAppWall(2026, 10, 12, 16, 0),
      status: "done",
    };
    const metrics = computeMonthlyFeedbackMetrics({
      now,
      year: 2026,
      month: 10,
      from,
      toExclusive,
      lessons: [l1, l2],
      attendances: [
        { lessonId: "l1", status: "present" },
        { lessonId: "l2", status: "absent_unexcused" },
      ],
      topics: [{ lessonId: "l1", title: "Квадратные уравнения" }],
      homework: [],
      previousHomework: [],
      theory: [],
    });
    expect(metrics.lessons.available).toBe(true);
    expect(metrics.lessons.present).toBe(1);
    expect(metrics.lessons.occurred).toBe(2);
    expect(metrics.lessons.absentUnexcused).toBe(1);
    expect(metrics.topics.titles).toEqual(["Квадратные уравнения"]);
  });

  it("does not treat missing homework scores as zero", () => {
    const metrics = computeMonthlyFeedbackMetrics({
      now,
      year: 2026,
      month: 10,
      from,
      toExclusive,
      lessons: [],
      attendances: [],
      topics: [],
      homework: [
        {
          id: "h1",
          lessonId: null,
          createdAt: fromAppWall(2026, 10, 3, 12, 0),
          status: "assigned",
          attempt1Percent: null,
          attempt2Percent: null,
          title: "ДЗ без оценки",
        },
      ],
      previousHomework: [],
      theory: [],
    });
    expect(metrics.homework.available).toBe(true);
    expect(metrics.homework.assigned).toBe(1);
    expect(metrics.homework.completed).toBe(0);
    expect(metrics.homework.averagePercent).toBeNull();
    expect(metrics.homework.previousComparable).toBe(false);
  });

  it("uses attempt 2 when present and marks comparable dynamics", () => {
    const metrics = computeMonthlyFeedbackMetrics({
      now,
      year: 2026,
      month: 10,
      from,
      toExclusive,
      lessons: [],
      attendances: [],
      topics: [],
      homework: [
        {
          id: "h1",
          lessonId: null,
          createdAt: fromAppWall(2026, 10, 3, 12, 0),
          status: "completed",
          attempt1Percent: "60",
          attempt2Percent: "80",
          title: "ДЗ",
        },
      ],
      previousHomework: [
        {
          id: "h0",
          lessonId: null,
          createdAt: fromAppWall(2026, 9, 10, 12, 0),
          status: "completed",
          attempt1Percent: "50",
          attempt2Percent: null,
          title: "Прошлое ДЗ",
        },
      ],
      theory: [],
    });
    expect(metrics.homework.averagePercent).toBe(80);
    expect(metrics.homework.previousAveragePercent).toBe(50);
    expect(metrics.homework.previousComparable).toBe(true);
  });

  it("derives fill status from comment and submission", () => {
    expect(teacherFillStatus({ submittedAt: null, teacherComment: "  " })).toBe(
      "empty"
    );
    expect(
      teacherFillStatus({ submittedAt: null, teacherComment: "Работает" })
    ).toBe("draft");
    expect(
      teacherFillStatus({
        submittedAt: new Date().toISOString(),
        teacherComment: "Работает",
      })
    ).toBe("submitted");
  });

  it("reads the current Moscow month", () => {
    const period = currentFeedbackPeriod(fromAppWall(2026, 1, 31, 23, 30));
    expect(period).toEqual({ year: 2026, month: 1 });
  });
});
