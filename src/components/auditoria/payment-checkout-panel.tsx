"use client";

import { CreditCard, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PaymentStatusCard } from "@/components/auditoria/payment-flow-view";
import { YandexBrowserPayNotice } from "@/components/auditoria/yandex-browser-pay-notice";
import {
  emptyFormConsentState,
  FormConsentFields,
  validateRequiredFormConsents,
  type FormConsentState,
} from "@/components/legal/form-consent-fields";
import { detectYandexBrowserFromWindow } from "@/lib/browser/yandex-browser";
import { requestOpenTeacherChat } from "@/lib/chat/student-teacher-chat";
import { isPublicOfferPublished } from "@/lib/legal/documents";
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
import {
  assignBankCheckoutUrl,
  openBankCheckoutUrl,
} from "@/lib/payment-checkout-navigate";
import {
  loadStudentCheckoutPrefs,
  resolveCheckoutDirectionId,
  resolveCheckoutSelection,
  saveStudentCheckoutPrefs,
  type StudentCheckoutPrefs,
} from "@/lib/payment-checkout-prefs";
import { lessonsCountLabel } from "@/lib/ru-plural";
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
  const [hydrated, setHydrated] = useState(false);
  const [consents, setConsents] = useState<FormConsentState>(emptyFormConsentState);
  const [consentErrors, setConsentErrors] = useState<
    Partial<Record<keyof FormConsentState, string>>
  >({});
  /** Свежая ссылка банка после createLessonCheckout — для ручного перехода без about:blank. */
  const [manualPayUrl, setManualPayUrl] = useState<string | null>(null);
  /**
   * null до клиентского определения: кнопку оплаты не показываем,
   * пока нет надёжного сигнала Яндекс Браузера.
   */
  const [yandexBrowser, setYandexBrowser] = useState<boolean | null>(null);
  const inflight = useRef(false);
  const offerAvailable = isPublicOfferPublished();
  const paymentAllowed = yandexBrowser === true;

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
  const selectionRef = useRef({ tariffId: "", optionId: "" });
  selectionRef.current = { tariffId, optionId };

  const assignedTariffId = student?.assignedTariffId?.trim() || null;
  const assignedTariff = useMemo(() => {
    if (!assignedTariffId) return null;
    return (
      data.tariffs.find(
        (t) =>
          t.id === assignedTariffId &&
          t.status === "active" &&
          (t.purchaseOptions ?? []).some((o) => o.isActive)
      ) ?? null
    );
  }, [assignedTariffId, data.tariffs]);

  const assignmentUnavailable = Boolean(assignedTariffId) && !assignedTariff;
  const catalogLocked = Boolean(assignedTariff);

  const activeDirections = useMemo(() => {
    const all = directions.filter((d) => d.status === "active");
    if (!assignedTariff) return all;
    return all.filter((d) => d.id === assignedTariff.directionId);
  }, [directions, assignedTariff]);

  const tariffsInDirection = useMemo(() => {
    if (assignedTariff) return [assignedTariff];
    return data.tariffs
      .filter(
        (t) =>
          t.status === "active" &&
          t.directionId === directionId &&
          (t.purchaseOptions ?? []).some((o) => o.isActive)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [assignedTariff, data.tariffs, directionId]);

  const selectedTariff = useMemo(
    () =>
      assignedTariff ??
      tariffsInDirection.find((t) => t.id === tariffId) ??
      tariffsInDirection[0] ??
      null,
    [assignedTariff, tariffsInDirection, tariffId]
  );

  const options = useMemo(() => {
    const list = (selectedTariff?.purchaseOptions ?? []).filter(
      (o) => o.isActive
    );
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [selectedTariff]);

  const selectedOption = useMemo(
    () =>
      options.find((o) => o.id === optionId) ?? options[0] ?? null,
    [options, optionId]
  );

  useEffect(() => {
    setYandexBrowser(detectYandexBrowserFromWindow());
  }, []);

  useEffect(() => {
    if (!ready || !studentId || hydrated) return;

    const prefs = loadStudentCheckoutPrefs(studentId);
    if (assignedTariff) {
      setDirectionId(assignedTariff.directionId);
      const resolved = resolveCheckoutSelection({
        tariffs: [assignedTariff],
        preferred: prefs.byDirection[assignedTariff.directionId] ?? null,
      });
      setTariffId(assignedTariff.id);
      setOptionId(resolved?.optionId ?? "");
      setHydrated(true);
      return;
    }

    const dirId = resolveCheckoutDirectionId(
      activeDirections.map((d) => d.id),
      prefs.lastDirectionId
    );
    setDirectionId(dirId);

    const tariffs = data.tariffs.filter(
      (t) =>
        t.status === "active" &&
        t.directionId === dirId &&
        (t.purchaseOptions ?? []).some((o) => o.isActive)
    );
    const resolved = resolveCheckoutSelection({
      tariffs,
      preferred: dirId ? prefs.byDirection[dirId] ?? null : null,
    });
    setTariffId(resolved?.tariffId ?? "");
    setOptionId(resolved?.optionId ?? "");
    setHydrated(true);
  }, [
    ready,
    studentId,
    hydrated,
    activeDirections,
    assignedTariff,
    data.tariffs,
  ]);

  // Если каталог обновился и текущий выбор недоступен — подставить актуальный.
  useEffect(() => {
    if (!hydrated) return;
    if (assignedTariff) {
      if (directionId !== assignedTariff.directionId) {
        setDirectionId(assignedTariff.directionId);
      }
      const current = selectionRef.current;
      const resolved = resolveCheckoutSelection({
        tariffs: [assignedTariff],
        preferred:
          current.tariffId && current.optionId
            ? { tariffId: current.tariffId, optionId: current.optionId }
            : null,
      });
      setTariffId(assignedTariff.id);
      setOptionId(resolved?.optionId ?? "");
      return;
    }
    if (!directionId) return;
    const current = selectionRef.current;
    const resolved = resolveCheckoutSelection({
      tariffs: tariffsInDirection,
      preferred:
        current.tariffId && current.optionId
          ? { tariffId: current.tariffId, optionId: current.optionId }
          : null,
    });
    if (!resolved) {
      if (current.tariffId || current.optionId) {
        setTariffId("");
        setOptionId("");
      }
      return;
    }
    if (
      resolved.tariffId !== current.tariffId ||
      resolved.optionId !== current.optionId
    ) {
      setTariffId(resolved.tariffId);
      setOptionId(resolved.optionId);
    }
  }, [hydrated, directionId, tariffsInDirection, assignedTariff]);

  useEffect(() => {
    if (!hydrated || !studentId) return;
    if (!directionId || !tariffId || !optionId) return;

    const prev = loadStudentCheckoutPrefs(studentId);
    const next: StudentCheckoutPrefs = {
      lastDirectionId: directionId,
      byDirection: {
        ...prev.byDirection,
        [directionId]: { tariffId, optionId },
      },
    };
    saveStudentCheckoutPrefs(studentId, next);
  }, [hydrated, studentId, directionId, tariffId, optionId]);

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

  function selectDirection(id: string) {
    setDirectionId(id);
    const prefs = loadStudentCheckoutPrefs(studentId);
    const tariffs = data.tariffs.filter(
      (t) =>
        t.status === "active" &&
        t.directionId === id &&
        (t.purchaseOptions ?? []).some((o) => o.isActive)
    );
    const resolved = resolveCheckoutSelection({
      tariffs,
      preferred: prefs.byDirection[id] ?? null,
    });
    setTariffId(resolved?.tariffId ?? "");
    setOptionId(resolved?.optionId ?? "");
  }

  function selectTariff(id: string) {
    setTariffId(id);
    const tariff = data.tariffs.find((t) => t.id === id);
    const activeOptions = [...(tariff?.purchaseOptions ?? [])]
      .filter((o) => o.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const prefs = loadStudentCheckoutPrefs(studentId);
    const preferredOptionId =
      directionId && prefs.byDirection[directionId]?.tariffId === id
        ? prefs.byDirection[directionId]?.optionId
        : undefined;
    const option =
      activeOptions.find((o) => o.id === preferredOptionId) ??
      activeOptions[0] ??
      null;
    setOptionId(option?.id ?? "");
  }

  async function goToSchoolPayment() {
    if (inflight.current) return;
    if (!paymentAllowed) {
      toast.message("Оплата доступна только в Яндекс Браузере");
      return;
    }
    const tId = selectedTariff?.id ?? tariffId;
    const oId = selectedOption?.id ?? optionId;
    if (!tId || !oId) {
      toast.error("Выберите тариф и вариант покупки");
      return;
    }
    const nextConsentErrors = validateRequiredFormConsents(consents, {
      requireOffer: offerAvailable,
    });
    setConsentErrors(nextConsentErrors);
    if (Object.keys(nextConsentErrors).length > 0) {
      toast.error("Подтвердите обязательные согласия перед оплатой");
      return;
    }
    inflight.current = true;
    setBusy(true);
    setError(null);
    setManualPayUrl(null);
    try {
      const res = await apiPlatform<CheckoutResponse>("createLessonCheckout", {
        tariffId: tId,
        optionId: oId,
        personalDataConsent: true,
        publicOfferConsent: offerAvailable ? consents.publicOffer : undefined,
        marketingConsent: consents.marketing,
      });
      const checkoutUrl = resolveCheckoutUrl(res.checkoutUrl);
      if (!checkoutUrl || !/^https:\/\//i.test(checkoutUrl)) {
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

      // Не открываем about:blank до ответа API и не вызываем window.close.
      // После await popup часто блокируется — тогда остаётся явная ссылка.
      const opened = openBankCheckoutUrl(checkoutUrl, { preferred: "new-tab" });
      setManualPayUrl(checkoutUrl);
      if (opened.ok && opened.method === "new-tab") {
        toast.message("Страница оплаты открыта в новой вкладке");
      } else if (!opened.ok && opened.reason === "popup_blocked") {
        toast.message(
          "Браузер заблокировал новое окно — нажмите «Открыть страницу оплаты»"
        );
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось создать заказ";
      setError(message);
      toast.error(message);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function openPayInSameTab() {
    if (!manualPayUrl) return;
    const result = assignBankCheckoutUrl(manualPayUrl);
    if (!result.ok) {
      toast.error("Некорректная ссылка оплаты");
    }
  }

  if (!ready) return null;

  const canPay = Boolean(selectedTariff && selectedOption);
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
              {catalogLocked
                ? "Вам назначен тариф — выберите удобный пакет занятий. Оплата проходит на защищённой странице школы."
                : "Выберите направление, тариф и пакет занятий. Оплата проходит на защищённой странице школы."}
            </p>

            {assignmentUnavailable ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Назначенный тариф недоступен. Обратитесь к куратору.
              </p>
            ) : activeDirections.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Тарифы пока не опубликованы. Обратитесь к куратору.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {catalogLocked ? (
                  <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3">
                    <p className="text-xs text-muted-foreground">Ваш тариф</p>
                    <p className="mt-1 font-medium">
                      {selectedTariff?.name ?? "—"}
                    </p>
                    {activeDirections[0]?.name ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {activeDirections[0].name}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <CatalogPick
                      label="Направление"
                      value={directionId}
                      options={activeDirections.map((d) => ({
                        id: d.id,
                        label: d.name,
                      }))}
                      onChange={selectDirection}
                    />
                    <CatalogPick
                      label="Тариф"
                      value={selectedTariff?.id ?? ""}
                      options={tariffsInDirection.map((t) => ({
                        id: t.id,
                        label: t.name,
                      }))}
                      onChange={selectTariff}
                      emptyHint={
                        tariffsInDirection.length === 0
                          ? "Нет тарифов в этом направлении"
                          : undefined
                      }
                    />
                  </>
                )}
                <OptionGrid
                  options={options}
                  value={selectedOption?.id ?? ""}
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
                      {lessons > 0 ? lessonsCountLabel(lessons) : "—"}
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

                {paymentAllowed ? (
                  <>
                    <FormConsentFields
                      idPrefix="checkout"
                      value={consents}
                      onChange={(next) => {
                        setConsents(next);
                        setConsentErrors({});
                      }}
                      showMarketing
                      showPublicOffer={offerAvailable}
                      publicOfferAvailable={offerAvailable}
                      errors={consentErrors}
                    />
                    <button
                      type="button"
                      disabled={!canPay || busy}
                      onClick={() => void goToSchoolPayment()}
                      data-testid="checkout-pay-button"
                      className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#e7dff6]/95 px-5 text-base font-medium disabled:opacity-60"
                    >
                      <CreditCard className="size-4 shrink-0" aria-hidden />
                      {busy ? "Создаём заказ…" : "Перейти к оплате"}
                    </button>
                    {manualPayUrl ? (
                      <div
                        className="rounded-2xl border border-black/10 bg-auditoria-surface p-4"
                        data-testid="checkout-pay-fallback"
                      >
                        <p className="text-sm font-medium">
                          Ссылка на оплату готова
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Если окно банка не открылось или сразу закрылось,
                          перейдите по кнопке ниже. Страница оплаты Точки
                          останется открытой — мы её не закрываем.
                        </p>
                        <a
                          href={manualPayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="checkout-pay-link"
                          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#e7dff6]/95 px-4 text-sm font-medium"
                        >
                          Открыть страницу оплаты
                        </a>
                        <button
                          type="button"
                          onClick={openPayInSameTab}
                          className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-black/10 px-4 text-sm"
                        >
                          Открыть в этой вкладке
                        </button>
                      </div>
                    ) : null}
                    {error ? (
                      <p className="text-sm text-destructive" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <ShieldCheck
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden
                      />
                      Возврат со страницы банка не означает успешную оплату.
                      Занятия зачислятся после подтверждения платежа.
                    </p>
                  </>
                ) : yandexBrowser === false ? (
                  <YandexBrowserPayNotice className="mt-1" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Проверяем браузер…
                  </p>
                )}
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
              {lessonsCountLabel(b.balance)}
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
                  {lessonsCountLabel(o.lessonsCount)}
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
