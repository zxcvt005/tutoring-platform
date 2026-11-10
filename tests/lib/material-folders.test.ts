import { describe, expect, it } from "vitest";

import {
  buildFolderBreadcrumbs,
  collectFolderAncestorIds,
  collectFolderDescendantIds,
  filterFoldersByQuery,
  folderParentSpaceMismatch,
  foldersInParent,
  sortMixedFolderItems,
  wouldCreateFolderCycle,
  type MaterialFolder,
} from "@/lib/folders/material-folders";
import { MIXED_MATERIAL_KINDS } from "@/lib/folders/material-routes";

const folders: MaterialFolder[] = [
  {
    id: "a",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: null,
    title: "Механика",
    sortOrder: 0,
  },
  {
    id: "b",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: "a",
    title: "Кинематика",
    sortOrder: 0,
  },
  {
    id: "c",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: "b",
    title: "Равноускоренное",
    sortOrder: 0,
  },
  {
    id: "d",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: null,
    title: "Оптика",
    sortOrder: 1,
  },
];

describe("material folder helpers", () => {
  it("builds breadcrumbs from root to leaf", () => {
    expect(buildFolderBreadcrumbs(folders, "c").map((x) => x.title)).toEqual([
      "Корень",
      "Механика",
      "Кинематика",
      "Равноускоренное",
    ]);
    expect(buildFolderBreadcrumbs(folders, null)).toEqual([
      { id: null, title: "Корень" },
    ]);
  });

  it("collects ancestor ids toward the root", () => {
    expect(collectFolderAncestorIds(folders, "c")).toEqual(["b", "a"]);
    expect(collectFolderAncestorIds(folders, "a")).toEqual([]);
    expect(collectFolderAncestorIds(folders, null)).toEqual([]);
  });

  it("lists children and searches by title", () => {
    expect(foldersInParent(folders, null, { ownerScope: "teacher", teacherId: "t1" }).map((f) => f.id)).toEqual([
      "a",
      "d",
    ]);
    expect(
      foldersInParent(folders, "a", { ownerScope: "teacher", teacherId: "t1" }).map(
        (f) => f.id
      )
    ).toEqual(["b"]);
    expect(
      filterFoldersByQuery(folders, "кин", {
        ownerScope: "teacher",
        teacherId: "t1",
      }).map((f) => f.id)
    ).toEqual(["b"]);
  });

  it("detects cycles and collects descendants", () => {
    expect(collectFolderDescendantIds(folders, "a")).toEqual(new Set(["b", "c"]));
    expect(wouldCreateFolderCycle(folders, "a", "c")).toBe(true);
    expect(wouldCreateFolderCycle(folders, "a", "a")).toBe(true);
    expect(wouldCreateFolderCycle(folders, "a", "d")).toBe(false);
    expect(wouldCreateFolderCycle(folders, "a", null)).toBe(false);
  });

  it("flags cross-space parents and sorts mixed explorer rows", () => {
    const withSchool: MaterialFolder[] = [
      ...folders,
      {
        id: "school-root",
        ownerScope: "school",
        teacherId: null,
        parentId: null,
        title: "Школа",
        sortOrder: 0,
      },
    ];
    expect(folderParentSpaceMismatch(withSchool, "a", "school-root")).toBe(true);
    expect(folderParentSpaceMismatch(folders, "b", "a")).toBe(false);
    expect(MIXED_MATERIAL_KINDS).toEqual([
      "folder",
      "topic",
      "test",
      "theory",
      "intensive",
    ]);
    expect(
      sortMixedFolderItems([
        { kind: "test", sortOrder: 0, title: "Б" },
        { kind: "folder", sortOrder: 1, title: "А" },
        { kind: "topic", sortOrder: 0, title: "А" },
      ]).map((i) => `${i.kind}:${i.title}`)
    ).toEqual(["folder:А", "topic:А", "test:Б"]);
  });
});
