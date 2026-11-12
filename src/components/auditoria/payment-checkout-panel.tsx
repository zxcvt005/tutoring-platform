"use client";

import Image from "next/image";
import {
  CreditCard,
  FileCheck,
  MessageCircle,
  MousePointerClick,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PaymentStatusCard } from "@/components/auditoria/payment-flow-view";
import { requestOpenTeacherChat } from "@/lib/chat/student-teacher-chat";
import { formatDate } from "@/lib/format";
import {
  CHANGE_TARIFF_HINT,
  checkoutBannerPayment,
  checkoutBannerStatus,
  TOCHKA_CHECKOUT_URL,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { PaymentRecord, Tariff } from "@/lib/types";

type CheckoutResponse = {
  paymentId: string;
  alreadyPending: boolean;
  checkoutUrl: string;
  returnPath: string;
  message?: string;
  status?: string;
};

const PROCESS_STEPS = [
  {
    icon: MousePointerClick,
    title: "Нажмите кнопку оплаты",
    text: "Одним действием запустите оплату выбранного тарифа.",
  },
  {
    icon: FileCheck,
    title: "Мы создадим заявку",
    text: "Заявка появится в системе автоматически.",
  },
  {
    icon: CreditCard,
    title: "Перейдите к оплате",
    text: "Откроется защищённая страница оплаты школы.",
  },
] as const;

const GUIDE_STEPS = [
  {
    title: "Перейдите к оплате",
    text: "Нажмите кнопку. Мы автоматически создадим заявку.",
  },
  {
    title: "Оплатите обучение",
    text: "Вы попадёте на страницу оплаты школы. При необходимости укажите ФИО ученика.",
  },
  {
    title: "Дождитесь подтверждения",
    text: "Директор подтвердит поступление средств, после чего тариф активируется.",
  },
] as const;

export function PaymentCheckoutPanel() {
  const { data, ready } = useDemoStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const studentId = data.currentStudentId;
  const student = data.students.find((item) => item.id === studentId) ?? null;
  const teacher =
    data.teachers.find((item) => item.id === student?.teacherId) ?? null;

  const purchaseTariff = useMemo(() => {
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
  }, [
    data.tariffs,
    data.tariffAssignments,
    student?.purchaseTariffId,
    studentId,
  ]);

  const flowStatus: PaymentFlowStatus = useMemo(
    () =>
      checkoutBannerStatus(data.payments, data.tariffAssignments, studentId),
    [data.payments, data.tariffAssignments, studentId]
  );

  const activePayment = useMemo(
    () =>
      checkoutBannerPayment(data.payments, data.tariffAssignments, studentId),
    [data.payments, data.tariffAssignments, studentId]
  );

  const linkedAssignment = activePayment
    ? (data.tariffAssignments.find(
        (assignment) => assignment.id === activePayment.assignmentId
      ) ?? null)
    : null;
  const charge = chargeForCheckout(
    purchaseTariff,
    data.tariffAssignments,
    studentId
  );

  async function goToSchoolPayment() {
    if (inflight.current) return;
    if (!purchaseTariff) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPlatform<CheckoutResponse>("studentStartCheckout", {});
      const checkoutUrl = res.checkoutUrl?.trim() || TOCHKA_CHECKOUT_URL;
      if (!checkoutUrl) {
        throw new Error("Ссылка на оплату школы недоступна. Попробуйте ещё раз.");
      }
      if (res.alreadyPending) {
        toast.message(res.message || "Заявка уже создана — открываем оплату");
      }
      window.location.assign(checkoutUrl);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось создать заявку на оплату";
      setError(message);
      toast.error(message);
      inflight.current = false;
      setBusy(false);
    }
  }

  if (!ready) return null;

  const canPay = Boolean(purchaseTariff);
  const buttonLabel = busy
    ? "Создаём заявку…"
    : flowStatus === "pending"
      ? "Перейти к оплате"
      : "Оплата на странице школы";

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.7fr)] xl:items-start">
        <div className="min-w-0 space-y-4">
          {purchaseTariff ? (
            <>
              <section className="auditoria-home-card min-w-0">
                <ol className="grid gap-3 sm:grid-cols-3">
                  {PROCESS_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <li
                        key={step.title}
                        className="rounded-2xl border border-black/10 bg-auditoria-surface p-3.5"
                      >
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-pastel-blue/80">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Шаг {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-snug">
                          {step.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {step.text}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="auditoria-home-card min-w-0">
                <span className="inline-flex rounded-full bg-pastel-blue/80 px-2.5 py-1 text-xs">
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

                <div className="mt-5 grid gap-3 rounded-2xl border border-black/10 bg-auditoria-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-xs text-muted-foreground">Срок и занятия</p>
                    <p className="mt-1 text-sm font-medium">
                      {periodLabel(purchaseTariff)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">Стоимость</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                      {charge.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canPay || busy}
                  onClick={() => void goToSchoolPayment()}
                  className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#e7dff6]/95 px-5 text-base font-medium disabled:opacity-60"
                >
                  <CreditCard className="size-4 shrink-0" aria-hidden />
                  {buttonLabel}
                </button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Заявка создастся автоматически
                </p>
                {error ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <p className="mt-4 inline-flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Оплата проходит на защищённой странице школы. Тариф включится
                  только после подтверждения поступления директором.
                </p>
              </section>
            </>
          ) : (
            <section className="auditoria-home-card">
              <h2 className="font-display text-2xl font-semibold">
                Тариф для оплаты не назначен
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Администрация ещё не указала тариф, который можно оплатить.
                Обратитесь к куратору.
              </p>
            </section>
          )}

          <PaymentStatusCard
            status={flowStatus}
            tariffName={linkedAssignment?.tariffName ?? purchaseTariff?.name}
            queued={linkedAssignment?.status === "queued"}
            detail={
              flowStatus === "paid"
                ? activationDetail(activePayment, linkedAssignment)
                : activePayment?.failureReason
            }
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="auditoria-home-card min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Как проходит оплата?
            </h2>
            <ol className="mt-4 space-y-4">
              {GUIDE_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-pastel-blue/80 text-xs font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
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

          <section className="auditoria-home-card min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Есть вопросы?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Напишите преподавателю — поможем с оплатой и тарифом.
            </p>
            {teacher ? (
              <button
                type="button"
                onClick={() => requestOpenTeacherChat(teacher.id)}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-pastel-blue/75 px-4 text-sm"
              >
                <MessageCircle className="size-4" aria-hidden />
                Написать
              </button>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {CHANGE_TARIFF_HINT}
              </p>
            )}
          </section>
        </aside>
      </div>

      <p className="text-sm text-muted-foreground">{CHANGE_TARIFF_HINT}</p>
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
