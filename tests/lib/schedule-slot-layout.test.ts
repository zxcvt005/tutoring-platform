import { describe, expect, it } from "vitest";

import {
  LESSON_CARD_CONTENT_PCT,
  layoutLessonColumns,
  lessonCardSlotLayout,
} from "@/lib/schedule";
import type { Lesson } from "@/lib/types";

function lesson(
  id: string,
  startsAt: string,
  endsAt: string,
  studentId: string
): Lesson {
  return {
    id,
    teacherId: "t1",
    studentIds: [studentId],
    startsAt,
    endsAt,
    status: "planned",
  };
}

describe("week grid lesson card width", () => {
  it("leaves about 20% of the slot free for a parallel booking click", () => {
    const layout = lessonCardSlotLayout(0, 1);
    expect(LESSON_CARD_CONTENT_PCT).toBe(80);
    expect(layout.freePct).toBe(20);
    expect(layout.widthPct).toBeLessThan(80);
    expect(layout.leftPct + layout.widthPct).toBeLessThanOrEqual(80);
  });

  it("keeps parallel independent lessons distinguishable inside the content zone", () => {
    const laid = layoutLessonColumns([
      lesson("a", "2026-10-22T10:00:00+03:00", "2026-10-22T11:00:00+03:00", "s1"),
      lesson("b", "2026-10-22T10:00:00+03:00", "2026-10-22T11:00:00+03:00", "s2"),
    ]);
    expect(laid).toHaveLength(2);
    expect(laid.every((x) => x.columns === 2)).toBe(true);
    const a = lessonCardSlotLayout(
      laid.find((x) => x.lesson.id === "a")!.column,
      2
    );
    const b = lessonCardSlotLayout(
      laid.find((x) => x.lesson.id === "b")!.column,
      2
    );
    expect(a.leftPct).not.toBe(b.leftPct);
    expect(Math.max(a.leftPct + a.widthPct, b.leftPct + b.widthPct)).toBeLessThanOrEqual(
      80
    );
  });
});
