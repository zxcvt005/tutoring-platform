import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  isHomeworkComplete,
  isMissedNextLesson,
  nextLessonAfterAssignment,
} from "@/lib/homework-missed";
import type { HomeworkAssignment, Lesson } from "@/lib/types";

function iso(d: Date) {
  return d.toISOString();
}

function at(now: Date, days: number, hour = 17): Date {
  const x = new Date(now);
  x.setDate(x.getDate() + days);
  x.setHours(hour, 0, 0, 0);
  return x;
}

function lesson(
  id: string,
  studentId: string,
  starts: Date,
  status: Lesson["status"] = "done"
): Lesson {
  return {
    id,
    teacherId: "t1",
    studentIds: [studentId],
    startsAt: iso(starts),
    endsAt: iso(new Date(starts.getTime() + 3600_000)),
    status,
  };
}

function hw(
  partial: Partial<HomeworkAssignment> & Pick<HomeworkAssignment, "id" | "status">
): HomeworkAssignment {
  return {
    homeworkId: "test_1",
    teacherId: "t1",
    studentId: "s1",
    ...partial,
  };
}

describe("missed homework after next lesson", () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);

  it("marks incomplete homework when the next individual lesson already happened", () => {
    const source = lesson("l1", "s1", at(now, -10));
    const next = lesson("l2", "s1", at(now, -3));
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "in_progress",
      assignedAt: iso(at(now, -10, 18)),
    });
    expect(isMissedNextLesson(assignment, [source, next], now)).toBe(true);
  });

  it("does not treat first-attempt submit as completed", () => {
    expect(isHomeworkComplete("attempt1_submitted")).toBe(false);
    expect(isHomeworkComplete("remaining_questions")).toBe(false);
    const source = lesson("l1", "s1", at(now, -10));
    const next = lesson("l2", "s1", at(now, -2));
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "attempt1_submitted",
    });
    expect(isMissedNextLesson(assignment, [source, next], now)).toBe(true);
  });

  it("clears missed overlay after the student actually finishes", () => {
    const source = lesson("l1", "s1", at(now, -10));
    const next = lesson("l2", "s1", at(now, -2));
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "reviewed",
      completedAt: iso(at(now, -1)),
    });
    expect(isMissedNextLesson(assignment, [source, next], now)).toBe(false);
  });

  it("skips a cancelled next lesson and looks further", () => {
    const source = lesson("l1", "s1", at(now, -14));
    const cancelled = lesson("l2", "s1", at(now, -7), "cancelled");
    const future = lesson("l3", "s1", at(now, 3), "planned");
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "assigned",
    });
    expect(nextLessonAfterAssignment(assignment, [source, cancelled, future])?.id).toBe(
      "l3"
    );
    expect(
      isMissedNextLesson(assignment, [source, cancelled, future], now)
    ).toBe(false);
  });

  it("counts a moved one-off as the next lesson", () => {
    const source = lesson("l1", "s1", at(now, -14));
    const original = lesson("l2", "s1", at(now, -7), "cancelled");
    const moved = lesson("l2b", "s1", at(now, -5), "done");
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "in_progress",
    });
    expect(
      isMissedNextLesson(assignment, [source, original, moved], now)
    ).toBe(true);
  });

  it("is not missed when there is no later lesson yet", () => {
    const source = lesson("l1", "s1", at(now, -2));
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "assigned",
    });
    expect(isMissedNextLesson(assignment, [source], now)).toBe(false);
  });

  it("is not missed when completed before the next lesson", () => {
    const source = lesson("l1", "s1", at(now, -4));
    const next = lesson("l2", "s1", at(now, 3), "planned");
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "reviewed",
      completedAt: iso(at(now, -3)),
    });
    expect(isMissedNextLesson(assignment, [source, next], now)).toBe(false);
  });

  it("uses the next real Moscow lesson after a 23:00 source", () => {
    const sourceStart = fromAppWall(2026, 10, 31, 23, 0);
    const nextStart = fromAppWall(2026, 11, 1, 10, 0);
    const otherStart = fromAppWall(2026, 11, 1, 10, 0);
    const source = lesson("l1", "s1", sourceStart);
    const next = lesson("l2", "s1", nextStart, "planned");
    const other = lesson("lX", "s2", otherStart, "done");
    const assignment = hw({
      id: "a1",
      lessonId: "l1",
      status: "assigned",
      assignedAt: sourceStart.toISOString(),
    });
    expect(
      nextLessonAfterAssignment(assignment, [source, next, other])?.id
    ).toBe("l2");
    expect(
      isMissedNextLesson(
        assignment,
        [source, next, other],
        fromAppWall(2026, 11, 1, 12, 0)
      )
    ).toBe(true);
  });

  it("ignores another student's overlapping lesson", () => {
    const source = lesson("l1", "s1", at(now, -10));
    const other = lesson("lX", "s2", at(now, -3));
    const assignment = hw({
      id: "a1",
      studentId: "s1",
      lessonId: "l1",
      status: "assigned",
    });
    expect(isMissedNextLesson(assignment, [source, other], now)).toBe(false);
  });
});
