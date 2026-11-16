"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SettlementDownloadLinks } from "@/components/settlements/settlement-download-links";
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
  lessonOrderStatusLabel,
  paymentRecordStatusLabel,
} from "@/lib/payment-checkout";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type {
  LessonOrder,
  PaymentRecord,
  PaymentRecordStatus,
  SettlementDocumentSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type CommerceRow = {
  payment: PaymentRecord;
  order: LessonOrder | null;
  studentName: string;
  payerName: string;
  payerDiffers: boolean;
  directionName: string;
  eventAt: string;
};

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("ru-RU");
  return n < 0 ? `−${abs} ₽` : `${abs} ₽`;
}

function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  if (provider === "tochka") return "Точка (СБП)";
  if (provider === "stub") return "Тестовый";
  return provider;
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
    <div className="min-w-0 rounded-xl border border-border/60 bg-[color:var(--panel-soft,#fffdf9)] px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function dayStartMs(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const t = Date.parse(`${isoDate}T00:00:00`);
  return Number.isFinite(t) ? t : null;
}

function dayEndMs(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const t = Date.parse(`${isoDate}T23:59:59.999`);
  return Number.isFinite(t) ? t : null;
}

export function IncomeWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentIdFromUrl = searchParams.get("studentId")?.trim() || "";

  const { data, ready, reload } = useDemoStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PaymentRecordStatus | "all"
  >("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [studentFilter, setStudentFilter] = useState(studentIdFromUrl);

  useEffect(() => {
    setStudentFilter(studentIdFromUrl);
  }, [studentIdFromUrl]);

  function clearStudentFilter() {
    setStudentFilter("");
    if (studentIdFromUrl) {
      router.replace("/direkciya/payments");
    }
  }

  function focusStudent(studentId: string) {
    setStudentFilter(studentId);
    router.replace(
      `/direkciya/payments?studentId=${encodeURIComponent(studentId)}`
    );
  }

  const orders = data.lessonOrders ?? [];
  const payments = data.payments ?? [];
  const settlementDocuments = data.settlementDocuments ?? [];
  const students = data.students ?? [];
  const directions = (data.learningDirections ?? []).filter(
    (d) => d.status === "active"
  );

  const docsByPayment = useMemo(() => {
    const map = new Map<string, SettlementDocumentSummary[]>();
    for (const doc of settlementDocuments) {
      const list = map.get(doc.paymentId) ?? [];
      list.push(doc);
      map.set(doc.paymentId, list);
    }
    return map;
  }, [settlementDocuments]);

  const studentName = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s.fullName]));
    return (id: string | null | undefined, snapshot?: string | null) => {
      if (id && map.has(id)) return map.get(id)!;
      const snap = snapshot?.trim();
      if (snap) return snap;
      return id ? "Ученик" : "Удалённый ученик";
    };
  }, [students]);

  const studentUserId = useMemo(() => {
    const map = new Map(
      students.map((s) => [s.id, s.userId ?? null] as const)
    );
    return (id: string | null | undefined) =>
      id ? map.get(id) ?? null : null;
  }, [students]);

  const orderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders]
  );

  const commerceRows = useMemo((): CommerceRow[] => {
    return [...payments]
      .sort(
        (a, b) =>
          new Date(b.paidAt ?? b.createdAt).getTime() -
          new Date(a.paidAt ?? a.createdAt).getTime()
      )
      .map((payment) => {
        const order = orderById.get(payment.orderId) ?? null;
        const sName = studentName(
          payment.studentId,
          payment.studentNameSnapshot ?? order?.studentNameSnapshot
        );
        const payerName =
          order?.payerName?.trim() ||
          (order &&
          order.payerUserId &&
          studentUserId(payment.studentId) === order.payerUserId
            ? sName
            : null) ||
          sName;
        const payerDiffers = Boolean(
          order &&
            order.payerUserId &&
            studentUserId(payment.studentId) !== order.payerUserId &&
            payerName !== sName
        );
        return {
          payment,
          order,
          studentName: sName,
          payerName,
          payerDiffers,
          directionName:
            order?.directionName ??
            directions.find((d) => d.id === order?.directionId)?.name ??
            "—",
          eventAt: payment.paidAt ?? payment.createdAt,
        };
      });
  }, [payments, orderById, studentName, studentUserId, directions]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = periodFrom ? dayStartMs(periodFrom) : null;
    const toMs = periodTo ? dayEndMs(periodTo) : null;

    return commerceRows.filter((row) => {
      if (studentFilter && row.payment.studentId !== studentFilter) {
        return false;
      }
      if (statusFilter !== "all" && row.payment.status !== statusFilter) {
        return false;
      }
      if (
        directionFilter !== "all" &&
        row.order?.directionId !== directionFilter
      ) {
        return false;
      }
      const at = new Date(row.eventAt).getTime();
      if (fromMs != null && at < fromMs) return false;
      if (toMs != null && at > toMs) return false;
      if (!q) return true;
      return (
        row.studentName.toLowerCase().includes(q) ||
        row.payerName.toLowerCase().includes(q) ||
        (row.order?.tariffNameSnapshot ?? "").toLowerCase().includes(q) ||
        (row.payment.externalId ?? "").toLowerCase().includes(q) ||
        row.payment.id.toLowerCase().includes(q)
      );
    });
  }, [
    commerceRows,
    query,
    statusFilter,
    directionFilter,
    periodFrom,
    periodTo,
    studentFilter,
  ]);

  /** Финансовые итоги: период / направление / ученик / поиск, без фильтра статуса. */
  const metrics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = periodFrom ? dayStartMs(periodFrom) : null;
    const toMs = periodTo ? dayEndMs(periodTo) : null;

    let paidSum = 0;
    let paidCount = 0;
    let refundSum = 0;

    for (const row of commerceRows) {
      if (studentFilter && row.payment.studentId !== studentFilter) continue;
      if (
        directionFilter !== "all" &&
        row.order?.directionId !== directionFilter
      ) {
        continue;
      }
      const at = new Date(row.eventAt).getTime();
      if (fromMs != null && at < fromMs) continue;
      if (toMs != null && at > toMs) continue;
      if (q) {
        const hit =
          row.studentName.toLowerCase().includes(q) ||
          row.payerName.toLowerCase().includes(q) ||
          (row.order?.tariffNameSnapshot ?? "").toLowerCase().includes(q) ||
          (row.payment.externalId ?? "").toLowerCase().includes(q) ||
          row.payment.id.toLowerCase().includes(q);
        if (!hit) continue;
      }

      if (row.payment.status === "paid") {
        paidSum += row.payment.amount;
        paidCount += 1;
      } else if (row.payment.status === "refunded") {
        refundSum += Math.abs(row.payment.amount);
      }
    }

    return {
      paidSum,
      paidCount,
      refundSum,
      netIncome: paidSum - refundSum,
    };
  }, [
    commerceRows,
    query,
    directionFilter,
    periodFrom,
    periodTo,
    studentFilter,
  ]);

  const filteredStudentName = studentFilter
    ? studentName(studentFilter)
    : null;

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
        description="Журнал покупок и платежей. Ручные начисления занятий сюда не попадают — только финансовые операции."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Оплачено"
          value={money(metrics.paidSum)}
          hint="Успешные покупки за период"
        />
        <Metric
          label="Успешных покупок"
          value={String(metrics.paidCount)}
        />
        <Metric
          label="Возвраты"
          value={money(metrics.refundSum)}
          hint="Отдельно от суммы покупок"
        />
        <Metric
          label="Итоговый доход"
          value={money(metrics.netIncome)}
          hint="Оплачено минус возвраты"
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ученик или плательщик…"
          className="max-w-xs"
        />
        <Select
          value={directionFilter}
          onValueChange={(v) => v && setDirectionFilter(v)}
        >
          <SelectTrigger className="w-[200px] rounded-lg">
            <SelectValue>
              {() =>
                directionFilter === "all"
                  ? "Все направления"
                  : (directions.find((d) => d.id === directionFilter)?.name ??
                    "Направление")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все направления</SelectItem>
            {directions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Input
          type="date"
          value={periodFrom}
          onChange={(e) => setPeriodFrom(e.target.value)}
          className="w-[160px] rounded-lg"
          aria-label="Период с"
        />
        <Input
          type="date"
          value={periodTo}
          onChange={(e) => setPeriodTo(e.target.value)}
          className="w-[160px] rounded-lg"
          aria-label="Период по"
        />
        {filteredStudentName ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-sm">
            <span>
              Ученик: <span className="font-medium">{filteredStudentName}</span>
            </span>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted"
              aria-label="Сбросить фильтр ученика"
              onClick={clearStudentFilter}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
        Журнал оплат
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Плательщик и ученик показываются отдельно, если это разные люди.
      </p>

      {filteredRows.length === 0 ? (
        <EmptyState title="Операций по фильтру нет" />
      ) : (
        <ul className="space-y-2">
          {filteredRows.map((row) => {
            const { payment, order } = row;
            const busy = busyId === payment.id;
            const signed =
              payment.status === "refunded"
                ? -payment.amount
                : payment.amount;
            return (
              <li
                key={payment.id}
                className="rounded-xl border border-border/60 px-3 py-3 text-sm hover:bg-muted/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">
                      {payment.studentId ? (
                        <Link
                          href={`/direkciya/students/${payment.studentId}`}
                          className="hover:underline"
                        >
                          {row.studentName}
                        </Link>
                      ) : (
                        <span>{row.studentName}</span>
                      )}
                      {order ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {order.tariffNameSnapshot}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(row.eventAt)}
                      {" · "}
                      {row.directionName}
                      {order ? ` · ${order.lessonsCount} зан.` : ""}
                      {" · "}
                      {providerLabel(payment.provider)}
                      {" · "}
                      {paymentRecordStatusLabel(payment.status)}
                      {order
                        ? ` · заказ: ${lessonOrderStatusLabel(order.status)}`
                        : null}
                    </p>
                    {row.payerDiffers ? (
                      <p className="text-xs text-muted-foreground">
                        Плательщик:{" "}
                        <span className="font-medium text-foreground">
                          {row.payerName}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Плательщик: {row.payerName}
                        {row.payerName === row.studentName
                          ? " (ученик)"
                          : ""}
                      </p>
                    )}
                    {payment.status === "refunded" ? (
                      <p className="text-xs text-destructive/90">
                        Возврат оформлен
                        {payment.failureReason
                          ? `: ${payment.failureReason}`
                          : ""}
                      </p>
                    ) : payment.failureReason ? (
                      <p className="text-xs text-destructive/90">
                        {payment.failureReason}
                      </p>
                    ) : null}
                    {payment.studentId ? (
                      <button
                        type="button"
                        className="text-xs font-medium underline-offset-2 hover:underline"
                        onClick={() => focusStudent(payment.studentId!)}
                      >
                        Все покупки этого ученика
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Профиль ученика удалён · запись сохранена в финансах
                      </p>
                    )}
                    <SettlementDownloadLinks
                      documents={docsByPayment.get(payment.id) ?? []}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <span
                      className={cn(
                        "tabular-nums font-semibold",
                        payment.status === "refunded" && "text-destructive"
                      )}
                    >
                      {money(signed)}
                    </span>
                    {payment.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        disabled={busy}
                        onClick={() => void refreshPayment(payment.id)}
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
                        onClick={() => void refundPayment(payment.id)}
                      >
                        Возврат
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
