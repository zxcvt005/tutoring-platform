"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  CheckoutStepper,
  PaymentStatusCard,
} from "@/components/auditoria/payment-flow-view";
import {
  MANUAL_REVIEW_WARNING,
  paymentFlowStatus,
  STUDENT_PAY_PATH,
  TOCHKA_CHECKOUT_URL,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

type CheckoutResponse = {
  paymentId: string;
  alreadyPending: boolean;
  status: string;
  checkoutUrl?: string;
  message?: string;
  tariff?: { name: string; price: number; lessonsLimit: number | null };
};

export function PaymentCompletePanel() {
  const { reload } = useDemoStore();
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await apiPlatform<CheckoutResponse>("studentStartCheckout", {});
        setResult(res);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось сохранить заявку");
      }
    })();
  }, [reload]);

  const status: PaymentFlowStatus = result
    ? paymentFlowStatus(result.status)
    : "none";
  const checkoutUrl = result?.checkoutUrl?.trim() || TOCHKA_CHECKOUT_URL;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      {error ? (
        <PaymentStatusCard
          status="failed"
          detail={error}
          leading={<CheckoutStepper status="failed" hasTariff />}
        />
      ) : !result ? (
        <section className="auditoria-home-card">
          <CheckoutStepper status="pending" hasTariff />
          <p className="mt-4 text-sm text-muted-foreground">Сохраняем заявку…</p>
        </section>
      ) : (
        <>
          <PaymentStatusCard
            leading={
              <CheckoutStepper
                status={status === "none" ? "pending" : status}
                hasTariff
              />
            }
            status={status === "none" ? "pending" : status}
            tariffName={result.tariff?.name}
            detail={
              status === "paid"
                ? [
                    result.tariff
                      ? `${result.tariff.price.toLocaleString("ru-RU")} ₽`
                      : null,
                    result.tariff?.lessonsLimit != null
                      ? `${result.tariff.lessonsLimit} занятий`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null
                : result.message || MANUAL_REVIEW_WARNING
            }
          />
          {status === "pending" || status === "none" ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#e7dff6]/95 px-5 text-base font-medium sm:w-auto"
            >
              <CreditCard className="size-4 shrink-0" aria-hidden />
              Оплата на странице школы
            </a>
          ) : null}
        </>
      )}

      <Link href={STUDENT_PAY_PATH} className="inline-flex text-sm hover:underline">
        ← К разделу «Оплата»
      </Link>
    </div>
  );
}
