"use client";

import Link from "next/link";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button";
import { TariffBalanceNotice } from "@/components/tariff-balance-notice";
import { STUDENT_CHECKOUT_PATH } from "@/lib/payment-checkout";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import type { StudentDirectionBalance } from "@/lib/types";
import { cn } from "@/lib/utils";

function packageStatusFromBalance(
  balance: number | null
): "active" | "exhausted" | "debt" | "none" {
  if (balance == null) return "none";
  if (balance <= -1) return "debt";
  if (balance <= 0) return "exhausted";
  return "active";
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
  const href = useStudentCabinetHref();
  const checkoutHref = href(STUDENT_CHECKOUT_PATH);

  const balances = useMemo((): StudentDirectionBalance[] => {
    return (
      data.students.find((s) => s.id === studentId)?.directionBalances ?? []
    );
  }, [data.students, studentId]);

  const minBalance = useMemo(() => {
    if (balances.length === 0) return null;
    return Math.min(...balances.map((b) => b.balance));
  }, [balances]);

  const pending = useMemo(
    () =>
      data.payments.find(
        (p) => p.studentId === studentId && p.status === "pending"
      ) ?? null,
    [data.payments, studentId]
  );

  if (!ready) return null;

  const pad = compact && !featured ? "p-3.5" : "p-5";
  const shell = featured
    ? "auditoria-home-card"
    : `rounded-2xl border border-border/70 bg-auditoria-surface ${pad}`;

  return (
    <section className={shell}>
      <p className="text-sm text-muted-foreground">Занятия</p>
      <h2
        className={
          featured
            ? "mt-1 font-display text-2xl font-semibold tracking-tight"
            : compact
              ? "mt-1 font-display text-xl font-semibold tracking-tight"
              : "mt-2 font-display text-2xl font-semibold tracking-tight"
        }
      >
        {balances.length === 1
          ? balances[0].directionName ?? "Направление"
          : "Баланс по направлениям"}
      </h2>

      {balances.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Купите пакет занятий в разделе «Оплата», чтобы начать подготовку.
        </p>
      ) : featured ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {balances.map((b) => (
            <div key={b.directionId} className="min-w-0">
              <dt className="text-xs text-muted-foreground">
                {b.directionName ?? b.directionSlug ?? "Направление"}
              </dt>
              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
                {b.balance}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul className={cn("space-y-1 text-sm", compact ? "mt-2" : "mt-3")}>
          {balances.map((b) => (
            <li
              key={b.directionId}
              className="flex justify-between gap-2 tabular-nums"
            >
              <span className="text-muted-foreground">
                {b.directionName ?? b.directionSlug}
              </span>
              <span className="font-medium">{b.balance}</span>
            </li>
          ))}
        </ul>
      )}

      <TariffBalanceNotice
        remaining={minBalance}
        packageStatus={packageStatusFromBalance(minBalance)}
        className="mt-3"
        compact={compact && !featured}
      />

      {pending ? (
        <p
          className={
            featured
              ? "mt-3 rounded-2xl bg-pastel-beige px-3 py-2.5 text-sm text-foreground"
              : "mt-3 text-sm font-medium text-amber-800 dark:text-amber-300"
          }
        >
          Оплата ожидает подтверждения в банке.
        </p>
      ) : (
        <div className="mt-3">
          <Link
            href={checkoutHref}
            className={buttonVariants({
              size: compact && !featured ? "sm" : "default",
              className: featured
                ? "rounded-xl bg-pastel-blue text-foreground hover:bg-pastel-blue/80"
                : "rounded-xl",
            })}
          >
            {minBalance != null && minBalance <= 2
              ? "Пополнить баланс"
              : "Купить занятия"}
          </Link>
        </div>
      )}
    </section>
  );
}