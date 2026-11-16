"use client";

import Link from "next/link";
import { useMemo } from "react";

import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import {
  lessonOrderStatusLabel,
  paymentRecordStatusLabel,
  STUDENT_CHECKOUT_PATH,
} from "@/lib/payment-checkout";
import { lessonsCountLabel } from "@/lib/ru-plural";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import type { LessonOrder, PaymentRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowTone: Record<string, string> = {
  paid: "bg-pastel-mint/80",
  awaiting_payment: "bg-pastel-beige/80",
  pending: "bg-pastel-beige/80",
  failed: "bg-pastel-rose/80",
  cancelled: "bg-pastel-rose/80",
  refunded: "bg-pastel-rose/70",
};

function money(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function packageStatusFromBalance(balance: number | null): "active" | "exhausted" | "debt" | "none" {
  if (balance == null) return "none";
  if (balance <= -1) return "debt";
  if (balance <= 0) return "exhausted";
  return "active";
}

export function PaymentHistoryPanel() {
  const { data, ready } = useDemoStore();
  const href = useStudentCabinetHref();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);

  const orders = data.lessonOrders ?? [];
  const payments = data.payments ?? [];

  const paymentByOrder = useMemo(() => {
    const map = new Map<string, PaymentRecord>();
    for (const p of payments.filter((x) => x.studentId === studentId)) {
      const prev = map.get(p.orderId);
      if (
        !prev ||
        new Date(p.createdAt).getTime() > new Date(prev.createdAt).getTime()
      ) {
        map.set(p.orderId, p);
      }
    }
    return map;
  }, [payments, studentId]);

  const history = useMemo(
    () =>
      [...orders]
        .filter((o) => o.studentId === studentId)
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime()
        ),
    [orders, studentId]
  );

  const balances = student?.directionBalances ?? [];
  const minBalance = balances.length
    ? Math.min(...balances.map((b) => b.balance))
    : null;

  const pendingPayment = useMemo(
    () =>
      payments.find(
        (p) => p.studentId === studentId && p.status === "pending"
      ) ?? null,
    [payments, studentId]
  );

  if (!ready) return null;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      {pendingPayment ? (
        <p className="rounded-2xl border border-black/10 bg-pastel-beige/75 px-4 py-3 text-sm">
          Есть заказ, ожидающий подтверждения оплаты. Повторный заказ можно
          оформить после завершения текущего платежа.
        </p>
      ) : null}

      <section className="auditoria-home-card">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Баланс занятий
        </h2>
        {balances.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            После первой покупки здесь появятся остатки по направлениям.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {balances.map((b) => (
              <li
                key={b.directionId}
                className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3"
              >
                <p className="text-xs text-muted-foreground">
                  {b.directionName ?? b.directionSlug ?? "Направление"}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">
                  {lessonsCountLabel(b.balance)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <TariffBalanceNotice
          remaining={minBalance}
          packageStatus={packageStatusFromBalance(minBalance)}
          className="mt-3"
        />
        <Link
          href={href(STUDENT_CHECKOUT_PATH)}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#e7dff6]/90 px-4 text-sm"
        >
          Купить занятия →
        </Link>
      </section>

      <section className="auditoria-home-card min-w-0">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          История заказов
        </h2>
        {history.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Пока нет заказов"
              description="Оформленные покупки появятся здесь со статусом оплаты."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                payment={paymentByOrder.get(order.id) ?? null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderRow({
  order,
  payment,
}: {
  order: LessonOrder;
  payment: PaymentRecord | null;
}) {
  const statusKey = payment?.status ?? order.status;
  const tone =
    rowTone[statusKey] ?? rowTone[order.status] ?? "bg-auditoria-surface";

  return (
    <li
      className={cn(
        "min-w-0 rounded-2xl border border-black/10 px-3 py-3",
        tone
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{order.tariffNameSnapshot}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(order.createdAt ?? payment?.createdAt ?? "")} ·{" "}
            {lessonsCountLabel(order.lessonsCount)} ·{" "}
            {lessonOrderStatusLabel(order.status)}
            {payment
              ? ` · платёж: ${paymentRecordStatusLabel(payment.status)}`
              : null}
          </p>
          {payment?.failureReason ? (
            <p className="mt-1 text-xs text-destructive/90">
              {payment.failureReason}
            </p>
          ) : null}
        </div>
        <p className="text-sm font-medium tabular-nums">
          {money(order.totalAmount)}
        </p>
      </div>
    </li>
  );
}