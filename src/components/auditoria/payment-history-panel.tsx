"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Calendar, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import {
  CHANGE_TARIFF_HINT,
  STUDENT_CHECKOUT_PATH,
} from "@/lib/payment-checkout";
import {
  buildTariffHistoryItems,
  pendingReviewPaymentForStudent,
  queuedAssignmentForStudent,
  tariffDaysLeftLabel,
  tariffHistoryStatusLabel,
  tariffTermView,
  type TariffHistoryDisplayStatus,
  type TariffHistoryItem,
  type TariffTermView,
} from "@/lib/tariff-history";
import { currentAssignmentForStudent } from "@/lib/tariff-package";
import { assignmentTariffAlert } from "@/lib/tariff-warnings";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import type { StudentTariffAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

const rowLabel: Record<TariffHistoryDisplayStatus, string> = {
  current: "Активен",
  expired: "Завершён",
  review: tariffHistoryStatusLabel.review,
  queued: tariffHistoryStatusLabel.queued,
  rejected: tariffHistoryStatusLabel.rejected,
};

const rowTone: Record<TariffHistoryDisplayStatus, string> = {
  current: "bg-pastel-mint/80",
  expired: "bg-[#eceaf3]/85",
  review: "bg-pastel-beige/80",
  queued: "bg-pastel-beige/80",
  rejected: "bg-pastel-rose/80",
};

const rowStripe: Record<TariffHistoryDisplayStatus, string> = {
  current: "border-l-[#8fbfa0]",
  expired: "border-l-[#c5c2d4]",
  review: "border-l-[#e4c48a]",
  queued: "border-l-[#e4c48a]",
  rejected: "border-l-[#e3a4aa]",
};

function money(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function lessonsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "занятие"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "занятия"
        : "занятий";
  return `${count} ${word}`;
}

export function PaymentHistoryPanel() {
  const { data, ready } = useDemoStore();
  const studentId = data.currentStudentId;

  const items = useMemo(
    () =>
      buildTariffHistoryItems(
        data.tariffAssignments,
        data.payments,
        studentId
      ),
    [data.tariffAssignments, data.payments, studentId]
  );
  const current = useMemo(
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
  const currentAlert = assignmentTariffAlert(current);
  const featuredStatus = current
    ? (items.find((item) => item.id === current.id)?.displayStatus ?? null)
    : null;
  const isCurrent = featuredStatus === "current";

  if (!ready) return null;

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      {pending ? (
        <p className="rounded-2xl border border-black/10 bg-pastel-beige/75 px-4 py-3 text-sm">
          Заявка на оплату уже на проверке. Дождитесь решения администрации —
          повторную заявку создать нельзя, пока не будет подтверждения или
          отклонения.
        </p>
      ) : null}
      {queued ? (
        <p className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3 text-sm">
          Следующий тариф «{queued.tariffName ?? "Тариф"}» оплачен и ждёт
          активации, когда закончится текущий пакет.
        </p>
      ) : null}

      {current ? (
        <CurrentTariffCard
          assignment={current}
          isCurrent={isCurrent}
          status={featuredStatus}
          alertMessage={
            currentAlert.tone === "warn1" || currentAlert.tone === "warn2"
              ? currentAlert.message
              : null
          }
          pending={Boolean(pending)}
        />
      ) : (
        <section className="auditoria-home-card">
          <p className="text-sm text-muted-foreground">Тариф</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Тариф пока не назначен
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Когда администратор назначит тариф, здесь появятся срок, занятия и
            стоимость.
          </p>
          <div className="mt-4">
            <RenewLink pending={Boolean(pending)} label="Продлить обучение" icon />
          </div>
        </section>
      )}

      <section className="auditoria-home-card min-w-0">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          История тарифов
        </h2>
        {items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Пока нет тарифов"
              description="Покупки и заявки на оплату появятся здесь отдельными строками."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {!pending && current ? (
        <section className="rounded-3xl border border-black/10 bg-[#e7e4f6]/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                Не прерывайте подготовку
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80 sm:text-base">
                Продлите обучение, чтобы сохранить темп подготовки, доступ к
                материалам и поддержку куратора.
              </p>
            </div>
            <RenewLink pending={false} label="Продлить обучение →" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{CHANGE_TARIFF_HINT}</p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{CHANGE_TARIFF_HINT}</p>
      )}
    </div>
  );
}

function RenewLink({
  pending,
  label,
  icon = false,
}: {
  pending: boolean;
  label: string;
  icon?: boolean;
}) {
  const href = useStudentCabinetHref();
  if (pending) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm text-muted-foreground"
      >
        Заявка на проверке
      </button>
    );
  }
  return (
    <Link
      href={href(STUDENT_CHECKOUT_PATH)}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#e7dff6]/90 px-4 text-sm text-foreground"
    >
      {icon ? <Plus className="size-4" /> : null}
      {label}
    </Link>
  );
}

