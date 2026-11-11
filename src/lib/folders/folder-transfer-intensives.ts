import { collectFolderDescendantIds, type MaterialFolder } from "@/lib/folders/material-folders";

/**
 * Intensives live in folders but are intentionally excluded from folder
 * transfer (material_origins CHECK + no deep-copy pipeline for versions/files).
 * Count them so the UI can warn before confirm.
 */
export function countIntensivesInFolderSubtree(
  folders: readonly Pick<MaterialFolder, "id" | "parentId">[],
  intensives: readonly { folderId?: string | null }[],
  rootFolderId: string
): number {
  const ids = collectFolderDescendantIds(
    folders as MaterialFolder[],
    rootFolderId
  );
  ids.add(rootFolderId);
  let n = 0;
  for (const item of intensives) {
    const folderId = item.folderId ?? null;
    if (folderId && ids.has(folderId)) n += 1;
  }
  return n;
}

export function folderTransferIntensiveWarning(count: number): string | null {
  if (count <= 0) return null;
  const noun =
    count === 1
      ? "интенсив останется"
      : count < 5
        ? "интенсива останутся"
        : "интенсивов останутся";
  return `Внимание: ${count} ${noun} на месте — интенсивы не копируются при передаче папки (темы, тесты и теория будут скопированы).`;
}
