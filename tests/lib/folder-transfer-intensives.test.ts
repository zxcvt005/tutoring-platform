import { describe, expect, it } from "vitest";

import {
  countIntensivesInFolderSubtree,
  folderTransferIntensiveWarning,
} from "@/lib/folders/folder-transfer-intensives";
import type { MaterialFolder } from "@/lib/folders/material-folders";

function folder(
  id: string,
  parentId: string | null = null
): MaterialFolder {
  return {
    id,
    ownerScope: "school",
    teacherId: null,
    parentId,
    title: id,
    sortOrder: 0,
  };
}

describe("folder transfer intensive warnings", () => {
  it("counts intensives in the folder subtree only", () => {
    const folders = [
      folder("root"),
      folder("child", "root"),
      folder("other"),
    ];
    const intensives = [
      { folderId: "child" },
      { folderId: "root" },
      { folderId: "other" },
      { folderId: null },
    ];
    expect(countIntensivesInFolderSubtree(folders, intensives, "root")).toBe(2);
    expect(countIntensivesInFolderSubtree(folders, intensives, "other")).toBe(1);
  });

  it("builds a clear warning only when intensives exist", () => {
    expect(folderTransferIntensiveWarning(0)).toBeNull();
    expect(folderTransferIntensiveWarning(2)).toMatch(/не копируются/i);
  });
});
