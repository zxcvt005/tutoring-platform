import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  formatTeacherLessonRating,
  groupRatingsByAppDay,
  ratingOffersComment,
  ratingRequiresComment,
  roundLessonRatingAverage,
  studentCanRateLesson,
} from "@/lib/lesson-ratings";

describe("lesson ratings helpers", () => {
  const now = fromAppWall(2026, 10, 27, 12, 0);

  it("allows rating only a conducted present lesson", () => {
    const past = fromAppWall(2026, 10, 20, 16, 0).toISOString();
    const future = fromAppWall(2026, 10, 28, 16, 0).toISOString();
    expect(
      studentCanRateLesson({
        lessonStatus: "done",
        startsAt: past,
        attendanceStatus: "present",
        now,
      })
    ).toBe(true);
    expect(
      studentCanRateLesson({
        lessonStatus: "planned",
        startsAt: future,
        attendanceStatus: "present",
        now,
      })
    ).toBe(false);
    expect(
      studentCanRateLesson({
        lessonStatus: "cancelled",
        startsAt: past,
        attendanceStatus: "present",
        now,
      })
    ).toBe(false);
    expect(
      studentCanRateLesson({
        lessonStatus: "done",
        startsAt: past,
        attendanceStatus: "absent_unexcused",
        now,
      })
    ).toBe(false);
    expect(
      studentCanRateLesson({
        lessonStatus: "done",
        startsAt: past,
        attendanceStatus: null,
        now,
      })
    ).toBe(false);
  });

  it("never requires a comment and offers it for scores 1-6", () => {
    expect(ratingRequiresComment(1)).toBe(false);
    expect(ratingRequiresComment(6)).toBe(false);
    expect(ratingRequiresComment(7)).toBe(false);
    expect(ratingRequiresComment(10)).toBe(false);
    expect(ratingOffersComment(1)).toBe(true);
    expect(ratingOffersComment(6)).toBe(true);
    expect(ratingOffersComment(7)).toBe(false);
    expect(ratingOffersComment(10)).toBe(false);
  });

  it("groups history by Moscow calendar day", () => {
    const groups = groupRatingsByAppDay([
      { submittedAt: fromAppWall(2026, 10, 27, 9, 0).toISOString(), id: "a" },
      { submittedAt: fromAppWall(2026, 10, 27, 18, 0).toISOString(), id: "b" },
      { submittedAt: fromAppWall(2026, 10, 26, 23, 30).toISOString(), id: "c" },
    ]);
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-10-27", "2026-10-26"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not treat missing ratings as zero", () => {
    expect(roundLessonRatingAverage(0, 0)).toBeNull();
    expect(roundLessonRatingAverage(17, 2)).toBe(8.5);
    expect(formatTeacherLessonRating("Анна", null, 0)).toBe("Анна — Нет оценок");
    expect(formatTeacherLessonRating("Анна", 8.5, 2)).toBe(
      "Анна — 8,5/10 · 2 оценки"
    );
  });
});
