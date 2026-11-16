"use client";

import { CreditCard, MessageCircle, ShieldCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PaymentStatusCard } from "@/components/auditoria/payment-flow-view";
import { requestOpenTeacherChat } from "@/lib/chat/student-teacher-chat";
import {
  CHANGE_TARIFF_HINT,
  CHECKOUT_PAYMENT_SESSION_KEY,
  checkoutBannerPayment,
  checkoutBannerStatus,
  paymentFlowFromRecord,
  resolveCheckoutUrl,
  unitPriceLabel,
  type PaymentFlowStatus,
} from "@/lib/payment-checkout";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Tariff, TariffPurchaseOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type CheckoutResponse = {
  orderId: string;
  paymentId: string;
  checkoutUrl?: string;
  alreadyPending?: boolean;
  message?: string;
};

export function PaymentCheckoutPanel() {
  const { data, ready } = useDemoStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const studentId = data.currentStudentId;
  const student = data.students.find((item) => item.id === studentId) ?? null;
  const teacher =
    data.teachers.find((item) => item.id === student?.teacherId) ?? null;

  const directions = data.learningDirections ?? [];
  const orders = data.lessonOrders ?? [];
  const payments = data.payments ?? [];

  const [directionId, setDirectionId] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [optionId, setOptionId] = useState("");

  const activeDirections = useMemo(
    () => directions.filter((d) => d.status === "active"),
    [directions]
  );

  const tariffsInDirection = useMemo(() => {
    const dir = directionId || activeDirections[0]?.id || "";
    return data.tariffs
      .filter(
        (t) =>
          t.status === "active" &&
          t.directionId === dir &&
          (t.purchaseOptions ?? []).some((o) => o.isActive)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [data.tariffs, directionId, activeDirections]);

  const selectedTariff = useMemo(
    () => data.tariffs.find((t) => t.id === tariffId) ?? null,
    [data.tariffs, tariffId]
  );

  const options = useMemo(() => {
    const list = (selectedTariff?.purchaseOptions ?? []).filter(
      (o) => o.isActive
    );
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [selectedTariff]);

  const selectedOption = useMemo(
    () => options.find((o) => o.id === optionId) ?? null,
    [options, optionId]
  );

  const effectiveDirectionId =
    directionId || activeDirections[0]?.id || "";
  const effectiveTariffId = tariffId || tariffsInDirection[0]?.id || "";
  const effectiveOptionId = optionId || options[0]?.id || "";

  const flowStatus: PaymentFlowStatus = useMemo(
    () => checkoutBannerStatus(payments, orders, studentId),
    [payments, orders, studentId]
  );

  const bannerPayment = useMemo(
    () => checkoutBannerPayment(payments, orders, studentId),
    [payments, orders, studentId]
  );

  const displayFlow = bannerPayment
    ? paymentFlowFromRecord(
        bannerPayment,
        orders.find((o) => o.id === bannerPayment.orderId) ?? null
      )
    : flowStatus;

  async function goToSchoolPayment() {
    if (inflight.current) return;
    const tId = tariffId || effectiveTariffId;
    const oId = optionId || effectiveOptionId;
    if (!tId || !oId) {
      toast.error("Выберите тариф и вариант покупки");
      return;
    }
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPlatform<CheckoutResponse>("createLessonCheckout", {
        tariffId: tId,
        optionId: oId,
      });
      const checkoutUrl = resolveCheckoutUrl(res.checkoutUrl);
      if (!checkoutUrl) {
        throw new Error("Ссылка на оплату недоступна. Попробуйте позже.");
      }
      if (res.paymentId) {
        try {
          sessionStorage.setItem(
            CHECKOUT_PAYMENT_SESSION_KEY,
            res.paymentId
          );
        } catch {
          // ignore
        }
      }
      if (res.alreadyPending) {
        toast.message(res.message || "Заявка уже создана — открываем оплату");
      }
      window.location.assign(checkoutUrl);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось создать заказ";
      setError(message);
      toast.error(message);
      inflight.current = false;
      setBusy(false);
    }
  }

  if (!ready) return null;

  const canPay = Boolean(
    (tariffId || effectiveTariffId) && (optionId || effectiveOptionId)
  );
  const charge = selectedOption?.totalPrice ?? 0;
  const lessons = selectedOption?.lessonsCount ?? 0;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.7fr)] xl:items-start">
        <div className="min-w-0 space-y-4">
          <section className="auditoria-home-card min-w-0">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Покупка занятий
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Выберите направление, тариф и пакет занятий. Оплата проходит на
              защищённой странице школы.
            </p>

            {activeDirections.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Тарифы пока не опубликованы. Обратитесь к куратору.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                <CatalogPick
                  label="Направление"
                  value={effectiveDirectionId}
                  options={activeDirections.map((d) => ({
                    id: d.id,
                    label: d.name,
                  }))}
                  onChange={(id) => {
                    setDirectionId(id);
                    setTariffId("");
                    setOptionId("");
                  }}
                />
                <CatalogPick
                  label="Тариф"
                  value={effectiveTariffId}
                  options={tariffsInDirection.map((t) => ({
                    id: t.id,
                    label: t.name,
                  }))}
                  onChange={(id) => {
                    setTariffId(id);
                    setOptionId("");
                  }}
                  emptyHint={
                    tariffsInDirection.length === 0
                      ? "Нет тарифов в этом направлении"
                      : undefined
                  }
                />
                <OptionGrid
                  options={options}
                  value={effectiveOptionId}
                  onChange={setOptionId}
                  tariff={selectedTariff}
                />

                {selectedTariff?.includesText ? (
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {selectedTariff.includesText}
                  </p>
                ) : null}

                <div className="grid gap-3 rounded-2xl border border-black/10 bg-auditoria-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-xs text-muted-foreground">Пакет</p>
                    <p className="mt-1 text-sm font-medium">
                      {lessons > 0 ? `${lessons} занятий` : "—"}
                    </p>
                    {lessons > 0 && charge > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {unitPriceLabel(charge, lessons)}
                      </p>
                    ) : null}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">К оплате</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                      {charge.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canPay || busy}
                  onClick={() => void goToSchoolPayment()}
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#e7dff6]/95 px-5 text-base font-medium disabled:opacity-60"
                >
                  <CreditCard className="size-4 shrink-0" aria-hidden />
                  {busy ? "Создаём заказ…" : "Перейти к оплате"}
                </button>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Возврат со страницы банка не означает успешную оплату. Занятия
                  зачислятся после подтверждения платежа.
                </p>
              </div>
            )}
          </section>

          <PaymentStatusCard
            status={displayFlow}
            tariffName={
              orders.find((o) => o.id === bannerPayment?.orderId)
                ?.tariffNameSnapshot
            }
            detail={
              bannerPayment?.failureReason ??
              (displayFlow === "pending"
                ? "Проверяем статус платежа в банке."
                : null)
            }
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <DirectionBalances studentId={studentId} />
          <section className="auditoria-home-card min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Есть вопросы?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Напишите преподавателю — поможем с выбором пакета.
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
    </div>
  );
}

