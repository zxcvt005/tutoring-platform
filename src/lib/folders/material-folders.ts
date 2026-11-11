import type { LibraryScope } from "@/lib/types";

/** Тип дерева папок (отдельные разделы Кафедры / Базы знаний). */
export type FolderContentKind =
  | "topic"
  | "theory"
  | "test"
  | "intensive"
  | "shared";

export type MaterialFolder = {
  id: string;
  ownerScope: LibraryScope;
  teacherId: string | null;
  parentId: string | null;
  title: string;
  sortOrder: number;
  /** null — до миграции / неизвестно; shared — смешанное наследие. */
  contentKind?: FolderContentKind | null;
};

export type MaterialFolderKind =
  | "folder"
  | "topic"
  | "test"
  | "theory"
  | "intensive";

export type FolderSpace = {
  ownerScope: LibraryScope;
  teacherId: string | null;
};

export type MaterialsSection = Exclude<FolderContentKind, "shared">;

/** Сущности только внутри подраздела (папка с родителем), не в корне раздела. */
export function isSubsectionFolder(
  folders: readonly MaterialFolder[],
  folderId: string | null
): boolean {
  if (!folderId) return false;
  const folder = folders.find((f) => f.id === folderId);
  return Boolean(folder?.parentId);
}

export function folderMatchesSection(
  folder: MaterialFolder,
  section: MaterialsSection
): boolean {
  const kind = folder.contentKind ?? null;
  return kind == null || kind === "shared" || kind === section;
}

export function primaryContentKindFromKinds(
  kinds: readonly MaterialFolderKind[]
): MaterialsSection | null {
  const entity = kinds.find(
    (k): k is MaterialsSection =>
      k === "topic" || k === "theory" || k === "test" || k === "intensive"
  );
  return entity ?? null;
}

export function normalizeFolderContentKind(
  value: string | null | undefined
): FolderContentKind | null {
  if (
    value === "topic" ||
    value === "theory" ||
    value === "test" ||
    value === "intensive" ||
    value === "shared"
  ) {
    return value;
  }
  return null;
}

/** null/shared принимают любой тип; типизированная папка — только свой. */
export function folderAcceptsMaterialKind(
  folderKind: FolderContentKind | null | undefined,
  materialKind: MaterialsSection
): boolean {
  const ck = folderKind ?? null;
  return ck == null || ck === "shared" || ck === materialKind;
}

export type FolderBreadcrumb = {
  id: string | null;
  title: string;
};

export const ROOT_FOLDER_ID = null;

/** Строит путь от корня до folderId (включая текущую). */
export function buildFolderBreadcrumbs(
  folders: readonly MaterialFolder[],
  folderId: string | null
): FolderBreadcrumb[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const crumbs: FolderBreadcrumb[] = [{ id: null, title: "Корень" }];
  if (!folderId) return crumbs;
  const chain: MaterialFolder[] = [];
  let cur: MaterialFolder | undefined = byId.get(folderId);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  chain.reverse();
  for (const item of chain) {
    crumbs.push({ id: item.id, title: item.title });
  }
  return crumbs;
}

/** Id предков folderId от родителя к корню (не включая сам folderId). */
export function collectFolderAncestorIds(
  folders: readonly MaterialFolder[],
  folderId: string | null
): string[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ids: string[] = [];
  const seen = new Set<string>();
  let cur: MaterialFolder | undefined = byId.get(folderId);
  while (cur?.parentId) {
    if (seen.has(cur.parentId)) break;
    seen.add(cur.parentId);
    ids.push(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return ids;
}

/** Все потомки folderId (не включая сам folderId). */
export function collectFolderDescendantIds(
  folders: readonly MaterialFolder[],
  folderId: string
): Set<string> {
  const children = new Map<string | null, string[]>();
  for (const f of folders) {
    const key = f.parentId;
    const list = children.get(key) ?? [];
    list.push(f.id);
    children.set(key, list);
  }
  const out = new Set<string>();
  const stack = [...(children.get(folderId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return out;
}

/**
 * Нельзя переместить папку в себя или в своего потомка.
 * targetParentId === folderId тоже запрещён.
 */
export function wouldCreateFolderCycle(
  folders: readonly MaterialFolder[],
  folderId: string,
  targetParentId: string | null
): boolean {
  if (targetParentId == null) return false;
  if (targetParentId === folderId) return true;
  return collectFolderDescendantIds(folders, folderId).has(targetParentId);
}

export function foldersInParent(
  folders: readonly MaterialFolder[],
  parentId: string | null,
  space: FolderSpace,
  section?: MaterialsSection | null
): MaterialFolder[] {
  return folders
    .filter(
      (f) =>
        f.parentId === parentId &&
        f.ownerScope === space.ownerScope &&
        (space.ownerScope === "school"
          ? f.teacherId == null
          : f.teacherId === space.teacherId) &&
        (section ? folderMatchesSection(f, section) : true)
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));
}

export function filterFoldersByQuery(
  folders: readonly MaterialFolder[],
  query: string,
  space: FolderSpace,
  section?: MaterialsSection | null
): MaterialFolder[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return folders
    .filter(
      (f) =>
        f.ownerScope === space.ownerScope &&
        (space.ownerScope === "school"
          ? f.teacherId == null
          : f.teacherId === space.teacherId) &&
        (section ? folderMatchesSection(f, section) : true) &&
        f.title.toLowerCase().includes(q)
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

export function materialFolderKindLabel(kind: MaterialFolderKind): string {
  switch (kind) {
    case "folder":
      return "Папка";
    case "topic":
      return "Тема";
    case "test":
      return "Тест";
    case "theory":
      return "Теория";
    case "intensive":
      return "Интенсив";
  }
}

/** Проверка: parent принадлежит тому же пространству, что и папка. */
export function folderParentSpaceMismatch(
  folders: readonly MaterialFolder[],
  folderId: string,
  parentId: string | null
): boolean {
  if (parentId == null) return false;
  const folder = folders.find((f) => f.id === folderId);
  const parent = folders.find((f) => f.id === parentId);
  if (!folder || !parent) return true;
  return (
    folder.ownerScope !== parent.ownerScope ||
    folder.teacherId !== parent.teacherId
  );
}

/** Сортировка смешанного списка: папки сверху, затем по sortOrder/названию. */
export function sortMixedFolderItems<
  T extends { kind: string; sortOrder: number; title: string },
>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => {
    const af = a.kind === "folder" ? 0 : 1;
    const bf = b.kind === "folder" ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru");
  });
}
