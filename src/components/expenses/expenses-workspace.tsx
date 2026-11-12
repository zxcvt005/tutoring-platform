"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_STYLES,
  type Expense,
  type ExpenseCategory,
  type ExpensesListPayload,
  formatExpenseAmountRub,
  formatExpenseDateDisplay,
  isAutoExpenseSource,
  todayIsoDate,
} from "@/lib/expenses";
import { apiPlatform, HttpStatusError } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

type Patch = Partial<
  Pick<Expense, "category" | "comment" | "expenseDate" | "amountRub">
>;

const TEXT_DEBOUNCE_MS = 450;
const ALL_MONTHS = "all";
const ALL_CATEGORIES = "all";

function monthOptions(now = new Date()) {
  const y = now.getFullYear();
  const items: { value: string; label: string }[] = [
    { value: ALL_MONTHS, label: "Все периоды" },
  ];
  for (let i = 0; i < 18; i++) {
    const d = new Date(y, now.getMonth() - i, 1);
    const yy = d.getFullYear();
    const mm = d.getMonth() + 1;
    const value = `${yy}-${String(mm).padStart(2, "0")}`;
    const label = d.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    items.push({ value, label });
  }
  return items;
}

export function ExpensesWorkspace() {
  const now = todayIsoDate();
  const [year, setYear] = useState<number | null>(() =>
    Number(now.slice(0, 4))
  );
  const [month, setMonth] = useState<number | null>(() =>
    Number(now.slice(5, 7))
  );
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [rows, setRows] = useState<Expense[]>([]);
  const [totalAmountRub, setTotalAmountRub] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<
    ExpensesListPayload["categoryTotals"]
  >([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
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

  const load = useCallback(
    async (y: number | null, m: number | null, cat: ExpenseCategory | null) => {
      setLoadError(null);
      try {
        const data = await apiPlatform<ExpensesListPayload>("listExpenses", {
          year: y,
          month: m,
          category: cat,
        });
        startTransition(() => {
          setRows(data.expenses);
          setTotalAmountRub(data.totalAmountRub);
          setCategoryTotals(data.categoryTotals);
          setYear(data.year);
          setMonth(data.month);
          setCategory(data.category);
          setReady(true);
        });
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
        setReady(true);
      }
    },
    []
  );

  useEffect(() => {
    const timers = timersRef.current;
    const savedTimer = savedTimerRef;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load(year, month, category);
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const persist = useCallback(
    async (id: string, patch: Patch, gen: number, retried = false) => {
      const current = rowsRef.current.find((r) => r.id === id);
      if (!current || isAutoExpenseSource(current.source)) return;
      setSaveState("saving");
      try {
        const data = await apiPlatform<{ expense: Expense }>(
          "updateManualExpense",
          {
            id,
            expectedUpdatedAt: current.updatedAt,
            ...patch,
          }
        );
        if (saveGenRef.current.get(id) !== gen) return;
        setRows((prev) => prev.map((r) => (r.id === id ? data.expense : r)));
        markSaved();
        void load(year, month, category);
      } catch (err) {
        if (saveGenRef.current.get(id) !== gen) return;
        const status = err instanceof HttpStatusError ? err.status : 0;
        if (status === 409 && !retried) {
          try {
            await load(year, month, category);
            const retryGen = bumpSaveGen(id);
            const retry = persistRef.current;
            if (retry) await retry(id, patch, retryGen, true);
            return;
          } catch {
            /* fall through */
          }
        }
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    },
    [bumpSaveGen, markSaved, load, year, month, category]
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
      const data = await apiPlatform<{ expense: Expense }>(
        "createManualExpense",
        {
          category: "Сервисы",
          comment: "",
          expenseDate: todayIsoDate(),
          amountRub: 1,
        }
      );
      setRows((prev) => [data.expense, ...prev]);
      markSaved();
      void load(year, month, category);
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
      await apiPlatform("deleteManualExpense", { id });
      setRows((prev) => prev.filter((r) => r.id !== id));
      setDeleteTarget(null);
      toast.success("Расход удалён");
      markSaved();
      void load(year, month, category);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

  const months = useMemo(() => monthOptions(), []);
  const monthValue =
    year != null && month != null
      ? `${year}-${String(month).padStart(2, "0")}`
      : ALL_MONTHS;

  const saveLabel =
    saveState === "saving"
      ? "Сохранение…"
      : saveState === "saved"
        ? "Сохранено"
        : saveState === "error"
          ? "Ошибка сохранения"
          : null;

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Расходы" />
        <p className="text-sm text-destructive">{loadError}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(year, month, category)}
        >
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Расходы"
        description="Ручные статьи и автоматический импорт Avito и выплат зарплат. Не связан с CRM и учениками."
        actions={
          <div className="flex flex-wrap items-center gap-3">
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
              {creating ? "Добавление…" : "Добавить расход"}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Период
          </label>
          <Select
            value={monthValue}
            onValueChange={(v) => {
              if (!v || v === ALL_MONTHS) {
                setYear(null);
                setMonth(null);
                void load(null, null, category);
                return;
              }
              const [yy, mm] = v.split("-").map(Number);
              setYear(yy!);
              setMonth(mm!);
              void load(yy!, mm!, category);
            }}
          >
            <SelectTrigger className="h-8 w-[12.5rem] rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Статья
          </label>
          <Select
            value={category ?? ALL_CATEGORIES}
            onValueChange={(v) => {
              const next =
                v === ALL_CATEGORIES ? null : (v as ExpenseCategory);
              setCategory(next);
              void load(year, month, next);
            }}
          >
            <SelectTrigger className="h-8 w-[11rem] rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Все статьи</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto rounded-xl border border-border/70 bg-pastel-beige/40 px-4 py-2 text-right">
          <div className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Итого
          </div>
          <div className="font-display text-xl font-semibold tabular-nums">
            {formatExpenseAmountRub(totalAmountRub)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {categoryTotals.map((t) => (
          <button
            key={t.category}
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[0.7rem] transition-opacity",
              EXPENSE_CATEGORY_STYLES[t.category],
              category && category !== t.category && "opacity-45"
            )}
            onClick={() => {
              const next = category === t.category ? null : t.category;
              setCategory(next);
              void load(year, month, next);
            }}
          >
            <span className="font-medium">{t.category}</span>
            <span className="tabular-nums">
              {formatExpenseAmountRub(t.amountRub)}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Расходов нет"
          description="Добавьте ручную запись или синхронизируйте РНП Авито / выплаты зарплат."
        />
      ) : (
        <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-border/80 bg-card">
          <Table className="min-w-[44rem] text-[0.78rem]">
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[9rem]">Статья</TableHead>
                <TableHead className="min-w-[14rem]">Комментарий</TableHead>
                <TableHead className="w-[7.5rem]">Дата</TableHead>
                <TableHead className="w-[8rem] text-right">Сумма</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const locked = isAutoExpenseSource(row.source);
                return (
                  <TableRow key={row.id} className="h-9">
                    <TableCell className="py-1">
                      {locked ? (
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                            EXPENSE_CATEGORY_STYLES[row.category]
                          )}
                        >
                          {row.category}
                        </span>
                      ) : (
                        <Select
                          value={row.category}
                          onValueChange={(v) => {
                            const next = v as ExpenseCategory;
                            applyLocal(row.id, { category: next });
                            queueSave(row.id, { category: next }, true);
                          }}
                        >
                          <SelectTrigger className="h-7 w-[8.2rem] rounded-full border-0 bg-transparent px-0 shadow-none focus:ring-0">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                                EXPENSE_CATEGORY_STYLES[row.category]
                              )}
                            >
                              {row.category}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="text-foreground/85">{row.comment}</span>
                      ) : (
                        <Input
                          value={row.comment}
                          className="h-7 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            applyLocal(row.id, { comment: e.target.value });
                            queueSave(row.id, { comment: e.target.value });
                          }}
                          onBlur={(e) =>
                            queueSave(
                              row.id,
                              { comment: e.target.value },
                              true
                            )
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="tabular-nums text-muted-foreground">
                          {formatExpenseDateDisplay(row.expenseDate)}
                        </span>
                      ) : (
                        <Input
                          type="date"
                          value={row.expenseDate}
                          className="h-7 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            applyLocal(row.id, { expenseDate: v });
                            queueSave(row.id, { expenseDate: v }, true);
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-right">
                      {locked ? (
                        <span className="tabular-nums font-medium">
                          {formatExpenseAmountRub(row.amountRub)}
                        </span>
                      ) : (
                        <Input
                          inputMode="numeric"
                          value={String(row.amountRub)}
                          className="h-7 border-0 bg-transparent px-1 text-right shadow-none focus-visible:ring-1"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            if (raw === "") return;
                            const n = Number(raw);
                            if (!Number.isFinite(n) || n <= 0) return;
                            applyLocal(row.id, { amountRub: n });
                            queueSave(row.id, { amountRub: n });
                          }}
                          onBlur={(e) => {
                            const n = Number(
                              e.target.value.replace(/\D/g, "")
                            );
                            if (!Number.isFinite(n) || n <= 0) {
                              toast.error("Сумма должна быть положительной");
                              return;
                            }
                            queueSave(row.id, { amountRub: n }, true);
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span
                          className="text-[0.62rem] text-muted-foreground"
                          title={
                            row.source === "avito"
                              ? "Импорт из Avito"
                              : "Импорт выплаты зарплаты"
                          }
                        >
                          авто
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Удалить"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
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
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить расход?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Запись «{deleteTarget?.comment || deleteTarget?.category}» будет
            удалена без возможности восстановления.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
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
