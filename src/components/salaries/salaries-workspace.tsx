"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { appDateKey, startOfAppMonth, toAppDateTimeLocalValue } from "@/lib/app-time";
import { formatDateTime } from "@/lib/format";
import { formatKopecksRu, parseRubStringToKopecks } from "@/lib/money-kopecks";
import type { DynamicsBucket } from "@/lib/teacher-payroll-analytics";
import type { PayrollEntryType } from "@/lib/teacher-payroll";
import { apiPlatform } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type TeacherPayrollListRow = {
  teacherId: string;
  fullName: string;
  status: string;
  ratesComplete: boolean;
  accruedAllKopecks: number;
  paidAllKopecks: number;
  debtKopecks: number;
  accruedPeriodKopecks: number;
  paidPeriodKopecks: number;
  adjustmentsPeriodKopecks: number;
};

type PayrollOverview = {
  period: { from: string; to: string };
  school: {
    accruedPeriodKopecks: number;
    adjustmentsPeriodKopecks: number;
    paidPeriodKopecks: number;
    debtKopecks: number;
    completedSlotsPeriod: number;
    presentPeriod: number;
    averageAccrualPerSlotKopecks: number | null;
    teacherDebtSumKopecks: number;
  };
  weekly: DynamicsBucket[];
  monthly: DynamicsBucket[];
  teachers: TeacherPayrollListRow[];
};

type PayrollHistoryItem = {
  id: string;
  type: PayrollEntryType;
  amountKopecks: number;
  signedKopecks: number;
  balanceAfterKopecks: number;
  presentCount: number | null;
  appliedRateKopecks: number | null;
  explanation: string;
  comment: string | null;
  slotDate: string | null;
  slotStartTime: string | null;
  slotStartsAt: string | null;
  canonicalLessonId: string | null;
  occurredAt: string;
  createdAt: string;
};

type TeacherPayrollDetail = {
  totals: {
    accruedPeriodKopecks: number;
    paidPeriodKopecks: number;
    adjustmentsPeriodKopecks: number;
    debtKopecks: number;
    completedSlotsPeriod: number;
    presentPeriod: number;
    averagePresentPerSlot: number | null;
    averageAccrualPerSlotKopecks: number | null;
  };
  weekly: DynamicsBucket[];
  monthly: DynamicsBucket[];
  blockedSlots: {
    reason: string | null;
    presentCount: number | null;
    slotDate: string;
    slotStartTime: string;
  }[];
  history: PayrollHistoryItem[];
  historyTotal: number;
  historyOffset: number;
  historyLimit: number;
};

function Metric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate font-medium tabular-nums tracking-tight",
          danger && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

function debtLabel(kopecks: number): string {
  if (kopecks < 0) return `${formatKopecksRu(kopecks)} — переплата`;
  return formatKopecksRu(kopecks);
}

function Bars({
  items,
}: {
  items: { key: string; label: string; accruedKopecks: number; paidKopecks: number }[];
}) {
  const max = Math.max(
    1,
    ...items.map((i) => Math.max(i.accruedKopecks, i.paidKopecks))
  );
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет данных за период.</p>;
  }
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
          <p className="truncate text-[11px] text-muted-foreground">{item.label}</p>
          <div className="space-y-1">
            <div
              className="h-1.5 rounded-full bg-foreground/80"
              style={{ width: `${Math.round((item.accruedKopecks * 100) / max)}%` }}
              title={`Начислено ${formatKopecksRu(item.accruedKopecks)}`}
            />
            <div
              className="h-1.5 rounded-full bg-foreground/30"
              style={{ width: `${Math.round((item.paidKopecks * 100) / max)}%` }}
              title={`Выплачено ${formatKopecksRu(item.paidKopecks)}`}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Тёмная полоса — начисления, светлая — выплаты.
      </p>
    </div>
  );
}

function typeLabel(type: PayrollHistoryItem["type"]): string {
  if (type === "accrual") return "Начисление";
  if (type === "adjustment") return "Корректировка";
  return "Выплата";
}

