"use client";

import Link from "next/link";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { STUDENT_CHECKOUT_PATH } from "@/lib/payment-checkout";
import {
  assignmentHistoryStatus,
  pendingReviewPaymentForStudent,
  queuedAssignmentForStudent,
  remainingLooksExhausted,
  tariffHistoryStatusLabel,
} from "@/lib/tariff-history";
import {
  currentAssignmentForStudent,
  packageStatusLabel,
  studentTariffLabel,
} from "@/lib/tariff-package";
import { assignmentTariffAlert } from "@/lib/tariff-warnings";
import { useDemoStore } from "@/lib/store/demo-store";
import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import type { StudentTariffAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusLabel(a: StudentTariffAssignment): string {
  if (a.status === "cancelled") return packageStatusLabel.cancelled;
  if (a.status === "paused") return packageStatusLabel.paused;
  return tariffHistoryStatusLabel[assignmentHistoryStatus(a, null)];
}

export function MyTariffBlock({
  studentId,
  compact = false,
  featured = false,
}: {
  studentId: string;
  compact?: boolean;
  featured?: boolean;
}) {
  const { data, ready } = useDemoStore();

  const assignment = useMemo(
    () => currentAssignmentForStudent(data.tariffAssignments, studentId),
    [data.tariffAssignments, studentId]
  );
  const pending = useMemo(
    () => pendingReviewPaymentForStudent(data.payments, studentId),
    [data.payments, studentId]
  );
  const queued = useMemo(
    () => queuedAssignmentForStudent(data.tariffAssignments, studentId),
    [data.tariffAssignments, studentId]
  );
  const purchase = useMemo(
    () =>
      studentTariffLabel({
        assignments: data.tariffAssignments,
        studentId,
        tariffs: data.tariffs,
        purchaseTariffId: data.students.find((s) => s.id === studentId)
          ?.purchaseTariffId,
      }),
    [data.tariffAssignments, data.tariffs, data.students, studentId]
  );

  if (!ready) return null;

  const pad = compact && !featured ? "p-3.5" : "p-5";
  const shell = featured
    ? "auditoria-home-card"
    : `rounded-2xl border border-border/70 bg-auditoria-surface ${pad}`;

  if (!assignment) {
    return (
      <section className={shell}>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Мой тариф
        </h2>
        {purchase ? (
          <>
            <p
              className={
                compact
                  ? "mt-1 font-display text-xl font-semibold tracking-tight"
                  : "mt-2 font-display text-2xl font-semibold tracking-tight"
              }
            >
              {purchase.name}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Тариф назначен. Оплатите его, чтобы активировать пакет занятий.
            </p>
            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
              {packageStatusLabel.unpaid}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Условия обучения пока не настроены. Администратор школы назначит тариф
            — после этого здесь появятся сроки и статус оплаты.
          </p>
        )}
        <Link
          href={STUDENT_CHECKOUT_PATH}
          className={buttonVariants({ className: "mt-3 rounded-xl" })}
        >
          Оплатить
        </Link>
      </section>
    );
  }

  const unpaid =
    assignment.paymentStatus !== "paid" ||
    assignment.status === "pending_payment";
  const alert = assignmentTariffAlert(assignment);
  const displayStatus = assignmentHistoryStatus(assignment, null);
  const exhausted = remainingLooksExhausted(assignment);
  const expiring =
    displayStatus === "current" &&
    assignment.lessonsRemaining != null &&
    assignment.lessonsRemaining > 0 &&
    assignment.lessonsRemaining <= 2;
  const needsAttention =
    exhausted ||
    alert.tone === "warn1" ||
    alert.tone === "warn2" ||
    displayStatus === "review";
  const expired = assignment.status === "cancelled";

  const priceLabel = `${assignment.priceSnapshot.toLocaleString("ru-RU")} ₽`;
  const remainingLabel =
    assignment.lessonsRemaining == null
      ? "—"
      : String(assignment.lessonsRemaining);
  const usedLabel =
    assignment.lessonsUsed == null ? "—" : String(assignment.lessonsUsed);
  const statusClass =
    unpaid || needsAttention || expired
      ? "font-medium text-amber-800"
      : "font-medium text-emerald-800";

  return (
    <section className={shell}>
      <p className="text-sm text-muted-foreground">Мой тариф</p>
      <h2
        className={
          featured
            ? "mt-1 font-display text-2xl font-semibold tracking-tight"
            : compact
              ? "mt-1 font-display text-xl font-semibold tracking-tight"
              : "mt-2 font-display text-2xl font-semibold tracking-tight"
        }
      >
        {assignment.tariffName ?? "Тариф"}
      </h2>
      {featured ? null : (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {priceLabel}
        </p>
      )}
      {assignment.includesText && !compact && !featured ? (
        <p className="mt-3 text-sm leading-relaxed">{assignment.includesText}</p>
      ) : null}
      {featured ? (
        <dl className="mt-4 grid grid-cols-2 gap-y-3 sm:flex sm:flex-wrap">
          <TariffMetric
            label="Стоимость"
            value={priceLabel}
            divider
          />
          <TariffMetric label="Осталось занятий" value={remainingLabel} divider />
          <TariffMetric label="Использовано" value={usedLabel} divider />
          <TariffMetric
            label="Начало"
            value={formatDate(assignment.startsAt)}
            divider
          />
          <TariffMetric
            label="Прогноз окончания"
            value={formatDate(assignment.endsAt)}
          />
        </dl>
      ) : (
        <dl className={`grid gap-2 text-sm sm:grid-cols-2 ${compact ? "mt-2" : "mt-4"}`}>
          <div>
            <dt className="text-muted-foreground">Начало</dt>
            <dd>{formatDate(assignment.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Прогноз окончания</dt>
            <dd>{formatDate(assignment.endsAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Осталось занятий</dt>
            <dd className="tabular-nums">{remainingLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Использовано</dt>
            <dd className="tabular-nums">{usedLabel}</dd>
          </div>
        </dl>
      )}
      <p className={cn("mt-3 text-sm", statusClass)}>
        {statusLabel(assignment)}
        {expiring ? (
          <span className="ml-2 rounded-full border border-amber-400/80 px-2 py-0.5 text-xs">
            Истекает
          </span>
        ) : null}
      </p>
      {exhausted ? null : (
        <TariffBalanceNotice
          remaining={assignment.lessonsRemaining}
          packageStatus={assignment.packageStatus}
          className="mt-3"
        />
      )}
      {queued ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Следующий тариф «{queued.tariffName ?? "Тариф"}» ожидает активации.
        </p>
      ) : null}
      {pending ? (
        <p
          className={
            featured
              ? "mt-3 rounded-2xl bg-pastel-beige px-3 py-2.5 text-sm text-foreground"
              : "mt-3 text-sm font-medium text-amber-800 dark:text-amber-300"
          }
        >
          Оплата на проверке. Дождитесь решения администрации.
        </p>
      ) : alert.showRenewCta || unpaid ? (
        <div className="mt-3">
          <Link
            href={STUDENT_CHECKOUT_PATH}
            className={buttonVariants({
              size: compact && !featured ? "sm" : "default",
              className: featured
                ? "rounded-xl bg-pastel-blue text-foreground hover:bg-pastel-blue/80"
                : "rounded-xl",
            })}
          >
            {alert.tone === "warn1" || alert.tone === "warn2"
              ? "Продлить тариф"
              : "Оплатить"}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function TariffMetric({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 sm:pr-5",
        divider && "sm:mr-5 sm:border-r sm:border-black/10"
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-sm font-semibold tracking-tight tabular-nums sm:text-base">
        {value}
      </dd>
    </div>
  );
}
