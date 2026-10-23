import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  nearestUpcomingLesson,
  sortStudentsByUpcomingLesson,
} from "@/lib/grades-sort";
import type { Lesson, Student } from "@/lib/types";

function lesson(
  id: string,
  studentId: string,
  startsAt: string,
  status: Lesson["status"] = "planned"
): Lesson {
  return {
    id,
    teacherId: "t1",
    studentIds: [studentId],
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 3600_000).toISOString(),
    status,
  };
}

describe("grades sort by upcoming lesson", () => {
  const now = new Date("2026-10-21T12:00:00");

  it("puts today's not-started lesson first, then later days, then none", () => {
    const students: Student[] = [
      { id: "s-none", fullName: "Яков", status: "active", teacherId: "t1" },
      { id: "s-later", fullName: "Борис", status: "active", teacherId: "t1" },
      { id: "s-today", fullName: "Анна", status: "active", teacherId: "t1" },
    ];
    const lessons: Lesson[] = [
      lesson("l1", "s-today", "2026-10-21T15:00:00"),
      lesson("l2", "s-later", "2026-10-22T10:00:00"),
      lesson("l3", "s-today", "2026-10-21T10:00:00", "done"),
    ];
    const sorted = sortStudentsByUpcomingLesson(students, lessons, now);
    expect(sorted.map((s) => s.id)).toEqual(["s-today", "s-later", "s-none"]);
  });

  it("ignores a lesson that already started and prefers the next future one", () => {
    const lessons: Lesson[] = [
      lesson("started", "s1", "2026-10-21T11:00:00"),
      lesson("next", "s1", "2026-10-22T09:00:00"),
    ];
    const next = nearestUpcomingLesson(lessons, "s1", now);
    expect(next?.id).toBe("next");
  });

  it("sorts two lessons on the same day by start time", () => {
    const students: Student[] = [
      { id: "s-b", fullName: "Б", status: "active", teacherId: "t1" },
      { id: "s-a", fullName: "А", status: "active", teacherId: "t1" },
    ];
    const lessons: Lesson[] = [
      lesson("late", "s-b", "2026-10-21T18:00:00"),
      lesson("early", "s-a", "2026-10-21T13:00:00"),
    ];
    const sorted = sortStudentsByUpcomingLesson(students, lessons, now);
    expect(sorted.map((s) => s.id)).toEqual(["s-a", "s-b"]);
  });

  it("uses actual datetime, not weekday number", () => {
    const students: Student[] = [
      { id: "s-wed", fullName: "Среда", status: "active", teacherId: "t1" },
      { id: "s-thu", fullName: "Четверг", status: "active", teacherId: "t1" },
    ];
    const lessons: Lesson[] = [
      lesson("next-wed", "s-wed", "2026-10-28T18:00:00"),
      lesson("thu", "s-thu", "2026-10-22T16:00:00"),
    ];
    const sorted = sortStudentsByUpcomingLesson(students, lessons, now);
    expect(sorted.map((s) => s.id)).toEqual(["s-thu", "s-wed"]);
  });

  it("ignores cancelled slots and uses the rescheduled time", () => {
    const students: Student[] = [
      { id: "s-move", fullName: "Перенос", status: "active", teacherId: "t1" },
      { id: "s-soon", fullName: "Скоро", status: "active", teacherId: "t1" },
    ];
    const lessons: Lesson[] = [
      lesson("cancelled-original", "s-move", "2026-10-21T13:00:00", "cancelled"),
      lesson("moved", "s-move", "2026-10-23T10:00:00"),
      lesson("soon", "s-soon", "2026-10-21T16:00:00"),
    ];
    const sorted = sortStudentsByUpcomingLesson(students, lessons, now);
    expect(sorted.map((s) => s.id)).toEqual(["s-soon", "s-move"]);
    expect(
      nearestUpcomingLesson(lessons, "s-move", now)?.id
    ).toBe("moved");
  });

  it("skips a cancelled attendance even if the lesson is still planned", () => {
    const lessons: Lesson[] = [
      lesson("slot", "s1", "2026-10-21T15:00:00"),
      lesson("later", "s1", "2026-10-24T12:00:00"),
    ];
    const next = nearestUpcomingLesson(lessons, "s1", now, [
      { lessonId: "slot", studentId: "s1", status: "cancelled" },
    ]);
    expect(next?.id).toBe("later");
  });

  it("does not treat today's completed lesson as upcoming", () => {
    const lessons: Lesson[] = [
      lesson("done-today", "s1", "2026-10-21T18:00:00", "done"),
    ];
    expect(nearestUpcomingLesson(lessons, "s1", now)).toBeNull();
  });

  it("sorts 23:00 Moscow before the next morning using real instants", () => {
    const now = fromAppWall(2026, 10, 21, 20, 0);
    const students: Student[] = [
      { id: "s-morning", fullName: "Утро", status: "active", teacherId: "t1" },
      { id: "s-late", fullName: "Вечер", status: "active", teacherId: "t1" },
    ];
    const lessons: Lesson[] = [
      lesson("morning", "s-morning", fromAppWall(2026, 10, 22, 10, 0).toISOString()),
      lesson("late", "s-late", fromAppWall(2026, 10, 21, 23, 0).toISOString()),
    ];
    const sorted = sortStudentsByUpcomingLesson(students, lessons, now);
    expect(sorted.map((s) => s.id)).toEqual(["s-late", "s-morning"]);
  });
});
