import { describe, expect, it } from "vitest";

import { isContactOverdue } from "@/lib/press-contacts";
import { pressStudentBucket } from "@/lib/press-students";

describe("press student buckets and contacts", () => {
  it("maps archived / unassigned / assigned students", () => {
    expect(pressStudentBucket({ status: "archived", teacherId: "t1" })).toBe(
      "archived"
    );
    expect(pressStudentBucket({ status: "active", teacherId: "" })).toBe("new");
    expect(pressStudentBucket({ status: "paused", teacherId: "t1" })).toBe(
      "active"
    );
  });

  it("marks scheduled contacts overdue after dueAt", () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    expect(
      isContactOverdue(
        { status: "scheduled", dueAt: "2026-10-20T11:00:00.000Z" },
        now
      )
    ).toBe(true);
    expect(
      isContactOverdue(
        { status: "completed", dueAt: "2026-10-20T11:00:00.000Z" },
        now
      )
    ).toBe(false);
  });
});
