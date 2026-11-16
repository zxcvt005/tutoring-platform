"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CheckoutStepper,
  PaymentStatusCard,
} from "@/components/auditoria/payment-flow-view";
import {
  CHECKOUT_PAYMENT_SESSION_KEY,
  paymentFlowFromRecord,
  RETURN_NOT_PAID_HINT,
  STUDENT_PAY_PATH,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { lessonsCountLabel } from "@/lib/ru-plural";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

type RefreshResult = {
  status: string;
  confirmed?: boolean;
};

export function PaymentCompletePanel() {
  const { data, reload } = useDemoStore();
  const studentId = data.currentStudentId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const started = useRef(false);

  const targetPaymentId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const fromSession = sessionStorage.getItem(CHECKOUT_PAYMENT_SESSION_KEY);
      if (fromSession) return fromSession;
    } catch {
      // ignore
    }
    const pending = [...(data.payments ?? [])]
      .filter((p) => p.studentId === studentId && p.status === "pending")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
    return pending?.id ?? null;
  }, [data.payments, studentId]);

  const payment = useMemo(
    () =>
      targetPaymentId
        ? (data.payments.find((p) => p.id === targetPaymentId) ?? null)
        : null,
    [data.payments, targetPaymentId]
  );

  const order = useMemo(
    () =>
      payment
        ? (data.lessonOrders.find((o) => o.id === payment.orderId) ?? null)
        : null,
    [data.lessonOrders, payment]
  );

  const flowStatus: PaymentFlowStatus = payment
    ? paymentFlowFromRecord(payment, order)
    : "pending";

  const displayStatus: PaymentFlowStatus =
    flowStatus === "paid" ? "paid" : "pending";

  useEffect(() => {
    if (started.current || !targetPaymentId) return;
    started.current = true;
    void refreshStatus(targetPaymentId, true);
  }, [targetPaymentId]);

  async function refreshStatus(paymentId: string, silent = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPlatform<RefreshResult>(
        "refreshLessonOrderPayment",
        { paymentId }
      );
      await reload();
      if (res.confirmed) {
        toast.success("Оплата подтверждена");
        setRefreshNote(null);
      } else {
        const note =
          res.status === "paid"
            ? "Статус обновлён, ожидаем зачисления."
            : "Платёж ещё не подтверждён банком.";
        setRefreshNote(note);
        if (!silent) toast.message(note);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось обновить статус";
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <PaymentStatusCard
        leading={<CheckoutStepper status={displayStatus} hasTariff />}
        status={displayStatus}
        tariffName={order?.tariffNameSnapshot}
        detail={
          displayStatus === "paid"
            ? order
              ? `${lessonsCountLabel(order.lessonsCount)} · ${order.totalAmount.toLocaleString("ru-RU")} ₽`
              : null
            : [RETURN_NOT_PAID_HINT, refreshNote, error]
                .filter(Boolean)
                .join(" ") || RETURN_NOT_PAID_HINT
        }
      />

      {targetPaymentId ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshStatus(targetPaymentId)}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-pastel-blue/75 px-5 text-sm font-medium sm:w-auto"
        >
          <RefreshCw className="size-4" aria-hidden />
          {busy ? "Проверяем…" : "Обновить статус оплаты"}
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Не найден активный платёж. Если вы только что оплатили, вернитесь к
          разделу «Оплата» и проверьте историю заказов.
        </p>
      )}

      <Link href={STUDENT_PAY_PATH} className="inline-flex text-sm hover:underline">
        ← К разделу «Оплата»
      </Link>
    </div>
  );
}