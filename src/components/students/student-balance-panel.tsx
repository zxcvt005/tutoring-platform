"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  lessonLedgerDeltaLabel,
  lessonLedgerReasonLabel,
} from "@/lib/lesson-ledger-labels";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type {
  LearningDirection,
  StudentDirectionBalance,
  StudentLessonLedgerEntry,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type AdjustMode = "credit" | "debit";

type PendingAdjust = {
  mode: AdjustMode;
  directionId: string;
  directionName: string;
  amount: number;
  note: string;
  allowBelowDebtFloor: boolean;
};

function balanceTone(balance: number): string {
  if (balance <= -1) return "text-destructive";
  if (balance <= 0) return "text-amber-800";
  return "text-foreground";
}

export function StudentBalancePanel({
  studentId,
  studentName,
  directionBalances,
  cabinet = "direkciya",
}: {
  studentId: string;
  studentName: string;
  directionBalances: StudentDirectionBalance[];
  /** Где показан блок: влияет на подпись и ссылку на покупки. */
  cabinet?: "direkciya" | "pressa";
}) {
  const { data, reload } = useDemoStore();
  const directions = useMemo(
    () =>
      (data.learningDirections ?? []).filter(
        (d: LearningDirection) => d.status === "active"
      ),
    [data.learningDirections]
  );

  const balanceByDirection = useMemo(() => {
    const map = new Map(
      directionBalances.map((b) => [b.directionId, b.balance])
    );
    return map;
  }, [directionBalances]);

  const rows = useMemo(() => {
    const fromDirections = directions.map((d) => ({
      directionId: d.id,
      directionName: d.name,
      balance: balanceByDirection.get(d.id) ?? 0,
    }));
    const known = new Set(fromDirections.map((r) => r.directionId));
    for (const b of directionBalances) {
      if (!known.has(b.directionId)) {
        fromDirections.push({
          directionId: b.directionId,
          directionName: b.directionName ?? b.directionSlug ?? "Направление",
          balance: b.balance,
        });
      }
    }
    return fromDirections.sort((a, b) =>
      a.directionName.localeCompare(b.directionName, "ru")
    );
  }, [directions, directionBalances, balanceByDirection]);

  const [ledger, setLedger] = useState<StudentLessonLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [historyDirectionId, setHistoryDirectionId] = useState<string>("all");

  const [mode, setMode] = useState<AdjustMode>("credit");
  const [directionId, setDirectionId] = useState<string>("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [allowBelowDebtFloor, setAllowBelowDebtFloor] = useState(false);
  const [pending, setPending] = useState<PendingAdjust | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!directionId && rows[0]) setDirectionId(rows[0].directionId);
  }, [directionId, rows]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await apiPlatform<{ entries: StudentLessonLedgerEntry[] }>(
        "listStudentBalanceLedger",
        {
          studentId,
          directionId:
            historyDirectionId === "all" ? undefined : historyDirectionId,
          limit: 80,
        }
      );
      setLedger(res.entries ?? []);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось загрузить историю баланса"
      );
    } finally {
      setLedgerLoading(false);
    }
  }, [studentId, historyDirectionId]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  function openConfirm() {
    const dir = rows.find((r) => r.directionId === directionId);
    if (!dir) {
      toast.error("Выберите направление");
      return;
    }
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("Укажите целое положительное число занятий");
      return;
    }
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      toast.error("Укажите причину (не короче 3 символов)");
      return;
    }
    setPending({
      mode,
      directionId: dir.directionId,
      directionName: dir.directionName,
      amount: n,
      note: trimmed,
      allowBelowDebtFloor: mode === "debit" ? allowBelowDebtFloor : false,
    });
  }

  async function applyAdjust() {
    if (!pending) return;
    setBusy(true);
    try {
      const delta = pending.mode === "credit" ? pending.amount : -pending.amount;
      await apiPlatform("adminAdjustLessonBalance", {
        studentId,
        directionId: pending.directionId,
        delta,
        note: pending.note,
        allowBelowDebtFloor: pending.allowBelowDebtFloor,
      });
      toast.success(
        pending.mode === "credit"
          ? `Начислено ${pending.amount} зан. · ${pending.directionName}`
          : `Списано ${pending.amount} зан. · ${pending.directionName}`
      );
      setPending(null);
      setNote("");
      setAmount("1");
      setAllowBelowDebtFloor(false);
      await reload();
      await loadLedger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка корректировки");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Баланс занятий
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
            По направлениям
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ручные начисления и списания — Дирекция и Пресса. В доход не входят.
          </p>
        </div>
        {cabinet === "direkciya" ? (
          <Link
            href={`/direkciya/payments?studentId=${encodeURIComponent(studentId)}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Покупки {studentName.split(" ")[0] ?? "ученика"} →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Активных направлений пока нет. Добавьте их в настройках тарифов.
          </p>
        ) : (
          rows.map((r) => (
            <button
              key={r.directionId}
              type="button"
              onClick={() => {
                setDirectionId(r.directionId);
                setHistoryDirectionId(r.directionId);
              }}
              className={cn(
                "rounded-xl border border-border/70 bg-[color:var(--panel-soft,#fffdf9)] px-4 py-3 text-left transition hover:border-border",
                directionId === r.directionId && "ring-1 ring-[color:var(--accent-ring,#c4b5d4)]"
              )}
            >
              <p className="text-sm text-muted-foreground">{r.directionName}</p>
              <p
                className={cn(
                  "mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight",
                  balanceTone(r.balance)
                )}
              >
                {r.balance}
              </p>
              <p className="text-[11px] text-muted-foreground">занятий</p>
            </button>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-medium">Изменить баланс</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Операция</label>
            <Select
              value={mode}
              onValueChange={(v) => v && setMode(v as AdjustMode)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue>
                  {() => (mode === "credit" ? "Начислить" : "Списать")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Начислить</SelectItem>
                <SelectItem value="debit">Списать</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Направление</label>
            <Select
              value={directionId}
              onValueChange={(v) => v && setDirectionId(v)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue>
                  {() =>
                    rows.find((r) => r.directionId === directionId)
                      ?.directionName ?? "Выберите"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rows.map((r) => (
                  <SelectItem key={r.directionId} value={r.directionId}>
                    {r.directionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Количество</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full rounded-lg"
              onClick={openConfirm}
              disabled={busy || rows.length === 0}
            >
              Продолжить…
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Причина (обязательно)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: компенсация за перенос занятий"
            className="min-h-[72px] rounded-lg"
          />
        </div>
        {mode === "debit" ? (
          <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={allowBelowDebtFloor}
              onChange={(e) => setAllowBelowDebtFloor(e.target.checked)}
            />
            <span>
              Разрешить баланс ниже лимита долга (−2). Только осознанная
              административная корректировка.
            </span>
          </label>
        ) : null}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold tracking-tight">
            История баланса
          </h3>
          <Select
            value={historyDirectionId}
            onValueChange={(v) => v && setHistoryDirectionId(v)}
          >
            <SelectTrigger className="w-[200px] rounded-lg">
              <SelectValue>
                {() =>
                  historyDirectionId === "all"
                    ? "Все направления"
                    : (rows.find((r) => r.directionId === historyDirectionId)
                        ?.directionName ?? "Направление")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все направления</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.directionId} value={r.directionId}>
                  {r.directionName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {ledgerLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка истории…</p>
        ) : ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Операций по балансу пока нет.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {ledger.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {lessonLedgerReasonLabel(e.reason)}
                    {e.directionName ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {e.directionName}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(e.createdAt)}
                    {e.actorName ? ` · ${e.actorName}` : ""}
                  </p>
                  {e.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.note}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    e.delta > 0 ? "text-emerald-800" : "text-foreground"
                  )}
                >
                  {lessonLedgerDeltaLabel(e.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        title={
          pending?.mode === "credit"
            ? "Подтвердить начисление"
            : "Подтвердить списание"
        }
        description={
          pending
            ? `${pending.mode === "credit" ? "Начислить" : "Списать"} ${pending.amount} зан. · ${pending.directionName}. Причина: ${pending.note}${
                pending.allowBelowDebtFloor
                  ? " Разрешён баланс ниже лимита долга."
                  : ""
              }`
            : undefined
        }
        confirmLabel={pending?.mode === "credit" ? "Начислить" : "Списать"}
        confirmVariant={pending?.mode === "debit" ? "destructive" : "default"}
        busy={busy}
        busyLabel="Сохранение…"
        onConfirm={() => void applyAdjust()}
      />
    </section>
  );
}
