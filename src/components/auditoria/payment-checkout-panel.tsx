"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CheckoutStepper,
  PaymentStatusCard,
} from "@/components/auditoria/payment-flow-view";
import {
  CHANGE_TARIFF_HINT,
  paymentFlowStatus,
  STUDENT_CHECKOUT_RETURN_PATH,
  STUDENT_PAY_PATH,
  TOCHKA_CHECKOUT_URL,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { formatDate } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import { apiPlatform } from "@/lib/store/api-client";
import type { PaymentRecord, Tariff } from "@/lib/types";

type CheckoutResponse = {
  paymentId: string;
  alreadyPending: boolean;
  checkoutUrl: string;
  returnPath: string;
  message?: string;
  status?: string;
};

export function PaymentCheckoutPanel() {
  const { data, ready } = useDemoStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const studentId = data.currentStudentId;

  const purchaseTariff = useMemo(() => {
    const student = data.students.find((s) => s.id === studentId);
    const tariffId = student?.purchaseTariffId;
    if (tariffId) {
      return data.tariffs.find((t) => t.id === tariffId) ?? null;
    }
    const latest = [...data.tariffAssignments]
      .filter((a) => a.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )[0];
    return latest
      ? (data.tariffs.find((t) => t.id === latest.tariffId) ?? null)
      : null;
  }, [data.students, data.tariffs, data.tariffAssignments, studentId]);

  const latestPayment = useMemo(() => {
    return (
      [...data.payments]
        .filter((payment) => payment.studentId === studentId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0] ?? null
    );
  }, [data.payments, studentId]);

  const flowStatus: PaymentFlowStatus = paymentFlowStatus(latestPayment?.status);
  const linkedAssignment = latestPayment
    ? (data.tariffAssignments.find(
        (assignment) => assignment.id === latestPayment.assignmentId
      ) ?? null)
    : null;
  const charge = chargeForCheckout(purchaseTariff, data.tariffAssignments, studentId);

  async function goToPay() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPlatform<CheckoutResponse>("studentStartCheckout", {});
      if (res.alreadyPending) {
        toast.message(res.message || "Заявка уже на проверке");
      }
      window.location.href = res.returnPath || STUDENT_CHECKOUT_RETURN_PATH;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось отправить заявку";
      setError(message);
      toast.error(message);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  if (!ready) return null;

  const canStart = Boolean(purchaseTariff) && flowStatus !== "pending";

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.75fr)]">
        {purchaseTariff ? (
          <section className="auditoria-home-card min-w-0">
            <CheckoutStepper status={flowStatus} hasTariff />
            <span className="mt-4 inline-flex rounded-full bg-pastel-blue/80 px-2.5 py-1 text-xs">
              Продление обучения
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight break-words">
              {purchaseTariff.name}
            </h2>
            {purchaseTariff.includesText ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
                {purchaseTariff.includesText}
              </p>
            ) : null}
            <TariffFacts tariff={purchaseTariff} />
            <div className="mt-5 grid gap-3 rounded-2xl border border-black/10 bg-auditoria-surface p-4 sm:grid-cols-2 sm:items-end">
              <div>
                <p className="text-xs text-muted-foreground">Продление на</p>
                <p className="mt-1 text-sm font-medium">{periodLabel(purchaseTariff)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Стоимость</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {charge.toLocaleString("ru-RU")} ₽
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!canStart || busy}
              onClick={() => void goToPay()}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#e7dff6]/90 px-4 text-sm disabled:opacity-60"
            >
              {busy
                ? "Отправляем заявку…"
                : flowStatus === "pending"
                  ? "Заявка уже на проверке"
                  : "Отправить заявку на проверку"}
            </button>
            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Заявка не означает, что оплата прошла. Тариф включится только после
              того, как директор подтвердит поступление.
            </p>
            <a
              href={TOCHKA_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex text-sm underline-offset-4 hover:underline"
            >
              Страница оплаты школы
            </a>
          </section>
        ) : (
          <section className="auditoria-home-card">
            <CheckoutStepper status={flowStatus} hasTariff={false} />
            <h2 className="mt-4 font-display text-2xl font-semibold">
              Тариф для оплаты не назначен
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Администрация ещё не указала тариф, который можно оплатить.
              Обратитесь к куратору.
            </p>
          </section>
        )}

        <section className="auditoria-home-card min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Как проходит оплата?
          </h2>
          <ol className="mt-4 space-y-3 text-sm">
            {[
              "Нажмите «Отправить заявку на проверку». Статус останется «ожидает подтверждения».",
              "Если платите через страницу школы, укажите там ФИО ученика. Сайт не получает ответ банка.",
              "Директор вручную отмечает поступление в разделе доходов.",
              "Только после этого тариф активируется.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-pastel-blue/80 text-xs">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-2xl border border-black/10 bg-auditoria-surface p-3">
            <p className="text-sm font-medium">Куда вводить ФИО?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              На странице банка укажите ФИО ученика.
            </p>
            <Image
              src="/images/payment-student-name-hint.png"
              alt="Подсказка: в поле ФИО на странице оплаты необходимо указать ФИО ученика"
              width={1381}
              height={1139}
              sizes="(max-width: 640px) 100vw, 320px"
              className="mt-3 h-auto w-full rounded-xl"
              unoptimized
            />
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-black/10 bg-[#e7e4f6]/70 px-5 py-4">
        <p className="font-display text-lg font-semibold">
          Тариф активируется после подтверждения оплаты
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Обычно это занимает несколько минут.
        </p>
      </section>

      <PaymentStatusCard
        status={flowStatus}
        tariffName={linkedAssignment?.tariffName ?? purchaseTariff?.name}
        queued={linkedAssignment?.status === "queued"}
        detail={
          flowStatus === "paid"
            ? activationDetail(latestPayment, linkedAssignment)
            : latestPayment?.failureReason
        }
      />

      <p className="text-sm text-muted-foreground">{CHANGE_TARIFF_HINT}</p>
      <Link href={STUDENT_PAY_PATH} className="inline-flex text-sm hover:underline">
        ← К истории оплаты
      </Link>
    </div>
  );
}

function TariffFacts({ tariff }: { tariff: Tariff }) {
  const facts = [
    tariff.lessonsLimit != null ? `${tariff.lessonsLimit} занятий` : null,
    tariff.durationDays > 0 ? `${tariff.durationDays} дней` : null,
    tariff.weeklyFrequency > 0 ? `${tariff.weeklyFrequency} в неделю` : null,
  ].filter((item): item is string => Boolean(item));
  if (facts.length === 0) return null;
  return <p className="mt-4 text-sm text-muted-foreground">{facts.join(" · ")}</p>;
}

function periodLabel(tariff: Tariff): string {
  const parts = [
    tariff.durationDays > 0 ? `${tariff.durationDays} дн.` : null,
    tariff.lessonsLimit != null ? `${tariff.lessonsLimit} занятий` : null,
  ].filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(" · ") : "Один назначенный период";
}

function chargeForCheckout(
  tariff: Tariff | null,
  assignments: {
    studentId: string;
    status: string;
    paymentStatus: string;
    priceSnapshot: number;
  }[],
  studentId: string
): number {
  const unpaid = assignments.find(
    (assignment) =>
      assignment.studentId === studentId &&
      assignment.status === "pending_payment" &&
      assignment.paymentStatus === "unpaid"
  );
  if (unpaid) return unpaid.priceSnapshot;
  return tariff?.price ?? 0;
}

function activationDetail(
  payment: PaymentRecord | null,
  assignment: { endsAt?: string; status?: string } | null
): string | null {
  if (!payment || payment.status !== "paid" || !assignment?.endsAt) return null;
  return `Действует до ${formatDate(assignment.endsAt)}.`;
}
