import { describe, expect, it } from "vitest";

import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  buildGradeTheoryCatalogItems,
  sortTheoryItemsByGradeOrder,
} from "@/lib/theory/student-catalog";
import type { TheoryMaterial } from "@/lib/types";

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
  folder("g10", "grade:physics:10", "subj_phys"),
  folder("g11", "grade:physics:11", "subj_phys"),
];

function theory(id: string, folderId: string): TheoryMaterial {
  return {
    id,
    teacherId: "",
    libraryScope: "school",
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

describe("theory grade catalog order", () => {
  it("sorts by per-grade order and keeps other grades independent", () => {
    const items = [
      { materialId: "a", assignedAt: "2026-01-03T00:00:00.000Z" },
      { materialId: "b", assignedAt: "2026-01-02T00:00:00.000Z" },
      { materialId: "c", assignedAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(
      sortTheoryItemsByGradeOrder(items, "10", [
        { grade: "10", materialId: "c", sortOrder: 0 },
        { grade: "10", materialId: "a", sortOrder: 1 },
        { grade: "10", materialId: "b", sortOrder: 2 },
        { grade: "11", materialId: "a", sortOrder: 0 },
      ]).map((i) => i.materialId)
    ).toEqual(["c", "a", "b"]);
  });

  it("builds grade preview catalog without progress rows", () => {
    const draft = theory("draft", "g10");
    draft.status = "draft";
    const catalog = buildGradeTheoryCatalogItems({
      theories: [theory("t10", "g10"), theory("t11", "g11"), draft],
      folders,
      grade: "10",
      catalogOrder: [{ grade: "10", materialId: "t10", sortOrder: 0 }],
    });
    expect(catalog.map((c) => c.materialId)).toEqual(["t10"]);
  });
});
