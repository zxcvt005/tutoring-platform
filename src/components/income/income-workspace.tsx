"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import {
  buildMonthSummaries,
  filterIncomePayments,
  monthKeyFromInstant,
  type MonthSummary,
} from "@/lib/income-analytics";
import {
  lessonOrderStatusLabel,
  paymentRecordStatusLabel,
} from "@/lib/payment-checkout";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type {
  LessonOrder,
  PaymentRecord,
  PaymentRecordStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type CommerceRow = {
  payment: PaymentRecord;
  order: LessonOrder | null;
  studentName: string;
};

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("ru-RU");
  return n < 0 ? `−${abs} ₽` : `${abs} ₽`;
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
}: {
  month: MonthSummary;
  defaultOpen: boolean;
  query: string;
  statusFilter: PaymentRecordStatus | "all";
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

  const revenue = useMemo(
    () =>
      visible.reduce((sum, p) => {
        if (p.status === "paid" && p.paidAt) return sum + p.amount;
        if (p.status === "refunded") return sum + p.amount;
        return sum;
      }, 0),
    [visible]
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
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label="Операций"
              value={String(visible.length)}
            />
            <Metric label="Поступило" value={money(revenue)} />
            <Metric
              label="Купленных пакетов"
              value={String(month.purchasedTariffs)}
            />
          </div>
        </div>
      </button>

      {open ? (
        <div className="pb-4 pl-6">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет операций за этот месяц
              {query || statusFilter !== "all" ? " по фильтру" : ""}.
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {p.studentName}
                      {p.tariffName ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {p.tariffName}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(p.at)} ·{" "}
                      {paymentRecordStatusLabel(p.status)}
                      {p.lessonsLimit != null ? ` · ${p.lessonsLimit} зан.` : ""}
                    </p>
                    {p.failureReason ? (
                      <p className="text-xs text-destructive/90">
                        {p.failureReason}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      p.status === "refunded" && "text-destructive"
                    )}
                  >
                    {money(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CommercePaymentLine({
  row,
  busy,
  onRefund,
  onRefresh,
}: {
  row: CommerceRow;
  busy: boolean;
  onRefund: () => void;
  onRefresh: () => void;
}) {
  const { payment, order, studentName } = row;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          <Link
            href={`/direkciya/students/${payment.studentId}`}
            className="hover:underline"
          >
            {studentName}
          </Link>
          {order ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {order.tariffNameSnapshot}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDateTime(payment.paidAt ?? payment.createdAt)} ·{" "}
          {paymentRecordStatusLabel(payment.status)}
          {order
            ? ` · заказ: ${lessonOrderStatusLabel(order.status)}`
            : null}
          {order ? ` · ${order.lessonsCount} зан.` : null}
        </p>
        {payment.failureReason ? (
          <p className="mt-1 text-xs text-destructive/90">
            {payment.failureReason}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        <span
          className={cn(
            "tabular-nums font-medium",
            payment.status === "refunded" && "text-destructive"
          )}
        >
          {money(
            payment.status === "refunded" ? -payment.amount : payment.amount
          )}
        </span>
        {payment.status === "pending" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Обновить
          </Button>
        ) : null}
        {payment.status === "paid" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg"
            disabled={busy}
            onClick={onRefund}
          >
            Возврат
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function IncomeWorkspace() {
  const { data, ready, reload } = useDemoStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PaymentRecordStatus | "all"
  >("all");
  const [serverMonths, setServerMonths] = useState<MonthSummary[] | null>(null);

  const orders = data.lessonOrders ?? [];
  const payments = data.payments ?? [];
  const students = data.students ?? [];

  const studentName = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s.fullName]));
    return (id: string) => map.get(id) ?? "Ученик";
  }, [students]);

  const orderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders]
  );

  const commerceRows = useMemo((): CommerceRow[] => {
    return [...payments]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((payment) => ({
        payment,
        order: orderById.get(payment.orderId) ?? null,
        studentName: studentName(payment.studentId),
      }));
  }, [payments, orderById, studentName]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commerceRows.filter((row) => {
      if (statusFilter !== "all" && row.payment.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.studentName.toLowerCase().includes(q) ||
        (row.order?.tariffNameSnapshot ?? "").toLowerCase().includes(q)
      );
    });
  }, [commerceRows, query, statusFilter]);

  const localMonths = useMemo(() => {
    return buildMonthSummaries({
      payments: payments.map((p) => {
        const order = orderById.get(p.orderId);
        const signed =
          p.status === "refunded" ? -Number(p.amount) : Number(p.amount);
        return {
          id: p.id,
          studentId: p.studentId,
          assignmentId: p.orderId,
          amount: signed,
          status: p.status,
          paidAt: p.paidAt ?? null,
          createdAt: p.paidAt ?? p.createdAt,
          failureReason: p.failureReason ?? null,
        };
      }),
      students: students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        createdAt: s.createdAt ?? "1970-01-01T00:00:00.000Z",
      })),
      assignments: orders
        .filter((o) => o.status === "paid")
        .map((o) => ({
          id: o.id,
          studentId: o.studentId,
          tariffName: o.tariffNameSnapshot,
          lessonsLimitSnapshot: o.lessonsCount,
          status: "active" as const,
          paymentStatus: "paid" as const,
        })),
    });
  }, [payments, orderById, students, orders]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiPlatform<{ months: MonthSummary[] }>(
          "getCommerceIncomeOverview",
          {}
        );
        if (!cancelled) setServerMonths(res.months);
      } catch {
        // bootstrap
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payments.length, orders.length]);

  const months = serverMonths ?? localMonths;
  const currentMonthKey = monthKeyFromInstant(new Date());

  async function refreshPayment(paymentId: string) {
    setBusyId(paymentId);
    try {
      await apiPlatform("refreshLessonOrderPayment", { paymentId });
      toast.success("Статус обновлён");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось обновить");
    } finally {
      setBusyId(null);
    }
  }

  async function refundPayment(paymentId: string) {
    const reason = window.prompt("Причина возврата (необязательно):");
    if (reason === null) return;
    setBusyId(paymentId);
    try {
      await apiPlatform("adminRefundLessonPayment", {
        paymentId,
        reason: reason.trim() ? reason.trim() : undefined,
      });
      toast.success("Возврат оформлен");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка возврата");
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
        description="Заказы на занятия и платежи. Выручка считается только по оплаченным операциям; возвраты отображаются отдельно."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск ученика или тарифа…"
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            v && setStatusFilter(v as PaymentRecordStatus | "all")
          }
        >
          <SelectTrigger className="w-[200px] rounded-lg">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Все статусы"
                  : paymentRecordStatusLabel(v as PaymentRecordStatus)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="paid">Оплачен</SelectItem>
            <SelectItem value="pending">Ожидает подтверждения</SelectItem>
            <SelectItem value="refunded">Возврат</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
            <SelectItem value="cancelled">Отменён</SelectItem>
            <SelectItem value="expired">Истёк</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
            Платежи и заказы
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Ручное подтверждение отключено — статус приходит из банка.
          </p>
          {filteredRows.length === 0 ? (
            <EmptyState title="Операций пока нет" />
          ) : (
            <ul className="space-y-2">
              {filteredRows.map((row) => (
                <CommercePaymentLine
                  key={row.payment.id}
                  row={row}
                  busy={busyId === row.payment.id}
                  onRefresh={() => void refreshPayment(row.payment.id)}
                  onRefund={() => void refundPayment(row.payment.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className="min-w-0 lg:border-l lg:border-border/70 lg:pl-6">
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
            По месяцам
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            «Поступило» — только оплаченные платежи минус возвраты.
          </p>
          {months.length === 0 ? (
            <EmptyState title="Нет данных по месяцам" />
          ) : (
            <div>
              {months.map((m) => (
                <MonthBlock
                  key={m.monthKey}
                  month={m}
                  defaultOpen={m.monthKey === currentMonthKey}
                  query={query}
                  statusFilter={statusFilter}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}