function CurrentTariffCard({
  assignment,
  isCurrent,
  status,
  alertMessage,
  pending,
}: {
  assignment: StudentTariffAssignment;
  isCurrent: boolean;
  status: TariffHistoryDisplayStatus | null;
  alertMessage: string | null;
  pending: boolean;
}) {
  const term = tariffTermView({
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  });
  const metrics = [
    { label: "Стоимость", value: money(assignment.priceSnapshot) },
    assignment.lessonsLimitSnapshot != null
      ? { label: "Всего занятий", value: String(assignment.lessonsLimitSnapshot) }
      : null,
    assignment.lessonsUsed != null
      ? { label: "Использовано", value: String(assignment.lessonsUsed) }
      : null,
    assignment.lessonsRemaining != null
      ? { label: "Осталось", value: String(assignment.lessonsRemaining) }
      : null,
    { label: "Начало", value: formatDate(assignment.startsAt) },
    assignment.endsAt
      ? { label: "Прогноз окончания", value: formatDate(assignment.endsAt) }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <section className="auditoria-home-card grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.75fr)] lg:items-stretch">
      <div className="min-w-0">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs",
            isCurrent ? "bg-pastel-mint/80" : status ? rowTone[status] : "bg-auditoria-surface"
          )}
        >
          {isCurrent ? "Текущий тариф" : status ? rowLabel[status] : "Тариф"}
        </span>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight break-words">
          {assignment.tariffName ?? "Тариф"}
        </h2>
        {assignment.includesText ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80 sm:text-base">
            {assignment.includesText}
          </p>
        ) : null}
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 text-sm font-medium break-words tabular-nums">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
        {alertMessage ? (
          <p className="mt-4 rounded-2xl bg-pastel-beige/75 px-3 py-2 text-sm">
            {alertMessage}
          </p>
        ) : null}
      </div>
      <TermPanel term={term} pending={pending} isCurrent={isCurrent} />
    </section>
  );
}

function TermPanel({
  term,
  pending,
  isCurrent,
}: {
  term: TariffTermView;
  pending: boolean;
  isCurrent: boolean;
}) {
  const fill =
    term.state === "unknown"
      ? null
      : term.tone === "ended"
        ? "bg-[#e3a4aa]"
        : term.tone === "soon"
          ? "bg-[#e4c48a]"
          : "bg-[#c9b7e6]";
  const caption =
    term.state === "ended" || !isCurrent
      ? "Срок тарифа"
      : "Тариф действует ещё";
  const value =
    term.state === "unknown"
      ? "Срок по датам не указан"
      : term.state === "ended"
        ? "Срок истёк"
        : tariffDaysLeftLabel(term.daysLeft, term.endsToday);

  return (
    <div className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-black/10 bg-auditoria-surface p-4">
      <div>
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-pastel-beige/80">
          <Calendar className="size-4" />
        </span>
        <p className="mt-3 text-sm text-muted-foreground">{caption}</p>
        <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {value}
        </p>
        {term.state === "unknown" ? null : (
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-black/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(term.progress * 100)}
            aria-label="Срок действия тарифа"
          >
            <div
              className={cn("h-full rounded-full", fill)}
              style={{ width: `${Math.round(term.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      <RenewLink pending={pending} label="Продлить тариф →" />
    </div>
  );
}

function HistoryRow({ item }: { item: TariffHistoryItem }) {
  const dates = item.endsAt
    ? `${formatDate(item.startsAt)} — ${formatDate(item.endsAt)}`
    : formatDate(item.startsAt);
  return (
    <li
      className={cn(
        "min-w-0 rounded-2xl border border-black/10 border-l-[3px] bg-auditoria-surface px-3 py-3",
        rowStripe[item.displayStatus]
      )}
    >
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto_auto_auto] lg:items-center lg:gap-4">
        <p className="font-medium break-words">{item.title}</p>
        <p className="text-sm break-words text-muted-foreground">{dates}</p>
        <p className="text-sm text-muted-foreground">
          {item.lessonsLimit != null ? lessonsLabel(item.lessonsLimit) : "—"}
        </p>
        <span
          className={cn(
            "inline-flex w-fit rounded-full px-2.5 py-1 text-xs",
            rowTone[item.displayStatus]
          )}
        >
          {rowLabel[item.displayStatus]}
          {item.expiring ? " · истекает" : ""}
        </span>
        <p className="text-sm font-medium tabular-nums lg:text-right">
          {money(item.price)}
        </p>
      </div>
    </li>
  );
}
