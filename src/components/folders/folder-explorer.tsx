"use client";

import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { ChevronUp, Folder, MoreHorizontal, PanelLeft } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FolderTree } from "@/components/folders/folder-tree";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  collectFolderAncestorIds,
  materialFolderKindLabel,
  wouldCreateFolderCycle,
  type FolderSpace,
  type MaterialFolder,
  type MaterialFolderKind,
} from "@/lib/folders/material-folders";
import { cn } from "@/lib/utils";

export type FolderExplorerItem = {
  kind: string;
  id: string;
  title: string;
  sortOrder: number;
  meta?: Record<string, unknown>;
};

export type FolderExplorerBreadcrumb = {
  id: string | null;
  title: string;
};

export type FolderExplorerProps = {
  space: FolderSpace;
  kinds?: Array<MaterialFolderKind>;
  canEdit: boolean;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  breadcrumbs: FolderExplorerBreadcrumb[];
  /** Полный список папок пространства — для дерева и проверки циклов при DnD. */
  folders: MaterialFolder[];
  items: FolderExplorerItem[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchScope: "current" | "all";
  onSearchScopeChange: (s: "current" | "all") => void;
  busy?: boolean;
  error?: string | null;
  onCreateFolder: (title: string) => Promise<void>;
  onRenameFolder: (id: string, title: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveFolder: (id: string, targetParentId: string | null) => Promise<void>;
  onMoveMaterial: (
    kind: string,
    id: string,
    targetFolderId: string | null
  ) => Promise<void>;
  onOpenMaterial?: (kind: string, id: string) => void;
  renderMaterialActions?: (item: FolderExplorerItem) => ReactNode;
};

const DND_MIME = "application/x-neodin-folder-item";

type DragPayload = { kind: string; id: string };

function parseDrag(e: DragEvent): DragPayload | null {
  try {
    const raw =
      e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DragPayload;
    if (!parsed?.kind || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setDrag(e: DragEvent, payload: DragPayload) {
  const raw = JSON.stringify(payload);
  e.dataTransfer.setData(DND_MIME, raw);
  e.dataTransfer.setData("text/plain", raw);
  e.dataTransfer.effectAllowed = "move";
}

export function FolderExplorer({
  space,
  kinds: _kinds,
  canEdit,
  currentFolderId,
  onNavigate,
  breadcrumbs,
  folders,
  items,
  searchQuery,
  onSearchQueryChange,
  searchScope,
  onSearchScopeChange,
  busy = false,
  error = null,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveMaterial,
  onOpenMaterial,
  renderMaterialActions,
}: FolderExplorerProps) {
  void _kinds;
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [renameTarget, setRenameTarget] = useState<FolderExplorerItem | null>(
    null
  );
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FolderExplorerItem | null>(
    null
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [dropHighlight, setDropHighlight] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  const parentId =
    breadcrumbs.length > 1
      ? (breadcrumbs[breadcrumbs.length - 2]?.id ?? null)
      : null;

  useEffect(() => {
    const ancestors = collectFolderAncestorIds(folders, currentFolderId);
    if (ancestors.length === 0) return;
    setExpandedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentFolderId, folders]);

  const sortedItems = useMemo(() => {
    const foldersFirst = items.slice().sort((a, b) => {
      const af = a.kind === "folder" ? 0 : 1;
      const bf = b.kind === "folder" ? 0 : 1;
      if (af !== bf) return af - bf;
      return (
        a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")
      );
    });
    return foldersFirst;
  }, [items]);

  const hasQuery = searchQuery.trim().length > 0;
  const showEmpty = !busy && !error && sortedItems.length === 0 && !hasQuery;
  const showNoResults = !busy && !error && sortedItems.length === 0 && hasQuery;

  function canDropOnFolder(targetFolderId: string | null, payload: DragPayload) {
    if (payload.kind === "folder") {
      if (wouldCreateFolderCycle(folders, payload.id, targetFolderId)) {
        return false;
      }
      const current = folders.find((f) => f.id === payload.id);
      if (current && current.parentId === targetFolderId) return false;
      return true;
    }
    return true;
  }

  async function handleDrop(
    targetFolderId: string | null,
    payload: DragPayload
  ) {
    if (!canEdit) return;
    if (!canDropOnFolder(targetFolderId, payload)) return;
    setActionBusy(true);
    try {
      if (payload.kind === "folder") {
        await onMoveFolder(payload.id, targetFolderId);
      } else {
        await onMoveMaterial(payload.kind, payload.id, targetFolderId);
      }
    } finally {
      setActionBusy(false);
      setDropHighlight(null);
    }
  }

  function onDragOverTarget(
    e: DragEvent,
    targetKey: string,
    targetFolderId: string | null
  ) {
    if (!canEdit) return;
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(DND_MIME) && !types.includes("text/plain")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHighlight(targetKey);
    void targetFolderId;
  }

  function toggleExpand(folderId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function navigateFromTree(folderId: string | null) {
    onNavigate(folderId);
    setMobileTreeOpen(false);
  }

  async function submitCreate() {
    const title = createTitle.trim();
    if (!title) return;
    setActionBusy(true);
    try {
      await onCreateFolder(title);
      setCreateOpen(false);
      setCreateTitle("");
    } finally {
      setActionBusy(false);
    }
  }

  async function submitRename() {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title) return;
    setActionBusy(true);
    try {
      await onRenameFolder(renameTarget.id, title);
      setRenameTarget(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await onDeleteFolder(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setActionBusy(false);
    }
  }

  const locked = busy || actionBusy;

  const treeProps = {
    space,
    folders,
    currentFolderId,
    expandedIds,
    onToggleExpand: toggleExpand,
    onNavigate: navigateFromTree,
    locked,
    canEdit,
    dropHighlight,
    onDragOverTarget,
    onDragLeave: () => setDropHighlight(null),
    onDropFolder: (targetFolderId: string | null, e: DragEvent) => {
      const payload = parseDrag(e);
      setDropHighlight(null);
      if (payload) void handleDrop(targetFolderId, payload);
    },
  } as const;

  return (
    <div className="panel overflow-hidden">
      <div className="flex min-h-[20rem]">
        <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border/70 bg-muted/15 md:flex">
          <div className="border-b border-border/60 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Папки
          </div>
          <FolderTree {...treeProps} className="min-h-0 flex-1 py-1" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/10 px-3 py-2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="md:hidden"
              disabled={locked}
              onClick={() => setMobileTreeOpen(true)}
              aria-label="Открыть дерево папок"
            >
              <PanelLeft className="size-3.5" />
              Папки
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={currentFolderId == null || locked}
              onClick={() => onNavigate(parentId)}
              aria-label="На уровень выше"
            >
              <ChevronUp className="size-3.5" />
              Вверх
            </Button>

            <nav
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm"
              aria-label="Путь"
            >
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const key = crumb.id ?? "root";
                return (
                  <span key={key} className="flex items-center gap-1">
                    {index > 0 ? (
                      <span className="text-muted-foreground/60">/</span>
                    ) : null}
                    <button
                      type="button"
                      disabled={isLast || locked}
                      title={crumb.title}
                      className={cn(
                        "max-w-[10rem] truncate rounded px-1.5 py-0.5 text-left transition-colors",
                        isLast
                          ? "font-medium text-foreground"
                          : "text-[#3166F0] hover:bg-[#3166F0]/10",
                        dropHighlight === `crumb:${key}` && "bg-[#3166F0]/10"
                      )}
                      onClick={() => onNavigate(crumb.id)}
                      onDragOver={(e) =>
                        onDragOverTarget(e, `crumb:${key}`, crumb.id)
                      }
                      onDragLeave={() => setDropHighlight(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const payload = parseDrag(e);
                        setDropHighlight(null);
                        if (payload) void handleDrop(crumb.id, payload);
                      }}
                    >
                      {crumb.title}
                    </button>
                  </span>
                );
              })}
            </nav>

            {canEdit ? (
              <Button
                type="button"
                size="sm"
                disabled={locked}
                onClick={() => {
                  setCreateTitle("");
                  setCreateOpen(true);
                }}
              >
                Новая папка
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-border/60 px-3 py-2">
            <Input
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Поиск…"
              className="h-8 max-w-xs border-transparent bg-background"
              disabled={locked}
            />
            <div
              className="inline-flex items-center gap-3 text-xs"
              role="tablist"
              aria-label="Область поиска"
            >
              <button
                type="button"
                role="tab"
                aria-selected={searchScope === "current"}
                disabled={locked}
                className={cn(
                  "border-b-2 pb-1 transition-colors",
                  searchScope === "current"
                    ? "border-[#3166F0] font-medium text-[#3166F0]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onSearchScopeChange("current")}
              >
                В этой папке
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchScope === "all"}
                disabled={locked}
                className={cn(
                  "border-b-2 pb-1 transition-colors",
                  searchScope === "all"
                    ? "border-[#3166F0] font-medium text-[#3166F0]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onSearchScopeChange("all")}
              >
                Везде
              </button>
            </div>
          </div>

          <div className="relative min-h-[12rem] flex-1">
            {busy ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Загрузка…
              </div>
            ) : null}

            {error ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-destructive">
                  Не удалось загрузить содержимое
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            ) : null}

            {showEmpty ? (
              <div className="p-3">
                <EmptyState
                  title="Папка пуста"
                  description={
                    canEdit
                      ? "Создайте папку или перенесите сюда материалы."
                      : "Здесь пока нет материалов."
                  }
                />
              </div>
            ) : null}

            {showNoResults ? (
              <div className="p-3">
                <EmptyState
                  title="Ничего не найдено"
                  description="Измените запрос или область поиска."
                />
              </div>
            ) : null}

            {!busy && !error && sortedItems.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {sortedItems.map((item) => {
                  const isFolder = item.kind === "folder";
                  const kindLabel = materialFolderKindLabel(
                    (isFolder ? "folder" : item.kind) as MaterialFolderKind
                  );
                  const rowKey = `${item.kind}:${item.id}`;
                  return (
                    <li
                      key={rowKey}
                      className={cn(
                        "flex flex-wrap items-center gap-2 px-3 py-2.5 transition-colors",
                        dropHighlight === rowKey && isFolder && "bg-[#3166F0]/8"
                      )}
                      draggable={canEdit && !locked}
                      onDragStart={(e) => {
                        if (!canEdit) return;
                        setDrag(e, { kind: item.kind, id: item.id });
                      }}
                      onDragEnd={() => setDropHighlight(null)}
                      onDragOver={
                        isFolder
                          ? (e) => onDragOverTarget(e, rowKey, item.id)
                          : undefined
                      }
                      onDragLeave={
                        isFolder ? () => setDropHighlight(null) : undefined
                      }
                      onDrop={
                        isFolder
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const payload = parseDrag(e);
                              setDropHighlight(null);
                              if (payload && payload.id !== item.id) {
                                void handleDrop(item.id, payload);
                              }
                            }
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        disabled={locked}
                        title={item.title}
                        onClick={() => {
                          if (isFolder) onNavigate(item.id);
                          else onOpenMaterial?.(item.kind, item.id);
                        }}
                        onDoubleClick={() => {
                          if (isFolder) onNavigate(item.id);
                          else onOpenMaterial?.(item.kind, item.id);
                        }}
                      >
                        {isFolder ? (
                          <Folder
                            className="size-4 shrink-0 text-[#3166F0]"
                            strokeWidth={1.75}
                          />
                        ) : (
                          <span className="inline-flex h-5 min-w-14 items-center justify-center rounded-md bg-muted px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {kindLabel}
                          </span>
                        )}
                        <span className="min-w-0 truncate font-medium">
                          {item.title}
                        </span>
                        {isFolder ? (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            Папка
                          </span>
                        ) : null}
                      </button>

                      <div className="flex items-center gap-1">
                        {!isFolder && renderMaterialActions
                          ? renderMaterialActions(item)
                          : null}
                        {canEdit && isFolder ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={locked}
                              className="inline-flex size-7 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Действия с папкой"
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-40">
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenameTarget(item);
                                  setRenameTitle(item.title);
                                }}
                              >
                                Переименовать
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(item)}
                              >
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
        <SheetContent
          side="left"
          className="w-[min(18rem,88vw)] gap-0 p-0 sm:max-w-[16rem]"
        >
          <SheetHeader className="border-b border-border/70 px-3 py-3">
            <SheetTitle className="text-sm">Папки</SheetTitle>
          </SheetHeader>
          <FolderTree {...treeProps} className="min-h-0 flex-1 py-1" />
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Новая папка</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="folder-create-title">Название</Label>
            <Input
              id="folder-create-title"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitCreate();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={actionBusy}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!createTitle.trim() || actionBusy}
              onClick={() => void submitCreate()}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Переименовать папку</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="folder-rename-title">Название</Label>
            <Input
              id="folder-rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitRename();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={actionBusy}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!renameTitle.trim() || actionBusy}
              onClick={() => void submitRename()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить папку?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Содержимое «{deleteTarget?.title}» будет перенесено в родительскую
            папку.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={actionBusy}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy}
              onClick={() => void submitDelete()}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
