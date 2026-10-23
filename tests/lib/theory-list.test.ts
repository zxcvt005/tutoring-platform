import { describe, expect, it } from "vitest";

import {
  groupStudentTheories,
  incompleteTheoryCount,
  newestIncompleteTheory,
} from "@/lib/theory/list";
import { gradeWorkLabel } from "@/lib/theory/work-kind";
import type { TheoryAssignment } from "@/lib/types";

function item(
  id: string,
  status: TheoryAssignment["status"],
  assignedAt: string
): TheoryAssignment {
  return {
    id,
    materialId: "m1",
    versionId: "v1",
    teacherId: "t1",
    studentId: "s1",
    status,
    assignedAt,
    title: id,
    videoUrl: "https://vk.com/video-1_1",
    embedAllowed: true,
    hasTest: false,
    files: [],
  };
}

describe("student theory list", () => {
  it("groups by actual status, not only send date", () => {
    const grouped = groupStudentTheories([
      item("old-open", "in_progress", "2026-01-01T00:00:00.000Z"),
      item("new", "assigned", "2026-10-01T00:00:00.000Z"),
      item("done", "completed", "2026-02-01T00:00:00.000Z"),
      item("review", "awaiting_review", "2026-03-01T00:00:00.000Z"),
    ]);
    expect(grouped.map((g) => g.key)).toEqual([
      "new",
      "in_progress",
      "awaiting_review",
      "completed",
    ]);
    expect(incompleteTheoryCount(grouped.flatMap((g) => g.items))).toBe(3);
  });

  it("keeps unfinished theory visible regardless of date", () => {
    const latest = newestIncompleteTheory([
      item("done", "completed", "2026-10-20T00:00:00.000Z"),
      item("old", "viewed", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(latest?.id).toBe("old");
  });

  it("labels theory and homework differently in grades", () => {
    expect(gradeWorkLabel("theory", "Поле")).toBe("Теория — Поле");
    expect(gradeWorkLabel("homework", "Ньютон")).toBe("ДЗ — Ньютон");
  });
});
