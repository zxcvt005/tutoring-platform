"use client";

import { useMemo, type DragEvent } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

import {
  foldersInParent,
  type FolderSpace,
  type MaterialFolder,
} from "@/lib/folders/material-folders";
import { cn } from "@/lib/utils";

export type FolderTreeProps = {
  space: FolderSpace;
  folders: MaterialFolder[];
  currentFolderId: string | null;
  expandedIds: ReadonlySet<string>;
  onToggleExpand: (folderId: string) => void;
  onNavigate: (folderId: string | null) => void;
  locked?: boolean;
  canEdit?: boolean;
  dropHighlight?: string | null;
  onDragOverTarget?: (
    e: DragEvent,
    targetKey: string,
    targetFolderId: string | null
  ) => void;
  onDragLeave?: () => void;
  onDropFolder?: (targetFolderId: string | null, e: DragEvent) => void;
  className?: string;
};

type TreeNodeProps = {
  folder: MaterialFolder;
  depth: number;
  childrenByParent: Map<string | null, MaterialFolder[]>;
  currentFolderId: string | null;
  expandedIds: ReadonlySet<string>;
  onToggleExpand: (folderId: string) => void;
  onNavigate: (folderId: string | null) => void;
  locked: boolean;
  canEdit: boolean;
  dropHighlight: string | null;
  onDragOverTarget?: FolderTreeProps["onDragOverTarget"];
  onDragLeave?: () => void;
  onDropFolder?: FolderTreeProps["onDropFolder"];
};

function TreeNode({
  folder,
  depth,
  childrenByParent,
  currentFolderId,
  expandedIds,
  onToggleExpand,
  onNavigate,
  locked,
  canEdit,
  dropHighlight,
  onDragOverTarget,
  onDragLeave,
  onDropFolder,
}: TreeNodeProps) {
  const children = childrenByParent.get(folder.id) ?? [];
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(folder.id);
  const active = currentFolderId === folder.id;
  const dropKey = `tree:${folder.id}`;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md pr-1.5 transition-colors",
          active && "bg-[#3166F0]/10",
          dropHighlight === dropKey && "bg-[#3166F0]/10",
          !active && "hover:bg-muted/50"
        )}
        style={{ paddingLeft: `${0.35 + depth * 0.7}rem` }}
        onDragOver={
          canEdit && onDragOverTarget
            ? (e) => onDragOverTarget(e, dropKey, folder.id)
            : undefined
        }
        onDragLeave={canEdit ? onDragLeave : undefined}
        onDrop={
          canEdit && onDropFolder
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropFolder(folder.id, e);
              }
            : undefined
        }
      >
        {hasChildren ? (
          <button
            type="button"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Свернуть" : "Развернуть"}
            aria-expanded={expanded}
            disabled={locked}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(folder.id);
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
        ) : (
          <span className="inline-block size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          disabled={locked}
          title={folder.title}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px] leading-snug",
            active ? "font-medium text-[#3166F0]" : "text-foreground/90"
          )}
          onClick={() => onNavigate(folder.id)}
        >
          <Folder
            className={cn(
              "size-3.5 shrink-0",
              active ? "text-[#3166F0]" : "text-muted-foreground"
            )}
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate">{folder.title}</span>
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="m-0 list-none p-0">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              currentFolderId={currentFolderId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
              locked={locked}
              canEdit={canEdit}
              dropHighlight={dropHighlight}
              onDragOverTarget={onDragOverTarget}
              onDragLeave={onDragLeave}
              onDropFolder={onDropFolder}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FolderTree({
  space,
  folders,
  currentFolderId,
  expandedIds,
  onToggleExpand,
  onNavigate,
  locked = false,
  canEdit = false,
  dropHighlight = null,
  onDragOverTarget,
  onDragLeave,
  onDropFolder,
  className,
}: FolderTreeProps) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, MaterialFolder[]>();
    const scoped = folders.filter(
      (f) =>
        f.ownerScope === space.ownerScope &&
        (space.ownerScope === "school"
          ? f.teacherId == null
          : f.teacherId === space.teacherId)
    );
    for (const f of scoped) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    for (const [, list] of map) {
      list.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")
      );
    }
    return map;
  }, [folders, space]);

  const roots = childrenByParent.get(null) ?? foldersInParent(folders, null, space);
  const rootActive = currentFolderId == null;
  const rootDropKey = "tree:root";

  return (
    <nav className={cn("flex h-full min-h-0 flex-col", className)} aria-label="Дерево папок">
      <div
        className={cn(
          "mx-1 mb-0.5 flex items-center rounded-md px-2 py-1.5 transition-colors",
          rootActive && "bg-[#3166F0]/10",
          dropHighlight === rootDropKey && "bg-[#3166F0]/10",
          !rootActive && "hover:bg-muted/50"
        )}
        onDragOver={
          canEdit && onDragOverTarget
            ? (e) => onDragOverTarget(e, rootDropKey, null)
            : undefined
        }
        onDragLeave={canEdit ? onDragLeave : undefined}
        onDrop={
          canEdit && onDropFolder
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropFolder(null, e);
              }
            : undefined
        }
      >
        <button
          type="button"
          disabled={locked}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] leading-snug",
            rootActive ? "font-medium text-[#3166F0]" : "text-foreground/90"
          )}
          onClick={() => onNavigate(null)}
        >
          <Folder
            className={cn(
              "size-3.5 shrink-0",
              rootActive ? "text-[#3166F0]" : "text-muted-foreground"
            )}
            strokeWidth={1.75}
          />
          <span className="truncate">Корень</span>
        </button>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-1 pb-2">
        {roots.map((folder) => (
          <TreeNode
            key={folder.id}
            folder={folder}
            depth={0}
            childrenByParent={childrenByParent}
            currentFolderId={currentFolderId}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onNavigate={onNavigate}
            locked={locked}
            canEdit={canEdit}
            dropHighlight={dropHighlight}
            onDragOverTarget={onDragOverTarget}
            onDragLeave={onDragLeave}
            onDropFolder={onDropFolder}
          />
        ))}
      </ul>
    </nav>
  );
}