export function SalariesWorkspace() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => appDateKey(startOfAppMonth(now)));
  const [to, setTo] = useState(() => appDateKey(now));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"debt_desc" | "debt_asc" | "name">("debt_desc");
  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiPlatform<PayrollOverview>("getPayrollOverview", {
        from,
        to,
        query,
        sort,
      });
      setOverview(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить зарплаты");
    } finally {
      setLoading(false);
    }
  }, [from, to, query, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Зарплаты"
        description="Начисления по фактической посещаемости слота, выплаты и долг школы перед преподавателями."
      />

      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск преподавателя…"
          className="border-transparent bg-background sm:max-w-xs"
        />
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border-transparent bg-background sm:w-40"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border-transparent bg-background sm:w-40"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-8 rounded-lg border border-transparent bg-background px-2 text-sm"
        >
          <option value="debt_desc">Долг: больше → меньше</option>
          <option value="debt_asc">Долг: меньше → больше</option>
          <option value="name">По имени</option>
        </select>
      </FilterBar>

      {overview ? (
        <section className="panel mb-5 space-y-4 p-4">
          <h2 className="font-display text-base font-semibold">Сводка по школе</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Начислено за период"
              value={formatKopecksRu(overview.school.accruedPeriodKopecks)}
            />
            <Metric
              label="Корректировки за период"
              value={formatKopecksRu(overview.school.adjustmentsPeriodKopecks)}
            />
            <Metric
              label="Выплачено за период"
              value={formatKopecksRu(overview.school.paidPeriodKopecks)}
            />
            <Metric
              label="Текущий долг школы"
              value={debtLabel(overview.school.debtKopecks)}
              hint="По всей истории, не только за период"
              danger={overview.school.debtKopecks < 0}
            />
            <Metric
              label="Слотов с начислением"
              value={String(overview.school.completedSlotsPeriod)}
            />
            <Metric
              label="Присутствий"
              value={String(overview.school.presentPeriod)}
            />
            <Metric
              label="Среднее начисление на слот"
              value={
                overview.school.averageAccrualPerSlotKopecks == null
                  ? "—"
                  : formatKopecksRu(overview.school.averageAccrualPerSlotKopecks)
              }
            />
            <Metric
              label="Сумма долгов преподавателей"
              value={formatKopecksRu(overview.school.teacherDebtSumKopecks)}
              hint="Должна совпадать с долгом школы"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">По неделям</h3>
              <Bars items={overview.weekly} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">По месяцам</h3>
              <Bars items={overview.monthly} />
            </div>
          </div>
        </section>
      ) : null}

      {loading && !overview ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : overview && overview.teachers.length === 0 ? (
        <EmptyState title="Нет преподавателей" description="Список берётся из раздела «Преподаватели»." />
      ) : (
        <div className="divide-y divide-border/70">
          {overview?.teachers.map((row) => (
            <TeacherPayrollCard
              key={row.teacherId}
              row={row}
              from={from}
              to={to}
              open={openId === row.teacherId}
              onToggle={() =>
                setOpenId((id) => (id === row.teacherId ? null : row.teacherId))
              }
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TeacherPayrollCard({
  row,
  from,
  to,
  open,
  onToggle,
  onChanged,
}: {
  row: TeacherPayrollListRow;
  from: string;
  to: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <section>
      <button
        type="button"
        className="flex w-full items-start gap-2 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">
              {row.fullName}
              {!row.ratesComplete ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ставки не настроены
                </span>
              ) : null}
            </h3>
            <p
              className={cn(
                "text-sm tabular-nums",
                row.debtKopecks < 0 && "text-destructive"
              )}
            >
              Долг: {debtLabel(row.debtKopecks)}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <span>Начислено всего: {formatKopecksRu(row.accruedAllKopecks)}</span>
            <span>Выплачено всего: {formatKopecksRu(row.paidAllKopecks)}</span>
            <span>Начислено за период: {formatKopecksRu(row.accruedPeriodKopecks)}</span>
            <span>Выплачено за период: {formatKopecksRu(row.paidPeriodKopecks)}</span>
          </div>
        </div>
      </button>
      {open ? (
        <TeacherPayrollDetail
          teacherId={row.teacherId}
          from={from}
          to={to}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  );
}

function TeacherPayrollDetail({
  teacherId,
  from,
  to,
  onChanged,
}: {
  teacherId: string;
  from: string;
  to: string;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TeacherPayrollDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);

  const reload = useCallback(async () => {
    setDetailError(null);
    try {
      const data = await loadDetail(teacherId, from, to, 0);
      setDetail(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось загрузить историю";
      setDetailError(message);
      toast.error(message);
    }
  }, [teacherId, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!detail) return;
    const next = await loadDetail(
      teacherId,
      from,
      to,
      detail.historyOffset + detail.historyLimit
    );
    setDetail({
      ...next,
      history: [...detail.history, ...next.history],
      historyOffset: next.historyOffset,
    });
  }

  if (detailError) {
    return (
      <p className="pb-4 pl-6 text-sm text-destructive">{detailError}</p>
    );
  }
  if (!detail) {
    return <p className="pb-4 pl-6 text-sm text-muted-foreground">Загрузка истории…</p>;
  }

  return (
    <div className="space-y-4 pb-5 pl-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Начислено за период" value={formatKopecksRu(detail.totals.accruedPeriodKopecks)} />
        <Metric label="Выплачено за период" value={formatKopecksRu(detail.totals.paidPeriodKopecks)} />
        <Metric
          label="Корректировки за период"
          value={formatKopecksRu(detail.totals.adjustmentsPeriodKopecks)}
        />
        <Metric
          label="Текущий долг"
          value={debtLabel(detail.totals.debtKopecks)}
          danger={detail.totals.debtKopecks < 0}
        />
        <Metric label="Слотов" value={String(detail.totals.completedSlotsPeriod)} />
        <Metric label="Присутствий" value={String(detail.totals.presentPeriod)} />
        <Metric
          label="Среднее присутствующих"
          value={
            detail.totals.averagePresentPerSlot == null
              ? "—"
              : String(detail.totals.averagePresentPerSlot)
          }
        />
        <Metric
          label="Среднее начисление на слот"
          value={
            detail.totals.averageAccrualPerSlotKopecks == null
              ? "—"
              : formatKopecksRu(detail.totals.averageAccrualPerSlotKopecks)
          }
        />
      </div>

      {detail.blockedSlots.length > 0 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Есть слоты без начисления:{" "}
          {detail.blockedSlots
            .map(
              (s) =>
                `${s.slotDate} ${s.slotStartTime} (${s.reason}, присутствующих: ${s.presentCount ?? "—"})`
            )
            .join("; ")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium">Начисления и выплаты</h4>
          <Bars items={detail.weekly} />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">По месяцам</h4>
          <Bars items={detail.monthly} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">История операций</h4>
        <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
          Добавить выплату
        </Button>
      </div>
      {detail.history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Операций пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {detail.history.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border/70 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{typeLabel(item.type)}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    item.signedKopecks < 0 && "text-destructive"
                  )}
                >
                  {item.signedKopecks > 0 ? "+" : ""}
                  {formatKopecksRu(item.signedKopecks)}
                </span>
              </div>
              <p className="text-muted-foreground">{item.explanation}</p>
              {item.comment ? (
                <p className="text-xs text-muted-foreground">Комментарий: {item.comment}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{formatDateTime(item.occurredAt)}</span>
                {item.presentCount != null ? (
                  <span>Присутствующих: {item.presentCount}</span>
                ) : null}
                {item.appliedRateKopecks != null ? (
                  <span>Ставка: {formatKopecksRu(item.appliedRateKopecks)}</span>
                ) : null}
                {item.slotStartsAt ? (
                  <span>
                    Слот: {item.slotDate} {item.slotStartTime}
                  </span>
                ) : null}
                {item.canonicalLessonId ? (
                  <Link href="/direkciya/schedule" className="underline-offset-2 hover:underline">
                    К расписанию
                  </Link>
                ) : null}
                <span>Остаток: {formatKopecksRu(item.balanceAfterKopecks)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {detail.history.length < detail.historyTotal ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()}>
          Показать ещё
        </Button>
      ) : null}

      <PayoutDialog
        teacherId={teacherId}
        open={payoutOpen}
        onOpenChange={setPayoutOpen}
        onCreated={async () => {
          await reload();
          onChanged();
        }}
      />
    </div>
  );
}

async function loadDetail(
  teacherId: string,
  from: string,
  to: string,
  offset: number
) {
  return apiPlatform<TeacherPayrollDetail>("getTeacherPayrollDetail", {
    teacherId,
    from,
    to,
    offset,
    limit: 50,
  });
}

function PayoutDialog({
  teacherId,
  open,
  onOpenChange,
  onCreated,
}: {
  teacherId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const formId = useId();
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    toAppDateTimeLocalValue(new Date().toISOString())
  );
  const [comment, setComment] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setComment("");
      setOccurredAt(toAppDateTimeLocalValue(new Date().toISOString()));
      setRequestKey(crypto.randomUUID());
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (busy) return;
    let kopecks: number;
    try {
      kopecks = parseRubStringToKopecks(amount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Некорректная сумма");
      return;
    }
    if (kopecks <= 0) {
      toast.error("Сумма выплаты должна быть больше нуля");
      return;
    }
    setBusy(true);
    try {
      await apiPlatform(
        "createTeacherPayout",
        {
          teacherId,
          amountKopecks: kopecks,
          occurredAt,
          comment: comment.trim() || undefined,
          idempotencyKey: requestKey,
        },
        requestKey
      );
      toast.success("Выплата сохранена");
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить выплату");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить выплату</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label>Сумма, ₽</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Дата и время выплаты</Label>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Комментарий</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
