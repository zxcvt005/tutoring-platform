import { describe, expect, it } from "vitest";

import { appDateKey, fromAppWall } from "@/lib/app-time";
import {
  attendanceMarkFeedback,
  lessonNeedsAttendanceMark,
  splitKafedraTodayLessons,
} from "@/lib/kafedra-today";
import type { Attendance, Lesson } from "@/lib/types";

function lesson(
  id: string,
  startsAt: Date,
  extra: Partial<Lesson> = {}
): Lesson {
  return {
    id,
    teacherId: "t1",
    studentIds: ["s1"],
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    status: "planned",
    ...extra,
  };
}

describe("kafedra today attendance queue", () => {
  const now = fromAppWall(2026, 10, 22, 10, 0, 0);

  it("shows a past unmarked lesson for the teacher", () => {
    const past = lesson("past", fromAppWall(2026, 10, 21, 15, 0, 0));
    const split = splitKafedraTodayLessons([past], [], now);
    expect(split.overdue.map((l) => l.id)).toEqual(["past"]);
    expect(split.today).toEqual([]);
    expect(lessonNeedsAttendanceMark(past, [], now)).toBe(true);
  });

  it("shows today's unmarked lesson in the today list", () => {
    const todayPast = lesson("today-done", fromAppWall(2026, 10, 22, 9, 0, 0));
    const todayFuture = lesson(
      "today-later",
      fromAppWall(2026, 10, 22, 15, 0, 0)
    );
    const split = splitKafedraTodayLessons([todayPast, todayFuture], [], now);
    expect(split.today.map((l) => l.id)).toEqual(["today-done", "today-later"]);
    expect(split.overdue).toEqual([]);
    expect(lessonNeedsAttendanceMark(todayPast, [], now)).toBe(true);
    expect(lessonNeedsAttendanceMark(todayFuture, [], now)).toBe(false);
  });

  it("does not put a future lesson into overdue marks", () => {
    const future = lesson("future", fromAppWall(2026, 10, 23, 10, 0, 0));
    const split = splitKafedraTodayLessons([future], [], now);
    expect(split.overdue).toEqual([]);
    expect(split.today).toEqual([]);
    expect(lessonNeedsAttendanceMark(future, [], now)).toBe(false);
  });

  it("does not require a mark when attendance was cancelled or rescheduled", () => {
    const past = lesson("moved", fromAppWall(2026, 10, 21, 15, 0, 0));
    const att: Attendance[] = [
      { lessonId: "moved", studentId: "s1", status: "cancelled" },
    ];
    expect(splitKafedraTodayLessons([past], att, now).overdue).toEqual([]);
  });

  it("does not require a mark for a teacher-cancelled lesson", () => {
    const cancelled = lesson("c", fromAppWall(2026, 10, 21, 15, 0, 0), {
      status: "cancelled",
    });
    const split = splitKafedraTodayLessons([cancelled], [], now);
    expect(split.overdue).toEqual([]);
    expect(lessonNeedsAttendanceMark(cancelled, [], now)).toBe(false);
  });

  it("removes a lesson from overdue after attendance is saved", () => {
    const past = lesson("past", fromAppWall(2026, 10, 21, 15, 0, 0));
    const before = splitKafedraTodayLessons([past], [], now);
    expect(before.overdue.map((l) => l.id)).toEqual(["past"]);

    const att: Attendance[] = [
      { lessonId: "past", studentId: "s1", status: "present" },
    ];
    const after = splitKafedraTodayLessons([past], att, now);
    expect(after.overdue).toEqual([]);
    expect(lessonNeedsAttendanceMark(past, att, now)).toBe(false);
  });

  it("filters overdue vs today by Europe/Moscow, not the host zone", () => {
    const lateYesterday = lesson(
      "late",
      fromAppWall(2026, 10, 21, 23, 30, 0)
    );
    const justToday = lesson("early", fromAppWall(2026, 10, 22, 0, 15, 0));
    const midnightNow = fromAppWall(2026, 10, 22, 0, 30, 0);

    expect(lateYesterday.startsAt).toBe("2026-10-21T20:30:00.000Z");
    expect(appDateKey(lateYesterday.startsAt)).toBe("2026-10-21");
    expect(appDateKey(justToday.startsAt)).toBe("2026-10-22");
    expect(appDateKey(midnightNow)).toBe("2026-10-22");

    const split = splitKafedraTodayLessons(
      [lateYesterday, justToday],
      [],
      midnightNow
    );
    expect(split.overdue.map((l) => l.id)).toEqual(["late"]);
    expect(split.today.map((l) => l.id)).toEqual(["early"]);
  });

  it("does not treat a network error as a successful save", () => {
    expect(
      attendanceMarkFeedback({ ok: false, error: "Сеть недоступна" })
    ).toEqual({
      saved: false,
      message: "Сеть недоступна",
    });
    expect(attendanceMarkFeedback({ ok: false })).toMatchObject({
      saved: false,
    });
    expect(attendanceMarkFeedback({ ok: true })).toEqual({
      saved: true,
      message: null,
    });
  });
});
