import { describe, expect, it } from "vitest";

import { nextTeacherFilterAfterStudentSave } from "@/lib/students/teacher-filter-after-save";

describe("nextTeacherFilterAfterStudentSave", () => {
  it("switches from unassigned to the assigned teacher after create", () => {
    expect(
      nextTeacherFilterAfterStudentSave({
        mode: "direkciya",
        listSection: "work",
        savedTeacherId: "t1",
        currentFilter: "unassigned",
      })
    ).toBe("t1");
  });

  it("switches to unassigned when saving without a teacher while viewing a teacher", () => {
    expect(
      nextTeacherFilterAfterStudentSave({
        mode: "direkciya",
        listSection: "work",
        savedTeacherId: "",
        currentFilter: "t1",
      })
    ).toBe("unassigned");
  });

  it("does not change kafedra or archive filters", () => {
    expect(
      nextTeacherFilterAfterStudentSave({
        mode: "kafedra",
        listSection: "work",
        savedTeacherId: "t1",
        currentFilter: "t1",
      })
    ).toBeNull();
    expect(
      nextTeacherFilterAfterStudentSave({
        mode: "direkciya",
        listSection: "archive",
        savedTeacherId: "t1",
        currentFilter: "unassigned",
      })
    ).toBeNull();
  });
});
