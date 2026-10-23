import { describe, expect, it } from "vitest";

import {
  homeworkAssignedDateInfo,
  homeworkSectionFor,
  sortHomeworkForStudent,
} from "@/lib/homework-list";
import type { HomeworkAssignment, Lesson } from "@/lib/types";

function hw(
  id: string,
  status: HomeworkAssignment["status"],
  extra: Partial<HomeworkAssignment> = {}
): HomeworkAssignment {
  return {
    id,
    homeworkId: "h1",
    teacherId: "t1",
    studentId: "s1",
    status,
    ...extra,
  };
}

describe("homework list for auditoria", () => {
  const lessons: Lesson[] = [
    {
      id: "les-old",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-10-10T12:00:00",
      endsAt: "2026-10-10T13:00:00",
      status: "done",
    },
  ];

  it("puts each assignment into exactly one of four sections in fixed order", () => {
    const list = [
      hw("done-new", "reviewed", { assignedAt: "2026-10-20T10:00:00" }),
      hw("open-old", "in_progress", { assignedAt: "2026-10-01T10:00:00" }),
      hw("missed-old", "assigned", {
        assignedAt: "2026-10-05T10:00:00",
        missedNextLesson: true,
      }),
      hw("missed-new", "in_progress", {
        assignedAt: "2026-10-18T10:00:00",
        missedNextLesson: true,
      }),
      hw("open-new", "assigned", { assignedAt: "2026-10-19T10:00:00" }),
      hw("pending-review", "completed", { assignedAt: "2026-10-17T10:00:00" }),
      hw("attempt2", "remaining_questions", {
        assignedAt: "2026-10-16T10:00:00",
      }),
    ];
    const sorted = sortHomeworkForStudent(list, lessons);
    expect(sorted.overdue.map((a) => a.id)).toEqual([
      "missed-new",
      "missed-old",
    ]);
    expect(sorted.newItems.map((a) => a.id)).toEqual(["open-new"]);
    expect(sorted.incomplete.map((a) => a.id)).toEqual([
      "pending-review",
      "attempt2",
      "open-old",
    ]);
    expect(sorted.completed.map((a) => a.id)).toEqual(["done-new"]);
    expect(sorted.ordered.map((a) => a.id)).toEqual([
      "missed-new",
      "missed-old",
      "open-new",
      "pending-review",
      "attempt2",
      "open-old",
      "done-new",
    ]);
    const allIds = sorted.ordered.map((a) => a.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("moves finished overdue homework out of overdue into completed", () => {
    const before = hw("m1", "attempt1_submitted", {
      assignedAt: "2026-10-01T10:00:00",
      missedNextLesson: true,
    });
    expect(homeworkSectionFor(before)).toBe("overdue");

    const after = hw("m1", "reviewed", {
      assignedAt: "2026-10-01T10:00:00",
      missedNextLesson: true,
    });
    expect(homeworkSectionFor(after)).toBe("completed");
    const sorted = sortHomeworkForStudent([after], lessons);
    expect(sorted.overdue).toHaveLength(0);
    expect(sorted.completed.map((a) => a.id)).toEqual(["m1"]);
  });

  it("keeps first-attempt-only work out of completed", () => {
    expect(
      homeworkSectionFor(hw("a", "attempt1_submitted", { missedNextLesson: false }))
    ).toBe("incomplete");
  });

  it("shows assigned date from assignedAt and falls back to the source lesson", () => {
    const fromAssigned = homeworkAssignedDateInfo(
      hw("a", "assigned", { assignedAt: "2026-10-14T12:00:00" }),
      lessons
    );
    expect(fromAssigned.source).toBe("assignedAt");
    expect(fromAssigned.label.toLowerCase()).toContain("октябр");
    expect(fromAssigned.label).toMatch(/14/);

    const fromLesson = homeworkAssignedDateInfo(
      hw("b", "assigned", { lessonId: "les-old" }),
      lessons
    );
    expect(fromLesson.source).toBe("lesson");
    expect(fromLesson.label.toLowerCase()).toContain("занят");

    const unknown = homeworkAssignedDateInfo(hw("c", "assigned"), lessons);
    expect(unknown.source).toBe("unknown");
    expect(unknown.label).toBe("Дата назначения неизвестна");
  });

  it("does not invent an assigned date", () => {
    const info = homeworkAssignedDateInfo(
      hw("x", "assigned", { dueAt: "2026-10-30T12:00:00" }),
      lessons
    );
    expect(info.source).toBe("unknown");
  });
});
