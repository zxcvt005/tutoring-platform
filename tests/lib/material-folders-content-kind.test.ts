import { describe, expect, it } from "vitest";

import {
  folderAcceptsMaterialKind,
  folderMatchesSection,
  isSubsectionFolder,
  primaryContentKindFromKinds,
  type MaterialFolder,
} from "@/lib/folders/material-folders";

const folders: MaterialFolder[] = [
  {
    id: "root",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: null,
    title: "Механика",
    sortOrder: 0,
    contentKind: "topic",
  },
  {
    id: "sub",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: "root",
    title: "Кинематика",
    sortOrder: 0,
    contentKind: "topic",
  },
  {
    id: "shared",
    ownerScope: "teacher",
    teacherId: "t1",
    parentId: null,
    title: "Смешанное",
    sortOrder: 1,
    contentKind: "shared",
  },
];

describe("folder content kind helpers", () => {
  it("allows materials only inside subsections", () => {
    expect(isSubsectionFolder(folders, null)).toBe(false);
    expect(isSubsectionFolder(folders, "root")).toBe(false);
    expect(isSubsectionFolder(folders, "sub")).toBe(true);
    expect(isSubsectionFolder(folders, "missing")).toBe(false);
  });

  it("matches section trees including shared/null legacy", () => {
    expect(folderMatchesSection(folders[0]!, "topic")).toBe(true);
    expect(folderMatchesSection(folders[0]!, "theory")).toBe(false);
    expect(folderMatchesSection(folders[2]!, "theory")).toBe(true);
    expect(
      folderMatchesSection(
        { ...folders[0]!, contentKind: null },
        "intensive"
      )
    ).toBe(true);
  });

  it("derives primary content kind from explorer kinds", () => {
    expect(primaryContentKindFromKinds(["folder", "topic"])).toBe("topic");
    expect(primaryContentKindFromKinds(["folder", "test"])).toBe("test");
    expect(primaryContentKindFromKinds(["folder"])).toBeNull();
  });

  it("rejects wrong entity type in typed folders but allows shared", () => {
    expect(folderAcceptsMaterialKind("topic", "topic")).toBe(true);
    expect(folderAcceptsMaterialKind("topic", "theory")).toBe(false);
    expect(folderAcceptsMaterialKind("shared", "intensive")).toBe(true);
    expect(folderAcceptsMaterialKind(null, "test")).toBe(true);
  });
});
