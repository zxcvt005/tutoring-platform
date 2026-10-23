"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HintTooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { canRunConfirmedAction } from "@/lib/confirm-action";
import type { UserNoteView } from "@/lib/notes/types";
import {
  apiNotesCreate,
  apiNotesDelete,
  apiNotesList,
  apiNotesUpdate,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 650;

export function NotesWidget({
  offsetForChat = false,
}: {
  offsetForChat?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<UserNoteView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [mobileEditor, setMobileEditor] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const timer = useRef<number | undefined>(undefined);
  const saveGen = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const statusRef = useRef<SaveStatus>("idle");

  const active = notes.find((n) => n.id === activeId) ?? null;

  const markStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const adoptNote = useCallback(
    (note: UserNoteView | null) => {
      activeIdRef.current = note?.id ?? null;
      titleRef.current = note?.title ?? "";
      contentRef.current = note?.content ?? "";
      markStatus("idle");
      setActiveId(note?.id ?? null);
      setTitle(note?.title ?? "");
      setContent(note?.content ?? "");
      setMobileEditor(Boolean(note));
    },
    [markStatus]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiNotesList();
      setNotes(data.notes);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось загрузить заметки"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const flushSave = useCallback(async (id: string, nextTitle: string, nextContent: string) => {
    const gen = ++saveGen.current;
    markStatus("saving");
    try {
      const data = await apiNotesUpdate(id, {
        title: nextTitle,
        content: nextContent,
      });
      if (gen !== saveGen.current) return;
      setNotes((prev) =>
        prev.map((n) => (n.id === data.note.id ? data.note : n))
      );
      markStatus("saved");
    } catch (err) {
      if (gen !== saveGen.current) return;
      markStatus("error");
      toast.error(
        err instanceof Error ? err.message : "Не удалось сохранить заметку"
      );
    }
  }, [markStatus]);

  const scheduleSave = useCallback(() => {
    if (!activeIdRef.current) return;
    markStatus("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    const id = activeIdRef.current;
    timer.current = window.setTimeout(() => {
      void flushSave(id, titleRef.current, contentRef.current);
    }, SAVE_DELAY_MS);
  }, [flushSave, markStatus]);

  const flushNow = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    const id = activeIdRef.current;
    if (!id) return;
    if (statusRef.current !== "dirty" && statusRef.current !== "error") return;
    await flushSave(id, titleRef.current, contentRef.current);
  }, [flushSave]);

  useEffect(() => {
    const onHide = () => {
      void flushNow();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [flushNow]);

  async function selectNote(note: UserNoteView) {
    await flushNow();
    saveGen.current += 1;
    adoptNote(note);
  }

  async function create() {
    await flushNow();
    try {
      const data = await apiNotesCreate();
      setNotes((prev) => [data.note, ...prev]);
      adoptNote(data.note);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось создать заметку"
      );
    }
  }

  async function confirmDelete() {
    if (
      !canRunConfirmedAction({ open: deleteOpen, busy: deleteBusy }) ||
      !activeId
    ) {
      return;
    }
    const id = activeId;
    setDeleteBusy(true);
    try {
      await apiNotesDelete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      adoptNote(null);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось удалить заметку"
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  const saveLabel =
    status === "saving"
      ? "Сохранение…"
      : status === "saved"
        ? "Сохранено"
        : status === "error"
          ? "Ошибка сохранения"
          : status === "dirty"
            ? "Не сохранено"
            : "";

  return (
    <div
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-2"
      style={{
        right: "max(1rem, env(safe-area-inset-right))",
        bottom: offsetForChat
          ? "calc(max(1rem, env(safe-area-inset-bottom)) + 3.5rem)"
          : "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {open ? (
        <section className="pointer-events-auto flex h-[min(32rem,calc(100svh-7rem))] w-[min(44rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg max-md:h-[calc(100svh-6.5rem)] max-md:w-[calc(100vw-1.5rem)]">
          <aside
            className={cn(
              "flex w-[min(16rem,42%)] shrink-0 flex-col border-r border-border/80",
              mobileEditor && "max-md:hidden"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <h2 className="font-display text-sm font-semibold">Заметки</h2>
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                aria-label="Создать заметку"
                onClick={() => void create()}
              >
                <Plus />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && notes.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  Загрузка…
                </p>
              ) : notes.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  Пока нет заметок. Нажмите +, чтобы создать первую.
                </p>
              ) : (
                <ul>
                  {notes.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full px-3 py-2.5 text-left hover:bg-muted/60",
                          note.id === activeId && "bg-muted"
                        )}
                        onClick={() => void selectNote(note)}
                      >
                        <p className="truncate text-sm font-medium">
                          {note.title.trim() || "Без названия"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Создана {formatDate(note.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col",
              !mobileEditor && "max-md:hidden"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground md:hidden"
                onClick={() => {
                  void flushNow();
                  setMobileEditor(false);
                }}
              >
                <ChevronLeft className="size-4" />К списку
              </button>
              <p className="ml-auto text-[11px] text-muted-foreground">
                {saveLabel}
              </p>
              {active ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Удалить заметку"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Закрыть заметки"
                onClick={() => {
                  void flushNow();
                  setOpen(false);
                }}
              >
                <X />
              </Button>
            </div>
            {active ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
                <Input
                  value={title}
                  placeholder="Название заметки"
                  onChange={(e) => {
                    const next = e.target.value;
                    titleRef.current = next;
                    setTitle(next);
                    scheduleSave();
                  }}
                />
                <Textarea
                  value={content}
                  placeholder="Текст заметки"
                  className="min-h-0 flex-1 resize-none"
                  onChange={(e) => {
                    const next = e.target.value;
                    contentRef.current = next;
                    setContent(next);
                    scheduleSave();
                  }}
                />
                {status === "error" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() =>
                      void flushSave(active.id, titleRef.current, contentRef.current)
                    }
                  >
                    Повторить сохранение
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="px-3 py-8 text-sm text-muted-foreground">
                Выберите заметку слева или создайте новую.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <HintTooltip
        text="Личное пространство для ваших записей и идей."
        disabled={open}
      >
        <button
          type="button"
          className="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/80"
          aria-label={open ? "Свернуть заметки" : "Заметки"}
          onClick={() => {
            if (open) {
              void flushNow();
              setOpen(false);
              return;
            }
            setOpen(true);
            void loadList();
          }}
        >
          <StickyNote className="size-5" />
        </button>
      </HintTooltip>

      <ConfirmDialog
        open={deleteOpen}
        title="Удалить заметку?"
        description="Заметка будет удалена без возможности восстановления."
        busy={deleteBusy}
        onOpenChange={(next) => {
          if (!next && !deleteBusy) setDeleteOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
