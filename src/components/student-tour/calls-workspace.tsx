"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Video } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { formatDate, formatTime } from "@/lib/format";
import { useStudentTourExtras } from "@/lib/student-tour/extras";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import type { StudentTourCall } from "@/lib/student-tour/types";
import {
  callMonthKey,
  callMonthOptions,
  defaultCallMonth,
  formatCallDuration,
} from "@/lib/video/call-history";
import { cn } from "@/lib/utils";

function statusLabel(status: StudentTourCall["status"]) {
  if (status === "ended") return "Завершён";
  if (status === "missed") return "Пропущен";
  return "Отменён";
}

function statusClass(status: StudentTourCall["status"]) {
  if (status === "ended") return "bg-pastel-mint text-foreground";
  if (status === "missed") return "bg-pastel-rose/80 text-foreground";
  return "bg-pastel-beige text-foreground";
}

export function StudentTourCallsWorkspace() {
  const { extras } = useStudentTourExtras();
  const href = useStudentCabinetHref();
  const calls = extras.calls;
  const [month, setMonth] = useState<string | null>(null);
  const months = useMemo(
    () => callMonthOptions(calls.map((c) => c.createdAt)),
    [calls]
  );
  const activeMonth =
    month ?? defaultCallMonth(calls.map((c) => c.createdAt));
  const visible = useMemo(
    () => calls.filter((c) => callMonthKey(c.createdAt) === activeMonth),
    [calls, activeMonth]
  );
  const totalMs = calls.reduce(
    (sum, c) => sum + (c.durationMin != null ? c.durationMin * 60_000 : 0),
    0
  );

  return (
    <div className="space-y-5">
      <section className="auditoria-home-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Stat
            icon={<Video className="size-5" />}
            iconClass="bg-pastel-blue"
            value={String(calls.length)}
            label="всего звонков"
          />
          <div aria-hidden className="hidden h-12 w-px shrink-0 bg-black/10 sm:block" />
          <Stat
            icon={<Clock className="size-5" />}
            iconClass="bg-pastel-beige"
            value={formatCallDuration(totalMs)}
            label="общее время"
          />
        </div>
      </section>

      <section className="auditoria-home-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            История индивидуальных занятий
          </h2>
          <div className="flex flex-wrap gap-2">
            {months.map((m) => (
              <button
                key={m.key}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  activeMonth === m.key
                    ? "border-transparent bg-pastel-blue"
                    : "border-border"
                )}
                onClick={() => setMonth(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="Звонков в этом месяце нет"
            description="Выберите другой месяц или откройте полную историю."
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((call) => (
              <li key={call.id}>
                <Link
                  href={href(`/calls/${call.id}`)}
                  className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{call.topic}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(call.createdAt)} · {formatTime(call.createdAt)}
                      {call.durationMin != null
                        ? ` · ${call.durationMin} мин`
                        : ""}
                      {" · "}
                      {call.teacherName}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs",
                      statusClass(call.status)
                    )}
                  >
                    {statusLabel(call.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function StudentTourCallDetail({ callId }: { callId: string }) {
  const { extras } = useStudentTourExtras();
  const href = useStudentCabinetHref();
  const call = extras.calls.find((c) => c.id === callId);

  if (!call) {
    return (
      <EmptyState
        title="Звонок не найден"
        description="В демо доступна только учебная история Артёма."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={href("/calls")}
        className="inline-flex h-11 items-center rounded-full border border-black/10 bg-auditoria-surface px-4 text-sm"
      >
        ← К истории звонков
      </Link>
      <section className="auditoria-home-card space-y-3">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Демонстрационная карточка
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {call.topic}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(call.createdAt)} · {formatTime(call.createdAt)}
          {call.endedAt ? ` – ${formatTime(call.endedAt)}` : ""}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
            <dt className="text-xs text-muted-foreground">Преподаватель</dt>
            <dd className="mt-1 font-medium">{call.teacherName}</dd>
          </div>
          <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
            <dt className="text-xs text-muted-foreground">Статус</dt>
            <dd className="mt-1 font-medium">{statusLabel(call.status)}</dd>
          </div>
          <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
            <dt className="text-xs text-muted-foreground">Длительность</dt>
            <dd className="mt-1 font-medium">
              {call.durationMin != null ? `${call.durationMin} мин` : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
            <dt className="text-xs text-muted-foreground">Подключение</dt>
            <dd className="mt-1 font-medium">Только демо · без LiveKit</dd>
          </div>
        </dl>
        {call.note ? (
          <p className="text-sm text-muted-foreground">{call.note}</p>
        ) : null}
        <p className="rounded-2xl bg-pastel-beige/70 px-4 py-3 text-sm">
          Вход в реальную комнату видеозвонка в демонстрационном режиме
          недоступен.
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon,
  iconClass,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-2xl",
          iconClass
        )}
      >
        {icon}
      </span>
      <div>
        <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
