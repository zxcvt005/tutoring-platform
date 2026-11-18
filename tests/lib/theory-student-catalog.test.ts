import { describe, expect, it } from "vitest";

import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  buildStudentTheoryCatalogItems,
  filterPublishedSchoolTheoryForStudent,
  isPublishedSchoolTheoryForStudent,
  resolveStudentTheoryItem,
  studentSystemSubjects,
  studentTheoryCatalogEmptyHint,
} from "@/lib/theory/student-catalog";
import type { TheoryAssignment, TheoryMaterial } from "@/lib/types";

function folder(
  id: string,
  systemKey: string | null,
  parentId: string | null = null
): MaterialFolder {
  return {
    id,
    ownerScope: "school",
    teacherId: null,
    parentId,
    title: id,
    sortOrder: 0,
    contentKind: "shared",
    systemKey,
  };
}

const folders: MaterialFolder[] = [
  folder("subj_phys", "subject:physics"),
  folder("g7", "grade:physics:7", "subj_phys"),
  folder("g9", "grade:physics:9", "subj_phys"),
  folder("g11", "grade:physics:11", "subj_phys"),
  folder("subj_math", "subject:math"),
  folder("m10", "grade:math:10", "subj_math"),
];

function theory(
  id: string,
  folderId: string | null,
  scope: "school" | "teacher" = "school"
): TheoryMaterial {
  return {
    id,
    teacherId: scope === "teacher" ? "t1" : "",
    libraryScope: scope,
    folderId,
    title: id,
    embedAllowed: true,
    status: "published",
    hasTest: false,
    hasVideo: true,
    fileCount: 0,
    assignedCount: 0,
    completedCount: 0,
    awaitingReviewCount: 0,
    currentVersionId: `v_${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    files: [],
    videoUrl: "https://vk.com/video-1_1",
  };
}

function assignment(
  materialId: string,
  status: TheoryAssignment["status"] = "viewed"
): TheoryAssignment {
  return {
    id: `tha_${materialId}`,
    materialId,
    versionId: `v_${materialId}`,
    teacherId: "t1",
    studentId: "s1",
    status,
    assignedAt: "2026-01-01T00:00:00.000Z",
    title: materialId,
    embedAllowed: true,
    hasTest: false,
    files: [],
    videoUrl: "https://vk.com/video-1_1",
  };
}

describe("student theory catalog", () => {
  it("matches published school materials by grade and subject for 7–11", () => {
    const materials = [
      theory("p7", "g7"),
      theory("p9", "g9"),
      theory("p11", "g11"),
      theory("m10", "m10"),
      theory("teacher", null, "teacher"),
      theory("root", null),
    ];
    for (const grade of ["7", "8", "9", "10", "11"] as const) {
      const gradeFolderId =
        grade === "7" ? "g7" : grade === "9" ? "g9" : grade === "11" ? "g11" : null;
      if (!gradeFolderId) continue;
      expect(
        isPublishedSchoolTheoryForStudent(theory(`p${grade}`, gradeFolderId), folders, {
          studentGrade: grade,
          subjects: ["physics"],
        })
      ).toBe(true);
    }
    expect(
      filterPublishedSchoolTheoryForStudent(materials, folders, {
        studentGrade: "11",
        subjects: ["physics"],
      }).map((m) => m.id)
    ).toEqual(["p11"]);
    expect(
      filterPublishedSchoolTheoryForStudent(materials, folders, {
        studentGrade: "10",
        subjects: ["math"],
      }).map((m) => m.id)
    ).toEqual(["m10"]);
    expect(
      filterPublishedSchoolTheoryForStudent(materials, folders, {
        studentGrade: "11",
        subjects: ["physics"],
      }).some((m) => m.id === "teacher")
    ).toBe(false);
  });

  it("builds catalog with progress overlay and keeps legacy progress", () => {
    const items = buildStudentTheoryCatalogItems({
      theories: [theory("p11", "g11"), theory("legacy", null, "teacher")],
      assignments: [assignment("legacy", "completed"), assignment("p11", "viewed")],
      studentId: "s1",
      folders,
      studentGrade: "11",
      subjects: ["physics"],
    });
    expect(items.map((i) => i.materialId).sort()).toEqual(["legacy", "p11"]);
    expect(items.find((i) => i.materialId === "p11")?.status).toBe("viewed");
    expect(items.find((i) => i.materialId === "legacy")?.status).toBe("completed");
  });

  it("does not duplicate a school material that already has progress", () => {
    const items = buildStudentTheoryCatalogItems({
      theories: [theory("p11", "g11")],
      assignments: [assignment("p11", "in_progress")],
      studentId: "s1",
      folders,
      studentGrade: "11",
      subjects: ["physics"],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("tha_p11");
    expect(items[0]?.materialId).toBe("p11");
    expect(items[0]?.status).toBe("in_progress");
  });

  it("synthesizes catalog entry without progress and resolves by material or assignment id", () => {
    const items = buildStudentTheoryCatalogItems({
      theories: [theory("p11", "g11")],
      assignments: [],
      studentId: "s1",
      folders,
      studentGrade: "11",
      subjects: ["physics"],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("p11");
    expect(items[0]?.status).toBe("assigned");
    expect(resolveStudentTheoryItem(items, "p11")?.title).toBe("p11");
  });

  it("resolves subjects from direction balances and empty hints", () => {
    expect(
      studentSystemSubjects({
        directionBalances: [
          { directionId: "d1", directionSlug: "physics", directionName: "Физика" },
          { directionId: "d2", directionSlug: "math", directionName: "Математика" },
        ],
      }).sort()
    ).toEqual(["math", "physics"]);
    expect(
      studentTheoryCatalogEmptyHint({ studentGrade: null, subjects: ["physics"] })
    ).toMatch(/класс/i);
    expect(
      studentTheoryCatalogEmptyHint({ studentGrade: "11", subjects: [] })
    ).toMatch(/направления/i);
  });
});
