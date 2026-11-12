"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BASE_LEAD_SOURCES,
  BASE_LEAD_SOURCE_STYLES,
  BASE_LEAD_STATUSES,
  BASE_LEAD_STATUS_STYLES,
  type BaseLead,
  type BaseLeadSource,
  type BaseLeadStatus,
  formatBaseLeadDateDisplay,
} from "@/lib/base-leads";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type Patch = Partial<
  Pick<
    BaseLead,
    | "entryDate"
    | "source"
    | "status"
    | "name"
    | "avitoUrl"
    | "contact"
    | "path1"
    | "path2"
    | "path3"
    | "comment"
    | "reconciliation"
  >
>;

const TEXT_DEBOUNCE_MS = 450;

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-none",
        className
      )}
    >
      {children}
    </span>
  );
}

export function BaseLeadsWorkspace() {
  const [rows, setRows] = useState<BaseLead[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaseLead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();

  const rowsRef = useRef(rows);
  const saveGenRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef<
    | ((
        id: string,
        patch: Patch,
        gen: number,
        retried?: boolean
      ) => Promise<void>)
    | null
  >(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const bumpSaveGen = useCallback((id: string) => {
    const next = (saveGenRef.current.get(id) ?? 0) + 1;
    saveGenRef.current.set(id, next);
    return next;
  }, []);

  const markSaved = useCallback(() => {
    setSaveState("saved");
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveState("idle"), 1600);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiPlatform<{ leads: BaseLead[] }>("listBaseLeads");
      startTransition(() => {
        setRows(data.leads);
        setReady(true);
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    const savedTimer = savedTimerRef;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial table load
    void load();
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [load]);

  const persist = useCallback(
    async (id: string, patch: Patch, gen: number, retried = false) => {
      const current = rowsRef.current.find((r) => r.id === id);
      if (!current) return;
      setSaveState("saving");
      try {
        const data = await apiPlatform<{ lead: BaseLead }>("updateBaseLead", {
          id,
          expectedUpdatedAt: current.updatedAt,
          ...patch,
        });
        if (saveGenRef.current.get(id) !== gen) return;
        setRows((prev) => prev.map((r) => (r.id === id ? data.lead : r)));
        markSaved();
      } catch (err) {
        if (saveGenRef.current.get(id) !== gen) return;
        const status = err instanceof HttpStatusError ? err.status : 0;
        if (status === 409 && !retried) {
          try {
            const data = await apiPlatform<{ leads: BaseLead[] }>(
              "listBaseLeads"
            );
            const server = data.leads.find((r) => r.id === id);
            if (server) {
              const merged: BaseLead = {
                ...server,
                ...patch,
                updatedAt: server.updatedAt,
              };
              setRows((prev) =>
                prev.map((r) => (r.id === id ? merged : r))
              );
              const retryGen = bumpSaveGen(id);
              const retry = persistRef.current;
              if (retry) await retry(id, patch, retryGen, true);
              return;
            }
          } catch {
            /* fall through */
          }
        }
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    },
    [bumpSaveGen, markSaved]
  );

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const queueSave = useCallback(
    (id: string, patch: Patch, immediate = false) => {
      const gen = bumpSaveGen(id);
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      if (immediate) {
        timersRef.current.delete(id);
        void persist(id, patch, gen);
        return;
      }
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        void persist(id, patch, gen);
      }, TEXT_DEBOUNCE_MS);
      timersRef.current.set(id, timer);
    },
    [bumpSaveGen, persist]
  );

  function applyLocal(id: string, patch: Patch) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  async function addRow() {
    setCreating(true);
    try {
      const data = await apiPlatform<{ lead: BaseLead }>("createBaseLead");
      setRows((prev) => [...prev, data.lead]);
      markSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось добавить");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const id = deleteTarget.id;
    try {
      await apiPlatform("deleteBaseLead", { id });
      setRows((prev) => prev.filter((r) => r.id !== id));
      setDeleteTarget(null);
      toast.success("Запись удалена");
      markSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

  function onTextBlur(
    id: string,
    field: "name" | "contact" | "comment" | "avitoUrl",
    value: string
  ) {
    queueSave(id, { [field]: value }, true);
  }

  function onTextChange(
    id: string,
    field: "name" | "contact" | "comment" | "avitoUrl",
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const value = e.target.value;
    applyLocal(id, { [field]: value });
    // URL валидируется строго на сервере — сохраняем только по blur.
    if (field === "avitoUrl") return;
    queueSave(id, { [field]: value });
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <PageHeader title="База" />
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  const saveLabel =
    saveState === "saving"
      ? "Сохранение…"
      : saveState === "saved"
        ? "Сохранено"
        : saveState === "error"
          ? "Ошибка сохранения"
          : null;

  return (
    <div>
      <PageHeader
        title="База"
        description="Ручной учёт потенциальных учеников. Данные не влияют на учеников, расписание и продажи."
        actions={
          <div className="flex items-center gap-3">
            {saveLabel ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  saveState === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
                aria-live="polite"
              >
                {saveLabel}
              </span>
            ) : null}
            <Button
              type="button"
              className="rounded-full"
              disabled={creating}
              onClick={() => void addRow()}
            >
              {creating ? "Добавление…" : "Добавить запись"}
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="База пуста"
          description="Добавьте первую запись кнопкой «Добавить запись»."
        />
      ) : (
        <div className="max-h-[calc(100vh-11rem)] overflow-auto rounded-xl border border-border/80 bg-card">
          <Table className="min-w-[1100px] text-[0.78rem]">
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[4.5rem]">Дата</TableHead>
                <TableHead className="w-[7.5rem]">Источник</TableHead>
                <TableHead className="w-[9.5rem]">Статус</TableHead>
                <TableHead className="w-[7rem]">Имя</TableHead>
                <TableHead className="w-[10rem]">Авито</TableHead>
                <TableHead className="w-[8rem]">Контакт</TableHead>
                <TableHead className="w-10 text-center">Путь 1</TableHead>
                <TableHead className="w-10 text-center">Путь 2</TableHead>
                <TableHead className="w-10 text-center">Путь 3</TableHead>
                <TableHead className="min-w-[12rem]">Комментарий</TableHead>
                <TableHead className="w-12 text-center">Сверка</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="h-9">
                  <TableCell className="p-1.5">
                    <Input
                      type="date"
                      value={row.entryDate}
                      title={formatBaseLeadDateDisplay(row.entryDate)}
                      className="h-7 border-transparent bg-transparent px-1 text-[0.78rem] shadow-none focus-visible:border-input focus-visible:bg-background"
                      onChange={(e) => {
                        const entryDate = e.target.value;
                        if (!entryDate) return;
                        applyLocal(row.id, { entryDate });
                        queueSave(row.id, { entryDate }, true);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Select
                      value={row.source ?? "__empty__"}
                      onValueChange={(v) => {
                        if (!v) return;
                        const source =
                          v === "__empty__" ? null : (v as BaseLeadSource);
                        applyLocal(row.id, { source });
                        queueSave(row.id, { source }, true);
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 min-w-[6.5rem] border-transparent bg-transparent px-1 shadow-none"
                      >
                        <SelectValue>
                          {(v) =>
                            v && v !== "__empty__" ? (
                              <Pill
                                className={
                                  BASE_LEAD_SOURCE_STYLES[v as BaseLeadSource]
                                }
                              >
                                {v}
                              </Pill>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Не выбран</SelectItem>
                        {BASE_LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <Pill className={BASE_LEAD_SOURCE_STYLES[s]}>
                              {s}
                            </Pill>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Select
                      value={row.status ?? "__empty__"}
                      onValueChange={(v) => {
                        if (!v) return;
                        const status =
                          v === "__empty__" ? null : (v as BaseLeadStatus);
                        applyLocal(row.id, { status });
                        queueSave(row.id, { status }, true);
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 min-w-[8.5rem] border-transparent bg-transparent px-1 shadow-none"
                      >
                        <SelectValue>
                          {(v) =>
                            v && v !== "__empty__" ? (
                              <Pill
                                className={
                                  BASE_LEAD_STATUS_STYLES[v as BaseLeadStatus]
                                }
                              >
                                {v}
                              </Pill>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Не выбран</SelectItem>
                        {BASE_LEAD_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <Pill className={BASE_LEAD_STATUS_STYLES[s]}>
                              {s}
                            </Pill>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      value={row.name}
                      placeholder="Имя"
                      className="h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
                      onChange={(e) => onTextChange(row.id, "name", e)}
                      onBlur={(e) =>
                        onTextBlur(row.id, "name", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      value={row.avitoUrl}
                      placeholder="https://…"
                      className="h-7 border-transparent bg-transparent px-1 font-mono text-[0.72rem] text-sky-700 underline-offset-2 shadow-none focus-visible:border-input focus-visible:bg-background dark:text-sky-300"
                      onChange={(e) => onTextChange(row.id, "avitoUrl", e)}
                      onBlur={(e) =>
                        onTextBlur(row.id, "avitoUrl", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      value={row.contact}
                      placeholder="Телефон / Telegram"
                      className="h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
                      onChange={(e) => onTextChange(row.id, "contact", e)}
                      onBlur={(e) =>
                        onTextBlur(row.id, "contact", e.target.value)
                      }
                    />
                  </TableCell>
                  {(
                    [
                      ["path1", row.path1],
                      ["path2", row.path2],
                      ["path3", row.path3],
                    ] as const
                  ).map(([key, checked]) => (
                    <TableCell key={key} className="p-1.5 text-center">
                      <Checkbox
                        checked={checked}
                        className="mx-auto"
                        onCheckedChange={(v) => {
                          const next = v === true;
                          applyLocal(row.id, { [key]: next });
                          queueSave(row.id, { [key]: next }, true);
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="max-w-[16rem] p-1.5 whitespace-normal">
                    <Input
                      value={row.comment}
                      placeholder="Комментарий"
                      className="h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
                      onChange={(e) => onTextChange(row.id, "comment", e)}
                      onBlur={(e) =>
                        onTextBlur(row.id, "comment", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell className="p-1.5 text-center">
                    <Checkbox
                      checked={row.reconciliation}
                      className="mx-auto"
                      onCheckedChange={(v) => {
                        const reconciliation = v === true;
                        applyLocal(row.id, { reconciliation });
                        queueSave(row.id, { reconciliation }, true);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label="Удалить запись"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить запись?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Запись
            {deleteTarget?.name ? (
              <>
                {" "}
                «<span className="text-foreground">{deleteTarget.name}</span>»
              </>
            ) : null}{" "}
            будет удалена из базы. Это действие нельзя отменить.
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Удаление…" : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
