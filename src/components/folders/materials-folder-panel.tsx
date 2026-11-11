"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  FolderExplorer,
  type FolderExplorerItem,
} from "@/components/folders/folder-explorer";
import {
  buildFolderBreadcrumbs,
  filterFoldersByQuery,
  folderMatchesSection,
  foldersInParent,
  primaryContentKindFromKinds,
  type FolderSpace,
  type MaterialFolder,
  type MaterialFolderKind,
  type MaterialsSection,
} from "@/lib/folders/material-folders";
import { MIXED_MATERIAL_KINDS } from "@/lib/folders/material-routes";
import { useDemoStore } from "@/lib/store/demo-store";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";

export type MaterialsFolderPanelProps = {
  /** По умолчанию — смешанный список всех типов. */
  kinds?: MaterialFolderKind[];
  /** Фильтр дерева папок по типу раздела. */
  contentKind?: MaterialsSection | null;
  ownerScope?: FolderSpace["ownerScope"];
  teacherId?: string | null;
  canEdit?: boolean;
  /**
   * false — только активные материалы (по умолчанию);
   * true — только архивные (раздел архива).
   */
  showArchived?: boolean;
  onOpenMaterial?: (kind: string, id: string) => void;
  onCurrentFolderChange?: (folderId: string | null) => void;
  renderMaterialActions?: (item: FolderExplorerItem) => ReactNode;
  className?: string;
};

function materialIsArchived(meta?: Record<string, unknown>): boolean {
  return meta?.status === "archived";
}

type MaterialRef = {
  kind: Exclude<MaterialFolderKind, "folder">;
  id: string;
  title: string;
  sortOrder: number;
  folderId: string | null;
  teacherId: string;
  libraryScope?: "school" | "teacher";
  meta?: Record<string, unknown>;
};

function materialMatchesSpace(
  item: MaterialRef,
  space: FolderSpace
): boolean {
  const scope = item.libraryScope ?? "teacher";
  if (space.ownerScope === "school") return scope === "school";
  return scope === "teacher" && item.teacherId === space.teacherId;
}

function folderIdOf(
  row: { folderId?: string | null; sectionId?: string | null }
): string | null {
  if (row.folderId !== undefined) return row.folderId ?? null;
  return row.sectionId ?? null;
}

