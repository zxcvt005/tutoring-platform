import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Clock, X } from "lucide-react";

import {
  checkoutSteps,
  STUDENT_PAY_PATH,
  type CheckoutStepState,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Выбор тарифа", "Оплата", "Подтверждение"] as const;

export function CheckoutStepper({
  status,
  hasTariff,
}: {
  status: PaymentFlowStatus;
  hasTariff: boolean;
}) {
  const steps = checkoutSteps(status, hasTariff);
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {steps.map((state, index) => (
        <li key={STEP_LABELS[index]} className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <StepMark index={index + 1} state={state} />
            <span
              className={cn(
                "text-sm",
                state === "todo" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {STEP_LABELS[index]}
            </span>
          </span>
          {index < steps.length - 1 ? (
            <span className="hidden h-px w-8 bg-black/15 sm:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function StepMark({ index, state }: { index: number; state: CheckoutStepState }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
        state === "done" && "bg-pastel-mint/90",
        state === "current" && "bg-pastel-blue/90",
        state === "failed" && "bg-pastel-rose/90",
        state === "todo" && "bg-auditoria-surface text-muted-foreground"
      )}
    >
      {state === "done" ? (
        <Check className="size-3.5" />
      ) : state === "failed" ? (
        <X className="size-3.5" />
      ) : (
        index
      )}
    </span>
  );
}

export function PaymentStatusCard({
  status,
  tariffName,
  detail,
  queued,
  leading,
}: {
  status: PaymentFlowStatus;
  tariffName?: string | null;
  detail?: string | null;
  queued?: boolean;
  leading?: ReactNode;
}) {
  if (status === "none") return null;
  if (status === "pending") {
    return (
      <section className="rounded-3xl border border-black/10 bg-pastel-beige/75 p-5">
        {leading}
        <p className={cn("flex items-center gap-2 font-display text-lg font-semibold", leading && "mt-4")}>
          <Clock className="size-4" />
          Оплата ожидает подтверждения
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
          Мы получили вашу заявку и проверяем поступление. Обычно это занимает
          несколько минут. Переход на страницу банка ещё не означает, что тариф
          активирован.
        </p>
        {detail ? (
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        ) : null}
      </section>
    );
  }
  if (status === "paid" && queued) {
    return (
      <section className="rounded-3xl border border-black/10 bg-pastel-mint/75 p-5">
        {leading}
        <p className={cn("flex items-center gap-2 font-display text-lg font-semibold", leading && "mt-4")}>
          <Check className="size-4" />
          Оплата подтверждена
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
          Тариф «{tariffName || "Тариф"}» оплачен и начнётся, когда закончится
          текущий пакет.
          {detail ? ` ${detail}` : ""}
        </p>
        <StatusLinks />
      </section>
    );
  }
  if (status === "paid") {
    return (
      <section className="rounded-3xl border border-black/10 bg-pastel-mint/75 p-5">
        {leading}
        <p className={cn("flex items-center gap-2 font-display text-lg font-semibold", leading && "mt-4")}>
          <Check className="size-4" />
          Тариф активирован
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
          Оплата подтверждена.
          {tariffName ? ` Тариф «${tariffName}» активирован.` : ""}
          {detail ? ` ${detail}` : ""}
        </p>
        <StatusLinks />
      </section>
    );
  }
  const failedTitle =
    status === "cancelled"
      ? "Оплата отменена"
      : status === "failed"
        ? "Не удалось провести оплату"
        : "Оплата отклонена";
  return (
    <section className="rounded-3xl border border-black/10 bg-pastel-rose/75 p-5">
      {leading}
      <p className={cn("font-display text-lg font-semibold", leading && "mt-4")}>{failedTitle}</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80">
        {detail ||
          "Этот платёж не подтверждён. Его можно отправить ещё раз, когда будете готовы."}
      </p>
    </section>
  );
}

function StatusLinks() {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Link
        href="/auditoria"
        className="inline-flex h-11 items-center justify-center rounded-full bg-[#e7dff6]/90 px-4 text-sm"
      >
        Перейти к обучению →
      </Link>
      <Link
        href={STUDENT_PAY_PATH}
        className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm"
      >
        История тарифов
      </Link>
    </div>
  );
}
