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
  MANUAL_TRIAL_SOURCES,
  MANUAL_TRIAL_SOURCE_STYLES,
  type ManualTrialLesson,
  type ManualTrialSource,
  computeManualTrialSumRub,
  formatManualTrialSumRub,
} from "@/lib/manual-trial-lessons";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type Patch = Partial<
  Pick<
    ManualTrialLesson,
    | "lessonDate"
    | "lessonTime"
    | "source"
    | "name"
    | "contact"
    | "attended"
    | "purchased"
    | "hoursPerWeek"
    | "ratePerHourRub"
    | "comment"
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

function GroupHead({
  label,
  colSpan,
  className,
}: {
  label: string;
  colSpan: number;
  className?: string;
}) {
  return (
    <TableHead
      colSpan={colSpan}
      className={cn(
        "h-7 border-b border-border/60 px-2 text-center text-[0.65rem] font-semibold tracking-[0.06em] uppercase",
        className
      )}
    >
      {label}
    </TableHead>
  );
}

export function ManualTrialLessonsWorkspace() {
  const [rows, setRows] = useState<ManualTrialLesson[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManualTrialLesson | null>(
    null
  );
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
      const data = await apiPlatform<{ lessons: ManualTrialLesson[] }>(
        "listManualTrialLessons"
      );
      startTransition(() => {
        setRows(data.lessons);
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
        const data = await apiPlatform<{ lesson: ManualTrialLesson }>(
          "updateManualTrialLesson",
          {
            id,
            expectedUpdatedAt: current.updatedAt,
            ...patch,
          }
        );
        if (saveGenRef.current.get(id) !== gen) return;
        setRows((prev) => prev.map((r) => (r.id === id ? data.lesson : r)));
        markSaved();
      } catch (err) {
        if (saveGenRef.current.get(id) !== gen) return;
        const status = err instanceof HttpStatusError ? err.status : 0;
        if (status === 409 && !retried) {
          try {
            const data = await apiPlatform<{ lessons: ManualTrialLesson[] }>(
              "listManualTrialLessons"
            );
            const server = data.lessons.find((r) => r.id === id);
            if (server) {
              const merged: ManualTrialLesson = {
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
      const data = await apiPlatform<{ lesson: ManualTrialLesson }>(
        "createManualTrialLesson"
      );
      setRows((prev) => [...prev, data.lesson]);
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
      await apiPlatform("deleteManualTrialLesson", { id });
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

  function onTextChange(
    id: string,
    field: "name" | "contact" | "comment",
    e: ChangeEvent<HTMLInputElement>
  ) {
    const value = e.target.value;
    applyLocal(id, { [field]: value });
    queueSave(id, { [field]: value });
  }

  function parseOptionalIntInput(raw: string): number | null {
    const trimmed = raw.trim().replace(/\s/g, "");
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
    return n;
  }

  function onNumberChange(
    id: string,
    field: "hoursPerWeek" | "ratePerHourRub",
    e: ChangeEvent<HTMLInputElement>
  ) {
    const raw = e.target.value;
    if (raw.trim() === "") {
      applyLocal(id, { [field]: null });
      queueSave(id, { [field]: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const asInt = Math.trunc(n);
    applyLocal(id, { [field]: asInt });
    queueSave(id, { [field]: asInt });
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Пробные уроки" />
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
        title="Пробные уроки"
        description="Ручной учёт пробных уроков. Не связан с «Базой», учениками и расписанием."
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
          title="Пока нет записей"
          description="Добавьте первую запись кнопкой «Добавить запись»."
        />
      ) : (
        <div className="max-h-[calc(100vh-11rem)] overflow-auto rounded-xl border border-border/80 bg-card">
          <Table className="min-w-[1080px] text-[0.78rem]">
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <GroupHead
                  label="Слот пробного урока"
                  colSpan={3}
                  className="bg-pastel-blue/70 text-sky-950 dark:text-sky-100"
                />
                <GroupHead
                  label="Ученик"
                  colSpan={2}
                  className="bg-pastel-beige/80 text-amber-950 dark:text-amber-100"
                />
                <GroupHead
                  label="Итог"
                  colSpan={5}
                  className="bg-pastel-mint/80 text-emerald-950 dark:text-emerald-100"
                />
                <GroupHead
                  label="Комментарий"
                  colSpan={1}
                  className="bg-muted/60 text-muted-foreground"
                />
                <TableHead className="h-7 w-10 bg-muted/40" />
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[7rem]">Дата</TableHead>
                <TableHead className="w-[5.5rem]">Время</TableHead>
                <TableHead className="w-[7.5rem]">Источник</TableHead>
                <TableHead className="w-[7rem]">Имя</TableHead>
                <TableHead className="w-[8rem]">Контакт</TableHead>
                <TableHead className="w-12 text-center">Прошёл</TableHead>
                <TableHead className="w-12 text-center">Купил</TableHead>
                <TableHead className="w-[5.5rem]">Часов/нед.</TableHead>
                <TableHead className="w-[6.5rem]">Ставка/час</TableHead>
                <TableHead className="w-[6.5rem]">Сумма</TableHead>
                <TableHead className="min-w-[12rem]">Комментарий</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const sum = computeManualTrialSumRub(
                  row.hoursPerWeek,
                  row.ratePerHourRub
                );
                return (
                  <TableRow key={row.id} className="h-9">
                    <TableCell className="p-1.5">
                      <Input
                        type="date"
                        value={row.lessonDate}
                        className="h-7 border-transparent bg-transparent px-1 text-[0.78rem] shadow-none focus-visible:border-input focus-visible:bg-background"
                        onChange={(e) => {
                          const lessonDate = e.target.value;
                          if (!lessonDate) return;
                          applyLocal(row.id, { lessonDate });
                          queueSave(row.id, { lessonDate }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5">
                      <Input
                        type="time"
                        value={row.lessonTime}
                        className="h-7 border-transparent bg-transparent px-1 text-[0.78rem] shadow-none focus-visible:border-input focus-visible:bg-background"
                        onChange={(e) => {
                          const lessonTime = e.target.value;
                          if (!lessonTime) return;
                          applyLocal(row.id, { lessonTime });
                          queueSave(row.id, { lessonTime }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5">
                      <Select
                        value={row.source ?? "__empty__"}
                        onValueChange={(v) => {
                          if (!v) return;
                          const source =
                            v === "__empty__"
                              ? null
                              : (v as ManualTrialSource);
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
                                    MANUAL_TRIAL_SOURCE_STYLES[
                                      v as ManualTrialSource
                                    ]
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
                          {MANUAL_TRIAL_SOURCES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <Pill className={MANUAL_TRIAL_SOURCE_STYLES[s]}>
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
                          queueSave(row.id, { name: e.target.value }, true)
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
                          queueSave(row.id, { contact: e.target.value }, true)
                        }
                      />
                    </TableCell>
                    <TableCell className="p-1.5 text-center">
                      <Checkbox
                        checked={row.attended}
                        className="mx-auto"
                        onCheckedChange={(v) => {
                          const attended = v === true;
                          applyLocal(row.id, { attended });
                          queueSave(row.id, { attended }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5 text-center">
                      <Checkbox
                        checked={row.purchased}
                        className="mx-auto"
                        onCheckedChange={(v) => {
                          const purchased = v === true;
                          applyLocal(row.id, { purchased });
                          queueSave(row.id, { purchased }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.hoursPerWeek ?? ""}
                        placeholder="—"
                        className="h-7 border-transparent bg-transparent px-1 tabular-nums shadow-none focus-visible:border-input focus-visible:bg-background"
                        onChange={(e) =>
                          onNumberChange(row.id, "hoursPerWeek", e)
                        }
                        onBlur={(e) => {
                          const hoursPerWeek = parseOptionalIntInput(
                            e.target.value
                          );
                          applyLocal(row.id, { hoursPerWeek });
                          queueSave(row.id, { hoursPerWeek }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.ratePerHourRub ?? ""}
                        placeholder="—"
                        className="h-7 border-transparent bg-transparent px-1 tabular-nums shadow-none focus-visible:border-input focus-visible:bg-background"
                        onChange={(e) =>
                          onNumberChange(row.id, "ratePerHourRub", e)
                        }
                        onBlur={(e) => {
                          const ratePerHourRub = parseOptionalIntInput(
                            e.target.value
                          );
                          applyLocal(row.id, { ratePerHourRub });
                          queueSave(row.id, { ratePerHourRub }, true);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5 tabular-nums text-muted-foreground">
                      {formatManualTrialSumRub(sum) || "—"}
                    </TableCell>
                    <TableCell className="max-w-[16rem] p-1.5 whitespace-normal">
                      <Input
                        value={row.comment}
                        placeholder="Комментарий"
                        className="h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
                        onChange={(e) => onTextChange(row.id, "comment", e)}
                        onBlur={(e) =>
                          queueSave(row.id, { comment: e.target.value }, true)
                        }
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
                );
              })}
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
            будет удалена. Это действие нельзя отменить.
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
