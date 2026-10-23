"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  buildCurrentTariffOverview,
  buildMonthSummaries,
  filterIncomePayments,
  monthKeyFromInstant,
  type CurrentTariffOverview,
  type IncomePaymentRow,
  type MonthSummary,
} from "@/lib/income-analytics";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { PaymentRecordStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium tabular-nums tracking-tight">{value}</p>
      {hint ? (
        <p className="text-[11px] leading-snug text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function MonthBlock({
  month,
  defaultOpen,
  query,
  statusFilter,
  onMarkPaid,
  busyId,
}: {
  month: MonthSummary;
  defaultOpen: boolean;
  query: string;
  statusFilter: PaymentRecordStatus | "all";
  onMarkPaid: (id: string) => void;
  busyId: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = useMemo(
    () =>
      filterIncomePayments(month.payments, {
        query,
        status: statusFilter,
      }),
    [month.payments, query, statusFilter]
  );

  return (
    <section className="border-b border-border/70 last:border-0">
      <button
        type="button"
        className="flex w-full items-start gap-2 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold tracking-tight">
            {month.label}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Учеников на конец месяца"
              value={String(month.studentsAtMonthEnd)}
              hint={
                month.studentsAtMonthEndReliable
                  ? undefined
                  : "По дате создания существующих карточек"
              }
            />
            <Metric
              label="Купленных тарифов"
              value={String(month.purchasedTariffs)}
            />
            <Metric
              label="Средняя стоимость"
              value={
                month.averagePurchaseAmount == null
                  ? "—"
                  : money(month.averagePurchaseAmount)
              }
            />
            <Metric label="Поступило" value={money(month.revenue)} />
          </div>
        </div>
      </button>

      {open ? (
        <div className="pb-4 pl-6">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет платежей за этот месяц
              {query || statusFilter !== "all" ? " по фильтру" : ""}.
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((p) => (
                <PaymentLine
                  key={p.id}
                  payment={p}
                  busy={busyId === p.id}
                  onMarkPaid={() => onMarkPaid(p.id)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PaymentLine({
  payment,
  busy,
  onMarkPaid,
}: {
  payment: IncomePaymentRow;
  busy: boolean;
  onMarkPaid: () => void;
}) {
  const statusLabel: Record<PaymentRecordStatus, string> = {
    paid: "Оплачен",
    pending: "Ожидает",
    cancelled: "Отменён",
    failed: "Ошибка",
  };

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {payment.studentName}
          {payment.tariffName ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {payment.tariffName}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(payment.at)} · {statusLabel[payment.status]}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums font-medium">{money(payment.amount)}</span>
        {payment.status === "pending" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-lg px-2 text-xs"
            disabled={busy}
            onClick={onMarkPaid}
          >
            Оплачен
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function AttentionList({
  overview,
  query,
}: {
  overview: CurrentTariffOverview;
  query: string;
}) {
  const q = query.trim().toLowerCase();
  const rows = overview.attention.filter((r) =>
    q ? r.studentName.toLowerCase().includes(q) : true
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет тарифов, требующих внимания
        {q ? " по запросу" : " в ближайшие 7 дней"}.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.assignmentId}>
          <Link
            href={`/direkciya/students/${r.studentId}`}
            className={cn(
              "flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40",
              r.isExpired && "bg-destructive/5"
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{r.studentName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.tariffName} · до {formatDate(r.endsAt)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                r.isExpired
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {r.urgencyLabel}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TariffGroups({
  overview,
  query,
}: {
  overview: CurrentTariffOverview;
  query: string;
}) {
  const q = query.trim().toLowerCase();
  const [openId, setOpenId] = useState<string | null>(
    overview.byTariff[0]?.tariffId ?? null
  );

  if (overview.byTariff.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет учеников с оплаченным действующим назначением.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {overview.byTariff.map((g) => {
        const students = g.students.filter((s) =>
          q ? s.studentName.toLowerCase().includes(q) : true
        );
        if (q && students.length === 0) return null;
        const open = openId === g.tariffId;
        return (
          <section key={g.tariffId} className="border-b border-border/60 last:border-0">
            <button
              type="button"
              className="flex w-full items-center gap-2 py-2 text-left text-sm"
              onClick={() =>
                setOpenId((id) => (id === g.tariffId ? null : g.tariffId))
              }
            >
              {open ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">
                {g.tariffName}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {q ? students.length : g.count}
              </span>
            </button>
            {open ? (
              <ul className="space-y-0.5 pb-2 pl-5">
                {students.map((s) => (
                  <li key={s.assignmentId}>
                    <Link
                      href={`/direkciya/students/${s.studentId}`}
                      className="flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/40"
                    >
                      <span className="truncate">{s.studentName}</span>
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums",
                          s.isExpired
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {s.urgencyLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function IncomeWorkspace() {
  const { data, ready } = useDemoStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PaymentRecordStatus | "all"
  >("all");
  const [rightQuery, setRightQuery] = useState("");
  const [serverMonths, setServerMonths] = useState<MonthSummary[] | null>(null);
  const [serverCurrent, setServerCurrent] =
    useState<CurrentTariffOverview | null>(null);

  const localMonths = useMemo(() => {
    return buildMonthSummaries({
      payments: data.payments.map((p) => ({
        id: p.id,
        studentId: p.studentId,
        assignmentId: p.assignmentId,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      students: data.students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        createdAt: s.createdAt ?? "1970-01-01T00:00:00.000Z",
      })),
      assignments: data.tariffAssignments.map((a) => ({
        id: a.id,
        tariffName: a.tariffName,
      })),
    });
  }, [data.payments, data.students, data.tariffAssignments]);

  const localCurrent = useMemo(
    () =>
      buildCurrentTariffOverview({
        students: data.students.map((s) => ({
          id: s.id,
          fullName: s.fullName,
        })),
        assignments: data.tariffAssignments,
      }),
    [data.students, data.tariffAssignments]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiPlatform<{
          months: MonthSummary[];
          current: CurrentTariffOverview;
        }>("getIncomeOverview", {});
        if (!cancelled) {
          setServerMonths(res.months);
          setServerCurrent(res.current);
        }
      } catch {
        // Bootstrap-данные остаются запасным источником
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.payments.length, data.tariffAssignments.length]);

  const months = serverMonths ?? localMonths;
  const current = serverCurrent ?? localCurrent;
  const currentMonthKey = monthKeyFromInstant(new Date());

  async function markPaid(paymentId: string) {
    const reason = window.prompt(
      "Причина ручной фиксации оплаты (обязательно):"
    );
    if (!reason || reason.trim().length < 3) return;
    setBusyId(paymentId);
    try {
      await apiPlatform("adminMarkPaymentPaid", { paymentId, reason });
      toast.success("Оплата зафиксирована");
      const res = await apiPlatform<{
        months: MonthSummary[];
        current: CurrentTariffOverview;
      }>("getIncomeOverview", {});
      setServerMonths(res.months);
      setServerCurrent(res.current);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Доходы"
        description="Поступления по месяцам и сроки действующих тарифов. Время — Europe/Moscow."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск ученика в платежах…"
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            v && setStatusFilter(v as PaymentRecordStatus | "all")
          }
        >
          <SelectTrigger className="w-[160px] rounded-lg">
            <SelectValue>
              {(v) =>
                v === "paid"
                  ? "Оплачен"
                  : v === "pending"
                    ? "Ожидает"
                    : v === "cancelled"
                      ? "Отменён"
                      : v === "failed"
                        ? "Ошибка"
                        : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="paid">Оплачен</SelectItem>
            <SelectItem value="pending">Ожидает</SelectItem>
            <SelectItem value="cancelled">Отменён</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
            Поступления по месяцам
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            «Поступило» — сумма фактически оплаченных платежей.
          </p>
          {months.length === 0 ? (
            <EmptyState title="Платежей пока нет" />
          ) : (
            <div>
              {months.map((m) => (
                <MonthBlock
                  key={m.monthKey}
                  month={m}
                  defaultOpen={m.monthKey === currentMonthKey}
                  query={query}
                  statusFilter={statusFilter}
                  onMarkPaid={(id) => void markPaid(id)}
                  busyId={busyId}
                />
              ))}
            </div>
          )}
          {!current.limitations[0] ? null : (
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              {current.limitations[0]}
            </p>
          )}
        </div>

        <aside className="min-w-0 lg:border-l lg:border-border/70 lg:pl-6">
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
            Текущие тарифы
          </h2>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Metric label="Действует" value={String(current.activeCount)} />
            <Metric label="Истёк" value={String(current.expiredCount)} />
            <Metric label="Скоро" value={String(current.soonCount)} />
          </div>

          <Input
            value={rightQuery}
            onChange={(e) => setRightQuery(e.target.value)}
            placeholder="Найти ученика…"
            className="mb-3"
          />

          <h3 className="mb-2 text-sm font-medium">Ближайшие окончания</h3>
          <AttentionList overview={current} query={rightQuery} />

          <h3 className="mb-2 mt-6 text-sm font-medium">По тарифам</h3>
          <TariffGroups overview={current} query={rightQuery} />
        </aside>
      </div>
    </div>
  );
}