function DirectionBalances({ studentId }: { studentId: string }) {
  const { data } = useDemoStore();
  const student = data.students.find((s) => s.id === studentId);
  const balances = student?.directionBalances ?? [];
  if (balances.length === 0) return null;
  return (
    <section className="auditoria-home-card min-w-0">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Баланс занятий
      </h2>
      <ul className="mt-3 space-y-2">
        {balances.map((b) => (
          <li
            key={b.directionId}
            className="flex items-baseline justify-between gap-2 rounded-xl border border-black/10 bg-auditoria-surface px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              {b.directionName ?? b.directionSlug ?? "Направление"}
            </span>
            <span className="font-display font-semibold tabular-nums">
              {b.balance}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CatalogPick({
  label,
  value,
  options,
  onChange,
  emptyHint,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  emptyHint?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {options.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {emptyHint ?? "Нет вариантов"}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={cn(
                "rounded-full border border-black/10 px-3 py-1.5 text-sm transition-colors",
                value === o.id
                  ? "bg-[#e7dff6]/95 font-medium"
                  : "bg-auditoria-surface hover:bg-pastel-beige/60"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionGrid({
  options,
  value,
  onChange,
  tariff,
}: {
  options: TariffPurchaseOption[];
  value: string;
  onChange: (id: string) => void;
  tariff: Tariff | null;
}) {
  if (!tariff) return null;
  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        У тарифа нет активных вариантов покупки.
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs text-muted-foreground">Вариант покупки</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange(o.id)}
                className={cn(
                  "flex w-full flex-col rounded-2xl border border-black/10 px-3 py-3 text-left",
                  active
                    ? "bg-pastel-mint/75 ring-1 ring-black/10"
                    : "bg-auditoria-surface hover:bg-pastel-beige/50"
                )}
              >
                <span className="font-medium tabular-nums">
                  {o.lessonsCount} занятий
                </span>
                <span className="mt-1 font-display text-xl font-semibold tabular-nums">
                  {o.totalPrice.toLocaleString("ru-RU")} ₽
                </span>
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {unitPriceLabel(o.totalPrice, o.lessonsCount)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
