import { describe, expect, it } from "vitest";

import {
  calendarDisplayStatus,
  classifyAuditoriaLesson,
  legendCategoryForLesson,
  upcomingWeekdaySlots,
} from "@/lib/auditoria-calendar";
import type { Lesson } from "@/lib/types";

function lesson(
  id: string,
  startsAt: string,
  status: Lesson["status"] = "planned"
): Lesson {
  return {
    id,
    teacherId: "t1",
    studentIds: ["s1"],
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 3600_000).toISOString(),
    status,
  };
}

describe("auditoria calendar categories", () => {
  const now = new Date("2026-10-21T12:00:00+03:00");

  it("marks present, absent and future without confusing teacher cancel", () => {
    expect(
      classifyAuditoriaLesson(
        lesson("p", "2026-10-20T16:00:00+03:00", "done"),
        { status: "present" },
        now
      )
    ).toBe("present");
    expect(
      classifyAuditoriaLesson(
        lesson("a", "2026-10-20T16:00:00+03:00", "done"),
        { status: "absent_excused" },
        now
      )
    ).toBe("absent");
    expect(
      classifyAuditoriaLesson(
        lesson("u", "2026-10-20T16:00:00+03:00", "done"),
        { status: "absent_unexcused" },
        now
      )
    ).toBe("absent");
    expect(
      classifyAuditoriaLesson(
        lesson("f", "2026-10-22T16:00:00+03:00"),
        undefined,
        now
      )
    ).toBe("future");
    expect(
      classifyAuditoriaLesson(
        lesson("c", "2026-10-20T16:00:00+03:00", "cancelled"),
        undefined,
        now
      )
    ).toBe("cancelled");
    expect(legendCategoryForLesson("cancelled")).toBeNull();
  });

  it("does not paint unmarked past as absence", () => {
    expect(
      classifyAuditoriaLesson(
        lesson("plain", "2026-10-20T16:00:00+03:00", "planned"),
        undefined,
        now
      )
    ).toBe("unmarked");
    expect(legendCategoryForLesson("unmarked")).toBeNull();
    expect(calendarDisplayStatus("unmarked")).toBe("planned");
  });

  it("keeps teacher-cancelled slots out of the missed color", () => {
    expect(calendarDisplayStatus("cancelled")).toBe("cancelled");
    expect(calendarDisplayStatus("absent")).toBe("missed");
    expect(
      classifyAuditoriaLesson(
        lesson("c1", "2026-10-20T16:00:00+03:00", "done"),
        { status: "cancelled" },
        now
      )
    ).toBe("cancelled");
  });

  it("summarizes weekday slots without listing every future lesson", () => {
    const lessons: Lesson[] = [
      lesson("a", "2026-10-22T16:00:00+03:00"),
      lesson("b", "2026-10-29T16:00:00+03:00"),
      lesson("c", "2026-10-23T18:30:00+03:00"),
      lesson("cancelled", "2026-10-22T10:00:00+03:00", "cancelled"),
    ];
    const slots = upcomingWeekdaySlots(lessons, "s1", now);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.time).sort()).toEqual(["16:00", "18:30"]);
  });
});
