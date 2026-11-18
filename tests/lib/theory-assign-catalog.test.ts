import { describe, expect, it } from "vitest";

import type { MaterialFolder } from "@/lib/folders/material-folders";
import { gradeSystemKey, subjectSystemKey } from "@/lib/folders/system-kb-structure";
import {
  filterTheoryCatalogForStudent,
  theoryCatalogEmptyHint,
  theoryDirectionOptionsForStudent,
} from "@/lib/theory/assign-catalog";
import type { TheoryMaterial } from "@/lib/types";

function theory(
  id: string,
  folderId: string | null,
  libraryScope: "school" | "teacher" = "school"
): TheoryMaterial {
  return {
    id,
    teacherId: "t1",
    libraryScope,
    folderId,
    title: id,
    embedAllowed: true,
    status: "published",
    hasTest: false,
    hasVideo: false,
    fileCount: 0,
    assignedCount: 0,
    completedCount: 0,
    awaitingReviewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const folders: MaterialFolder[] = [
  {
    id: "phys",
    ownerScope: "school",
    teacherId: null,
    parentId: null,
    title: "Физика",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: subjectSystemKey("physics"),
  },
  {
    id: "phys7",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "7 класс",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "7"),
  },
  {
    id: "phys9",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "9 класс",
    sortOrder: 2,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "9"),
  },
  {
    id: "phys10",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "10 класс",
    sortOrder: 3,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "10"),
  },
  {
    id: "phys11",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "11 класс",
    sortOrder: 4,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "11"),
  },
  {
    id: "math",
    ownerScope: "school",
    teacherId: null,
    parentId: null,
    title: "Математика",
    sortOrder: 1,
    contentKind: "shared",
    systemKey: subjectSystemKey("math"),
  },
  {
    id: "math10",
    ownerScope: "school",
    teacherId: null,
    parentId: "math",
    title: "10 класс",
    sortOrder: 3,
    contentKind: "shared",
    systemKey: gradeSystemKey("math", "10"),
  },
  {
    id: "teacher-root",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: null,
    title: "Мои материалы",
    sortOrder: 0,
    contentKind: "shared",
  },
];

const materials = [
  theory("phys7", "phys7"),
  theory("phys9", "phys9"),
  theory("phys10", "phys10"),
  theory("phys11", "phys11"),
  theory("math10", "math10"),
  theory("loose", null, "teacher"),
  theory("teacher-own", "teacher-root", "teacher"),
];

describe("theory assign catalog", () => {
  it("shows only matching grade/subject for physics students", () => {
    for (const grade of ["7", "9", "10", "11"] as const) {
      const ids = filterTheoryCatalogForStudent(materials, folders, {
        directionId: "d-phys",
        directions: [{ id: "d-phys", slug: "physics", name: "Физика" }],
        studentGrade: grade,
      }).map((m) => m.id);
      expect(ids).toContain(`phys${grade}`);
      expect(ids).toContain("loose");
      expect(ids).toContain("teacher-own");
      for (const other of ["7", "9", "10", "11"] as const) {
        if (other === grade) continue;
        expect(ids).not.toContain(`phys${other}`);
      }
      expect(ids).not.toContain("math10");
    }
  });

  it("filters math separately from physics for grade 10", () => {
    const ids = filterTheoryCatalogForStudent(materials, folders, {
      directionId: "d-math",
      directions: [{ id: "d-math", slug: "math", name: "Математика" }],
      studentGrade: "10",
    }).map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(["math10", "loose", "teacher-own"])
    );
    expect(ids).not.toContain("phys10");
  });

  it("updates empty hint when direction is missing", () => {
    expect(
      theoryCatalogEmptyHint({
        student: { grade: "10" },
        directionId: null,
        directions: [],
      })
    ).toMatch(/направление/i);
  });

  it("reads direction options from student card balances", () => {
    const opts = theoryDirectionOptionsForStudent(
      {
        id: "s1",
        directionBalances: [
          {
            directionId: "d-phys",
            directionName: "Физика",
            balance: 2,
          },
        ],
      },
      [],
      [{ id: "d-phys", slug: "physics", name: "Физика ЕГЭ" }]
    );
    expect(opts).toEqual([{ id: "d-phys", name: "Физика" }]);
  });
});
