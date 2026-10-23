import { describe, expect, it } from "vitest";

import {
  LESSON_MARK_CONTENT_ERROR,
  canCompleteAttendanceMark,
} from "@/lib/lesson-mark-requirements";
import type { Lesson } from "@/lib/types";

function lesson(partial: Partial<Lesson> & Pick<Lesson, "startsAt">): Lesson {
  return {
    id: "l1",
    teacherId: "t1",
    studentIds: ["s1"],
    endsAt: partial.endsAt ?? new Date(new Date(partial.startsAt).getTime() + 45 * 60_000).toISOString(),
    status: "planned",
    ...partial,
  };
}

describe("lesson mark requirements", () => {
  it("does not require topic for a future lesson", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(canCompleteAttendanceMark(lesson({ startsAt: future }))).toEqual({
      ok: true,
    });
  });

  it("blocks an occurred lesson without a topic", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const result = canCompleteAttendanceMark(
      lesson({ startsAt: past, lessonTopics: [] })
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe(LESSON_MARK_CONTENT_ERROR);
  });

  it("allows an occurred lesson when topic exists and homework does not", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      canCompleteAttendanceMark(
        lesson({
          startsAt: past,
          lessonTopics: [{ id: "lt1", title: "Кинематика", sortOrder: 0 }],
        })
      )
    ).toEqual({ ok: true });
  });
});
