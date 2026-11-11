import { describe, expect, it } from "vitest";

import {
  countUnassignedActiveStudents,
  isUnassignedActiveStudent,
} from "@/lib/students/unassigned";

describe("unassigned active students counter", () => {
  it("is zero when every non-archived student has a teacher", () => {
    const students = [
      { id: "s1", teacherId: "t1", status: "active" as const },
      { id: "s2", teacherId: "t2", status: "paused" as const },
      { id: "s3", teacherId: "t1", status: "active" as const },
    ];
    expect(countUnassignedActiveStudents(students)).toBe(0);
    expect(students.every((s) => !isUnassignedActiveStudent(s))).toBe(true);
  });

  it("increments for each student without a teacher", () => {
    const students = [
      { id: "s1", teacherId: "t1", status: "active" as const },
      { id: "s2", teacherId: "", status: "active" as const },
      { id: "s3", teacherId: null, status: "paused" as const },
    ];
    expect(countUnassignedActiveStudents(students)).toBe(2);
  });

  it("excludes archived students even when teacherId was cleared", () => {
    const students = [
      { id: "s1", teacherId: null, status: "archived" as const },
      { id: "s2", teacherId: "", status: "archived" as const },
      { id: "s3", teacherId: "t1", status: "active" as const },
    ];
    expect(countUnassignedActiveStudents(students)).toBe(0);
    expect(isUnassignedActiveStudent(students[0]!)).toBe(false);
  });

  it("does not mix organizations — caller passes already-scoped org list", () => {
    const orgA = [
      { id: "a1", teacherId: "t1", status: "active" as const },
      { id: "a2", teacherId: "", status: "active" as const },
    ];
    const orgB = [
      { id: "b1", teacherId: null, status: "active" as const },
      { id: "b2", teacherId: null, status: "active" as const },
    ];
    expect(countUnassignedActiveStudents(orgA)).toBe(1);
    expect(countUnassignedActiveStudents(orgB)).toBe(2);
    // Bootstrap for org A never includes org B rows; counter stays org-local.
    expect(countUnassignedActiveStudents(orgA)).not.toBe(
      countUnassignedActiveStudents([...orgA, ...orgB])
    );
  });
});
