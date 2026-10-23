"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Maximize2,
  MessageCircle,
  Minimize2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HintTooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appDateKey } from "@/lib/app-time";
import {
  CHAT_ALLOWED_EXTENSIONS,
  CHAT_EMPTY_STUDENT,
  CHAT_EMPTY_TEACHER,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_FILES,
  CHAT_READ_ONLY,
} from "@/lib/chat/constants";
import { formatFileSize, mergeChatMessages } from "@/lib/chat/preview";
import { newChatRequestId } from "@/lib/chat/request-id";
import type {
  ChatListItem,
  ChatMessageView,
  ChatThreadMeta,
} from "@/lib/chat/types";
import { canRunConfirmedAction } from "@/lib/confirm-action";
import { formatDate, formatTime } from "@/lib/format";
import {
  apiChatDelete,
  apiChatEdit,
  apiChatList,
  apiChatMarkRead,
  apiChatMessages,
  apiChatRetryAttachments,
  apiChatSend,
  apiChatSummary,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CabinetChatRole = "kafedra" | "auditoria";

type LocalMessage = ChatMessageView & {
  localStatus?: "sending" | "error";
  localError?: string;
  localFiles?: File[];
};

function acceptAttr() {
  return CHAT_ALLOWED_EXTENSIONS.join(",");
}

function pollDelay(open: boolean, thread: boolean, hidden: boolean) {
  if (hidden) return 45_000;
  if (thread) return 4_000;
  if (open) return 8_000;
  return 15_000;
}

export function ChatWidget({ role }: { role: CabinetChatRole }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatThreadMeta | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [unseenNew, setUnseenNew] = useState(0);
  const [preview, setPreview] = useState<ChatMessageView["attachments"][number] | null>(
    null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const inFlight = useRef(false);
  const prevUnread = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const draft = activeId ? (drafts[activeId] ?? "") : "";

  const refreshSummary = useCallback(async () => {
    const data = await apiChatSummary();
    setUnreadTotal(data.unreadTotal);
    if (data.unreadTotal > prevUnread.current) {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 1800);
    }
    prevUnread.current = data.unreadTotal;
    return data;
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await apiChatList({ query });
      setItems(data.items);
      setUnreadTotal(data.unreadTotal);
      if (data.unreadTotal > prevUnread.current) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 1800);
      }
      prevUnread.current = data.unreadTotal;
      setOffline(false);
      setError(null);
    } catch (err) {
      setOffline(true);
      setError(err instanceof Error ? err.message : "Нет сети");
    } finally {
      setLoadingList(false);
    }
  }, [query]);

  const loadThread = useCallback(async (chatId: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const data = await apiChatMessages(chatId);
      setChat(data.chat);
      setHasMore(data.hasMore);
      setMessages((prev) => {
        const locals = prev.filter((m) => m.localStatus && m.id.startsWith("tmp_"));
        const merged = mergeChatMessages<LocalMessage>(
          data.messages,
          locals.filter((local) =>
            !data.messages.some((m) => m.clientRequestId === local.clientRequestId)
          )
        );
        return merged;
      });
      setOffline(false);
      if (stickBottom.current) {
        queueMicrotask(() => {
          const el = scrollerRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    } catch (err) {
      setOffline(true);
      setError(err instanceof Error ? err.message : "Нет сети");
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  const pollNewer = useCallback(async () => {
    const chatId = activeIdRef.current;
    if (!chatId) return;
    const data = await apiChatMessages(chatId);
    setChat(data.chat);
    setMessages((prev) => {
      const prevIds = new Set(prev.map((m) => m.id));
      const merged = mergeChatMessages<LocalMessage>(
        prev.filter((m) => !m.localStatus),
        data.messages
      );
      const added = merged.filter((m) => !prevIds.has(m.id) && !m.mine);
      if (added.length && !stickBottom.current) {
        setUnseenNew((n) => n + added.length);
      } else if (stickBottom.current) {
        queueMicrotask(() => {
          const el = scrollerRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      void refreshSummary();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshSummary]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped || inFlight.current) {
        timer = window.setTimeout(
          tick,
          pollDelay(open, Boolean(activeId), document.hidden)
        );
        return;
      }
      inFlight.current = true;
      try {
        if (activeId && open) await pollNewer();
        else if (open) await refreshList();
        else await refreshSummary();
      } catch {
        setOffline(true);
      } finally {
        inFlight.current = false;
        if (!stopped) {
          timer = window.setTimeout(
            tick,
            pollDelay(open, Boolean(activeId), document.hidden)
          );
        }
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, activeId, pollNewer, refreshList, refreshSummary]);

  useEffect(() => {
    if (open && !activeId) void refreshList();
  }, [open, activeId, refreshList]);

  const openChat = async (id: string) => {
    setActiveId(id);
    stickBottom.current = true;
    setUnseenNew(0);
    await loadThread(id);
  };

  const markVisibleRead = useCallback(
    async (list: LocalMessage[]) => {
      const last = [...list].reverse().find((m) => !m.localStatus && !m.id.startsWith("tmp_"));
      if (!last || !activeId) return;
      try {
        const res = await apiChatMarkRead(activeId, last.id);
        setItems((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, unreadCount: res.unreadCount } : c
          )
        );
        setUnreadTotal((n) => Math.max(0, n - ((chat?.unreadCount ?? 0) - res.unreadCount)));
      } catch {
        /* next poll restores */
      }
    },
    [activeId, chat?.unreadCount]
  );

  useEffect(() => {
    if (!activeId || !stickBottom.current || messages.length === 0) return;
    void markVisibleRead(messages);
  }, [activeId, messages, markVisibleRead]);

  const loadOlder = async () => {
    if (!activeId || !hasMore || loadingOlder) return;
    const oldest = messages.find((m) => !m.id.startsWith("tmp_"));
    if (!oldest) return;
    const el = scrollerRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const data = await apiChatMessages(activeId, {
        before: oldest.createdAt,
        beforeId: oldest.id,
      });
      setHasMore(data.hasMore);
      setMessages((prev) => mergeChatMessages<LocalMessage>(data.messages, prev));
      queueMicrotask(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickBottom.current = atBottom;
    if (atBottom) setUnseenNew(0);
    if (el.scrollTop < 24 && hasMore) void loadOlder();
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= CHAT_MAX_FILES) {
        setError(`Можно прикрепить не больше ${CHAT_MAX_FILES} файлов`);
        break;
      }
      if (file.size > CHAT_MAX_FILE_BYTES) {
        setError(`${file.name}: файл больше 20 МБ`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const send = async (retry?: LocalMessage) => {
    if (!activeId || sending) return;
    const text = retry ? retry.body ?? "" : draft;
    const payloadFiles = retry?.localFiles ?? files;
    if (!text.trim() && payloadFiles.length === 0) return;
    const requestId = retry?.clientRequestId || newChatRequestId();
    const tempId = retry?.id ?? `tmp_${requestId}`;
    const optimistic: LocalMessage = {
      id: tempId,
      chatId: activeId,
      type: "user_message",
      authorUserId: null,
      body: text,
      createdAt: retry?.createdAt ?? new Date().toISOString(),
      editedAt: null,
      deleted: false,
      eventType: null,
      eventPayload: null,
      attachments: [],
      clientRequestId: requestId,
      canEdit: false,
      canDelete: false,
      mine: true,
      localStatus: "sending",
      localFiles: payloadFiles,
    };
    setSending(true);
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId);
      return [...without, optimistic];
    });
    if (!retry) {
      setDrafts((d) => ({ ...d, [activeId]: "" }));
      setFiles([]);
    }
    stickBottom.current = true;
    try {
      const result = await apiChatSend(activeId, {
        body: text,
        clientRequestId: requestId,
        files: payloadFiles,
      });
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return mergeChatMessages<LocalMessage>(withoutTemp, [
          {
            ...result.message,
            localStatus: result.incomplete ? "error" : undefined,
            localError: result.incomplete
              ? result.attachmentErrors.map((e) => e.error).join("; ")
              : undefined,
            localFiles: result.incomplete ? payloadFiles : undefined,
          },
        ]);
      });
      if (result.incomplete) {
        setError(
          result.attachmentErrors[0]?.error ?? "Не все файлы загрузились"
        );
      }
      await refreshList();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                localStatus: "error",
                localError:
                  err instanceof Error ? err.message : "Сообщение не отправлено",
              }
            : m
        )
      );
      if (!retry) {
        setDrafts((d) => ({ ...d, [activeId]: text }));
        setFiles(payloadFiles);
      }
      setError(err instanceof Error ? err.message : "Сообщение не отправлено");
    } finally {
      setSending(false);
    }
  };

  const retryAttachments = async (message: LocalMessage) => {
    if (!activeId || !message.localFiles?.length) {
      await send(message);
      return;
    }
    if (message.id.startsWith("tmp_")) {
      await send(message);
      return;
    }
    try {
      const result = await apiChatRetryAttachments(
        activeId,
        message.id,
        message.localFiles
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...result.message, localStatus: result.incomplete ? "error" : undefined, localError: result.incomplete ? result.attachmentErrors.map((e) => e.error).join("; ") : undefined, localFiles: result.incomplete ? message.localFiles : undefined } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    }
  };

  const grouped = useMemo(() => {
    const groups: { day: string; items: LocalMessage[] }[] = [];
    for (const message of messages) {
      const day = appDateKey(message.createdAt);
      const last = groups[groups.length - 1];
      if (!last || last.day !== day) groups.push({ day, items: [message] });
      else last.items.push(message);
    }
    return groups;
  }, [messages]);

  const emptyHint =
    role === "auditoria" ? CHAT_EMPTY_STUDENT : CHAT_EMPTY_TEACHER;

  return (
    <div
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-2"
      style={{
        right: "max(1rem, env(safe-area-inset-right))",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {open ? (
        <section
          className={cn(
            "pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
            expanded
              ? "h-[min(40rem,calc(100svh-6rem))] w-[min(34rem,calc(100vw-1.5rem))]"
              : "h-[min(28rem,calc(100svh-6rem))] w-[min(22rem,calc(100vw-1.5rem))]",
            "max-md:h-[calc(100svh-5.5rem)] max-md:w-[calc(100vw-1.5rem)]"
          )}
        >
          <header className="flex items-center gap-2 border-b border-border/80 px-3 py-2">
            {activeId ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="К списку чатов"
                onClick={() => {
                  setActiveId(null);
                  setChat(null);
                  void refreshList();
                }}
              >
                <ChevronLeft />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {chat && activeId
                  ? chat.peerName
                  : role === "auditoria"
                    ? "Чаты с преподавателями"
                    : "Чаты с учениками"}
              </p>
              {chat && activeId && !chat.isCurrentPair ? (
                <p className="truncate text-xs text-muted-foreground">
                  Предыдущий преподаватель
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="hidden md:inline-flex"
              aria-label={expanded ? "Свернуть окно" : "Расширить окно"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Закрыть чат"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>

          {offline || error ? (
            <p className="border-b border-border/80 bg-surface-sand px-3 py-1.5 text-xs">
              {offline ? "Нет сети. Черновик сохранён, попробуем снова." : error}
            </p>
          ) : null}

          {!activeId ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {role === "kafedra" ? (
                <div className="p-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по имени"
                    aria-label="Поиск ученика"
                  />
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingList && items.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    Загрузка чатов…
                  </p>
                ) : items.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    Пока нет диалогов
                  </p>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/70"
                      onClick={() => void openChat(item.id)}
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/20 data-[on=true]:bg-primary" data-on={item.unreadCount > 0} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.peerName}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {item.lastMessageAt ? formatTime(item.lastMessageAt) : ""}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {item.lastPreview ?? "Нет сообщений"}
                          </span>
                          {item.unreadCount > 0 ? (
                            <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                              {item.unreadCount > 99 ? "99+" : item.unreadCount}
                            </span>
                          ) : null}
                        </span>
                        {!item.isCurrentPair ? (
                          <span className="text-[11px] text-muted-foreground">
                            {role === "auditoria"
                              ? "Предыдущий преподаватель"
                              : "Бывший ученик"}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
              >
                {hasMore ? (
                  <div className="mb-2 flex justify-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingOlder}
                      onClick={() => void loadOlder()}
                    >
                      {loadingOlder ? "Загрузка…" : "Загрузить предыдущий месяц"}
                    </Button>
                  </div>
                ) : null}
                {loadingThread && messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Загрузка сообщений…
                  </p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {emptyHint}
                  </p>
                ) : (
                  grouped.map((group) => (
                    <div key={group.day} className="mb-3">
                      <p className="mb-2 text-center text-[11px] text-muted-foreground">
                        {formatDate(group.items[0]!.createdAt)}
                      </p>
                      <div className="space-y-2">
                        {group.items.map((message) => (
                          <ChatBubble
                            key={message.id}
                            message={message}
                            role={role}
                            editing={editingId === message.id}
                            editDraft={editDraft}
                            onEditDraft={setEditDraft}
                            onStartEdit={() => {
                              setEditingId(message.id);
                              setEditDraft(message.body ?? "");
                            }}
                            onCancelEdit={() => setEditingId(null)}
                            onSaveEdit={async () => {
                              if (!activeId) return;
                              const updated = await apiChatEdit(
                                activeId,
                                message.id,
                                editDraft
                              );
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === message.id ? updated.message : m
                                )
                              );
                              setEditingId(null);
                            }}
                            onDelete={() => setDeleteTarget(message.id)}
                            onRetry={() => void retryAttachments(message)}
                            onPreview={setPreview}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {unseenNew > 0 ? (
                <button
                  type="button"
                  className="mx-auto mb-1 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                  onClick={() => {
                    stickBottom.current = true;
                    setUnseenNew(0);
                    const el = scrollerRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                  }}
                >
                  Новые сообщения: {unseenNew}
                </button>
              ) : null}

              {chat && !chat.canSend ? (
                <p className="border-t border-border/80 px-3 py-2 text-xs text-muted-foreground">
                  {CHAT_READ_ONLY}
                </p>
              ) : (
                <form
                  className="border-t border-border/80 p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  {files.length > 0 ? (
                    <ul className="mb-2 space-y-1">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1 text-xs"
                        >
                          <span className="truncate">
                            {file.name} · {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setFiles((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            Убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex items-end gap-1">
                    <label className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
                      <Paperclip className="size-4" />
                      <span className="sr-only">Прикрепить файл</span>
                      <input
                        type="file"
                        className="hidden"
                        accept={acceptAttr()}
                        multiple
                        onChange={(e) => {
                          addFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <Textarea
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [activeId]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Сообщение"
                      rows={1}
                      className="min-h-8 max-h-28 flex-1 resize-none py-1.5"
                    />
                    <Button
                      type="submit"
                      size="icon-sm"
                      disabled={sending || (!draft.trim() && files.length === 0)}
                      aria-label="Отправить"
                    >
                      <Send />
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      ) : null}

      <HintTooltip text="Чат для общения" disabled={open}>
        <button
          type="button"
          className={cn(
            "pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/80",
            pulse && "ring-2 ring-primary/40"
          )}
          aria-label={open ? "Свернуть чат" : "Открыть чат"}
          onClick={() => {
            setOpen((v) => {
              const next = !v;
              if (next && !activeId) setLoadingList(true);
              return next;
            });
          }}
        >
          {pulse ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          ) : null}
          <MessageCircle className="size-5" />
          {unreadTotal > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-surface-rose px-1 text-[10px] font-semibold text-foreground">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          ) : null}
        </button>
      </HintTooltip>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить сообщение?"
        description="Вы действительно хотите удалить это сообщение?"
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (
            !canRunConfirmedAction({
              open: Boolean(deleteTarget),
              busy: deleteBusy,
            })
          ) {
            return;
          }
          const messageId = deleteTarget;
          if (!activeId || !messageId) return;
          setDeleteBusy(true);
          void (async () => {
            try {
              const updated = await apiChatDelete(activeId, messageId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? updated.message : m
                )
              );
              setDeleteTarget(null);
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Не удалось удалить сообщение"
              );
            } finally {
              setDeleteBusy(false);
            }
          })();
        }}
      />

      {preview ? (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={preview.originalName}
            className="max-h-[90vh] max-w-[90vw] rounded-lg bg-card object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  role,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRetry,
  onPreview,
}: {
  message: LocalMessage;
  role: CabinetChatRole;
  editing: boolean;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => Promise<void>;
  onDelete: () => void;
  onRetry: () => void;
  onPreview: (file: ChatMessageView["attachments"][number]) => void;
}) {
  if (message.type === "system_event") {
    const href =
      role === "auditoria"
        ? message.eventPayload?.hrefStudent
        : message.eventPayload?.hrefTeacher;
    return (
      <div className="mx-auto max-w-[90%] rounded-xl bg-muted/80 px-3 py-2 text-center text-xs text-muted-foreground">
        <p>{message.eventPayload?.title ?? "Событие"}</p>
        {href ? (
          <Link href={href} className="mt-1 inline-block text-primary underline-offset-2 hover:underline">
            Открыть
          </Link>
        ) : null}
      </div>
    );
  }

  if (message.deleted) {
    return (
      <div
        className={cn(
          "max-w-[85%] rounded-xl bg-muted px-3 py-2 text-xs italic text-muted-foreground",
          message.mine ? "ml-auto" : "mr-auto"
        )}
      >
        Сообщение удалено
      </div>
    );
  }

  return (
    <div className={cn("max-w-[85%] space-y-1", message.mine ? "ml-auto" : "mr-auto")}>
      <div
        className={cn(
          "rounded-xl px-3 py-2 text-sm",
          message.mine
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editDraft}
              onChange={(e) => onEditDraft(e.target.value)}
              className="bg-background text-foreground"
            />
            <div className="flex gap-1">
              <Button type="button" size="xs" onClick={() => void onSaveEdit()}>
                Сохранить
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={onCancelEdit}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        {message.attachments.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((file) => (
              <li key={file.id}>
                {file.isImage ? (
                  <button type="button" onClick={() => onPreview(file)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={file.originalName}
                      className="max-h-40 max-w-full rounded-md object-cover"
                    />
                  </button>
                ) : (
                  <a
                    href={`${file.url}?download=1`}
                    className={cn(
                      "block truncate text-xs underline-offset-2 hover:underline",
                      message.mine ? "text-primary-foreground" : "text-primary"
                    )}
                  >
                    {file.originalName} · {formatFileSize(file.sizeBytes)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 text-[11px] text-muted-foreground",
          message.mine ? "justify-end" : "justify-start"
        )}
      >
        <span>{formatTime(message.createdAt)}</span>
        {message.editedAt ? <span>Изменено</span> : null}
        {message.localStatus === "sending" ? <span>Отправка…</span> : null}
        {message.localStatus === "error" ? (
          <button type="button" className="text-destructive" onClick={onRetry}>
            Не отправлено · повторить
          </button>
        ) : null}
        {message.canEdit && !editing ? (
          <>
            <button type="button" onClick={onStartEdit}>
              Изменить
            </button>
            <button type="button" onClick={onDelete}>
              Удалить
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
