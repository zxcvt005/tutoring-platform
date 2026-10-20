"use client";

import { toast } from "sonner";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import { apiPlatform } from "@/lib/store/api-client";
import type { StudentTariffAssignment } from "@/lib/types";

function statusLabel(a: StudentTariffAssignment): string {
  if (a.status === "cancelled") return "Отменён";
  if (a.status === "paused") return "Приостановлен";
  if (a.status === "expired") return "Срок истёк";
  if (a.paymentStatus !== "paid" || a.status === "pending_payment") {
    return "Ожидает оплаты";
  }
  if (new Date(a.endsAt).getTime() < Date.now()) return "Срок истёк";
  return "Оплачен и действует";
}

export function MyTariffBlock({ studentId }: { studentId: string }) {
  const { data, ready } = useDemoStore();
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const assignment = useMemo(() => {
    const list = data.tariffAssignments
      .filter((a) => a.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
    return list[0] ?? null;
  }, [data.tariffAssignments, studentId]);

  async function onPay() {
    if (!assignment) return;
    setBusy(true);
    try {
      const res = await apiPlatform<{
        checkoutUrl: string | null;
        message?: string;
      }>("studentRequestPayment", { assignmentId: assignment.id });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        toast.message(res.message || "Оплата скоро появится");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (!assignment) {
    return (
      <section className="rounded-2xl border border-border/70 p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Мой тариф
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Условия обучения пока не настроены. Администратор школы назначит тариф
          — после этого здесь появятся сроки и статус оплаты.
        </p>
      </section>
    );
  }

  const unpaid =
    assignment.paymentStatus !== "paid" ||
    assignment.status === "pending_payment";
  const expired =
    assignment.status === "expired" ||
    new Date(assignment.endsAt).getTime() < nowMs;

  return (
    <section className="rounded-2xl border border-border/70 p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Мой тариф
      </h2>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {assignment.tariffName ?? "Тариф"}
      </p>
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {assignment.priceSnapshot.toLocaleString("ru-RU")} ₽
      </p>
      {assignment.includesText ? (
        <p className="mt-3 text-sm leading-relaxed">{assignment.includesText}</p>
      ) : null}
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Начало</dt>
          <dd>{formatDate(assignment.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Окончание</dt>
          <dd>{formatDate(assignment.endsAt)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Статус</dt>
          <dd
            className={
              unpaid || expired
                ? "font-medium text-amber-700 dark:text-amber-400"
                : "font-medium text-emerald-700 dark:text-emerald-400"
            }
          >
            {statusLabel(assignment)}
          </dd>
        </div>
      </dl>
      {unpaid && !expired ? (
        <div className="mt-4 space-y-2">
          <Button
            type="button"
            className="rounded-xl"
            style={{ background: "#3166F0" }}
            disabled={busy}
            onClick={() => void onPay()}
          >
            Оплатить
          </Button>
          <p className="text-xs text-muted-foreground">
            Онлайн-оплата через банк скоро появится. Сейчас кнопка сохраняет
            запрос на оплату без подтверждения платежа.
          </p>
        </div>
      ) : null}
      {expired ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Срок действия закончился. Для продления свяжитесь со школой.
        </p>
      ) : null}
    </section>
  );
}