export function MaterialsFolderPanel({
  kinds = MIXED_MATERIAL_KINDS,
  contentKind: contentKindProp = null,
  ownerScope = "teacher",
  teacherId,
  canEdit = true,
  showArchived = false,
  onOpenMaterial,
  onCurrentFolderChange,
  renderMaterialActions,
  className,
}: MaterialsFolderPanelProps) {
  const {
    data,
    upsertMaterialFolder,
    deleteMaterialFolder,
    moveMaterialFolder,
    moveMaterialToFolder,
  } = useDemoStore();

  const resolvedTeacherId =
    ownerScope === "school"
      ? null
      : (teacherId ?? data.currentTeacherId ?? null);

  const space: FolderSpace = useMemo(
    () => ({
      ownerScope,
      teacherId: resolvedTeacherId,
    }),
    [ownerScope, resolvedTeacherId]
  );

  const section =
    contentKindProp ?? primaryContentKindFromKinds(kinds);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"current" | "all">("current");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function navigate(folderId: string | null) {
    setCurrentFolderId(folderId);
    onCurrentFolderChange?.(folderId);
  }

  const folders: MaterialFolder[] = useMemo(() => {
    const fromStore = data.materialFolders ?? [];
    if (fromStore.length > 0) {
      return fromStore.filter(
        (f) =>
          f.ownerScope === space.ownerScope &&
          (space.ownerScope === "school"
            ? f.teacherId == null
            : f.teacherId === space.teacherId) &&
          (section ? folderMatchesSection(f, section) : true)
      );
    }
    // Legacy fallback: корневые разделы программы.
    if (space.ownerScope !== "teacher" || !space.teacherId) return [];
    return data.topicSections
      .filter((s) => s.teacherId === space.teacherId)
      .map((s) => ({
        id: s.id,
        ownerScope: "teacher" as const,
        teacherId: s.teacherId,
        parentId: null,
        title: s.title,
        sortOrder: s.sortOrder,
        contentKind: section,
      }));
  }, [data.materialFolders, data.topicSections, space, section]);

  const materials: MaterialRef[] = useMemo(() => {
    const want = new Set(kinds);
    const out: MaterialRef[] = [];

    if (want.has("topic")) {
      for (const t of data.topics) {
        const ref: MaterialRef = {
          kind: "topic",
          id: t.id,
          title: t.title,
          sortOrder: t.sortOrder,
          folderId: folderIdOf(t),
          teacherId: t.teacherId,
          libraryScope: t.libraryScope,
          meta: { status: t.status, subject: t.subject },
        };
        if (!materialMatchesSpace(ref, space)) continue;
        if (materialIsArchived(ref.meta) !== showArchived) continue;
        out.push(ref);
      }
    }

    if (want.has("test")) {
      for (const h of data.homeworks) {
        if (!isCatalogHomeworkPurpose(h.purpose)) continue;
        const ref: MaterialRef = {
          kind: "test",
          id: h.id,
          title: h.title,
          sortOrder: 0,
          folderId: folderIdOf(h),
          teacherId: h.teacherId,
          libraryScope: h.libraryScope,
          meta: { status: h.status },
        };
        if (!materialMatchesSpace(ref, space)) continue;
        if (materialIsArchived(ref.meta) !== showArchived) continue;
        out.push(ref);
      }
    }

    if (want.has("theory")) {
      for (const t of data.theories) {
        const ref: MaterialRef = {
          kind: "theory",
          id: t.id,
          title: t.title,
          sortOrder: 0,
          folderId: folderIdOf(
            t as { folderId?: string | null; sectionId?: string | null }
          ),
          teacherId: t.teacherId,
          libraryScope: t.libraryScope,
          meta: { status: t.status },
        };
        if (!materialMatchesSpace(ref, space)) continue;
        if (materialIsArchived(ref.meta) !== showArchived) continue;
        out.push(ref);
      }
    }

    if (want.has("intensive")) {
      for (const item of data.intensives) {
        const ref: MaterialRef = {
          kind: "intensive",
          id: item.id,
          title: item.title,
          sortOrder: 0,
          folderId: folderIdOf(
            item as { folderId?: string | null; sectionId?: string | null }
          ),
          teacherId: item.teacherId,
          libraryScope: item.libraryScope,
          meta: { status: item.status },
        };
        if (!materialMatchesSpace(ref, space)) continue;
        if (materialIsArchived(ref.meta) !== showArchived) continue;
        out.push(ref);
      }
    }

    return out;
  }, [
    data.topics,
    data.homeworks,
    data.theories,
    data.intensives,
    kinds,
    space,
    showArchived,
  ]);

  const breadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folders, currentFolderId),
    [folders, currentFolderId]
  );

  const items: FolderExplorerItem[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const wantFolder = kinds.includes("folder");
    const result: FolderExplorerItem[] = [];

    if (q && searchScope === "all") {
      if (wantFolder) {
        for (const f of filterFoldersByQuery(folders, q, space, section)) {
          result.push({
            kind: "folder",
            id: f.id,
            title: f.title,
            sortOrder: f.sortOrder,
          });
        }
      }
      for (const m of materials) {
        if (!m.title.toLowerCase().includes(q)) continue;
        result.push({
          kind: m.kind,
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          meta: m.meta,
        });
      }
      return result;
    }

    if (wantFolder) {
      for (const f of foldersInParent(folders, currentFolderId, space, section)) {
        if (q && !f.title.toLowerCase().includes(q)) continue;
        result.push({
          kind: "folder",
          id: f.id,
          title: f.title,
          sortOrder: f.sortOrder,
        });
      }
    }

    for (const m of materials) {
      if (m.folderId !== currentFolderId) continue;
      if (q && !m.title.toLowerCase().includes(q)) continue;
      result.push({
        kind: m.kind,
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        meta: m.meta,
      });
    }

    return result;
  }, [
    folders,
    materials,
    currentFolderId,
    searchQuery,
    searchScope,
    kinds,
    space,
    section,
  ]);

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = (await fn()) as { ok?: boolean; error?: string } | void;
      if (r && r.ok === false) {
        setError(r.error ?? "Ошибка");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (space.ownerScope === "teacher" && !space.teacherId) {
    return (
      <div className={className}>
        <div className="panel-soft surface-sky px-5 py-8 text-center text-sm text-muted-foreground">
          Выберите преподавателя, чтобы открыть папки материалов.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <FolderExplorer
        space={space}
        kinds={kinds}
        canEdit={canEdit}
        currentFolderId={currentFolderId}
        onNavigate={navigate}
        breadcrumbs={breadcrumbs}
        folders={folders}
        items={items}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        busy={busy}
        error={error}
        onCreateFolder={async (title) => {
          const parent = currentFolderId
            ? folders.find((f) => f.id === currentFolderId)
            : null;
          const inherited =
            parent?.contentKind && parent.contentKind !== "shared"
              ? parent.contentKind
              : section;
          await withBusy(() =>
            upsertMaterialFolder({
              title,
              parentId: currentFolderId,
              ownerScope: space.ownerScope,
              teacherId: space.teacherId,
              contentKind: inherited ?? null,
            })
          );
        }}
        onRenameFolder={async (id, title) => {
          const existing = folders.find((f) => f.id === id);
          await withBusy(() =>
            upsertMaterialFolder({
              id,
              title,
              parentId: existing?.parentId ?? null,
              ownerScope: space.ownerScope,
              teacherId: space.teacherId,
              sortOrder: existing?.sortOrder,
              contentKind: existing?.contentKind ?? section ?? null,
            })
          );
        }}
        onDeleteFolder={async (id) => {
          await withBusy(() => deleteMaterialFolder(id, "move_to_parent"));
          if (currentFolderId === id) {
            const parent = folders.find((f) => f.id === id)?.parentId ?? null;
            navigate(parent);
          }
        }}
        onMoveFolder={async (id, targetParentId) => {
          await withBusy(() => moveMaterialFolder(id, targetParentId));
        }}
        onMoveMaterial={async (kind, id, targetFolderId) => {
          await withBusy(() =>
            moveMaterialToFolder(
              kind as Exclude<MaterialFolderKind, "folder">,
              id,
              targetFolderId
            )
          );
        }}
        onOpenMaterial={onOpenMaterial}
        renderMaterialActions={renderMaterialActions}
      />
    </div>
  );
}
