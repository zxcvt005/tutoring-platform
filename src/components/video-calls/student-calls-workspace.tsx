"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calendar, Clock, Video } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import { apiVideoCallList } from "@/lib/video/api";
import {
  callDurationMs,
  callMonthKey,
  callMonthOptions,
  defaultCallMonth,
  formatCallDuration,
  totalKnownCallDurationMs,
} from "@/lib/video/call-history";
import { deviceErrorMessage } from "@/lib/video/device-error";
import type { VideoCallSummary } from "@/lib/video/types";
import { cn } from "@/lib/utils";

function isJoinable(call: VideoCallSummary) {
  return call.status === "active" && call.myStatus !== "closed";
}

function callStatusLabel(call: VideoCallSummary) {
  if (call.status === "ended") return "Завершён";
  if (call.myStatus === "closed") return "Комната закрыта";
  return "Идёт";
}

function statusChipClass(call: VideoCallSummary) {
  if (call.status === "ended") return "bg-pastel-mint text-foreground";
  if (call.myStatus === "closed") return "bg-pastel-beige text-foreground";
  return "bg-pastel-blue text-foreground";
}

export function StudentCallsWorkspace() {
  const [calls, setCalls] = useState<VideoCallSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiVideoCallList();
        if (!cancelled) setCalls(data.calls);
      } catch (err) {
        if (!cancelled) setError(deviceErrorMessage(err));
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const months = useMemo(
    () => callMonthOptions((calls ?? []).map((call) => call.createdAt)),
    [calls]
  );
  const activeMonth =
    month ?? defaultCallMonth((calls ?? []).map((call) => call.createdAt));
  const visible = useMemo(
    () =>
      (calls ?? []).filter((call) => callMonthKey(call.createdAt) === activeMonth),
    [calls, activeMonth]
  );
  const totalDuration = calls ? totalKnownCallDurationMs(calls) : null;

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="auditoria-home-card motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <StatItem
            icon={<Video className="size-5" />}
            iconClass="bg-pastel-blue"
            value={calls ? String(calls.length) : "—"}
            label="всего звонков"
          />
          <div
            aria-hidden
            className="hidden h-12 w-px shrink-0 bg-black/10 sm:block"
          />
          <StatItem
            icon={<Clock className="size-5" />}
            iconClass="bg-pastel-beige"
            value={calls ? formatCallDuration(totalDuration) : "—"}
            label="общее время"
          />
        </div>
      </section>

      <section className="auditoria-home-card motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            История звонков
          </h2>
          <label className="relative inline-flex max-w-full items-center">
            <Calendar className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <select
              aria-label="Месяц"
              className="h-9 max-w-full appearance-none rounded-full border border-black/10 bg-auditoria-surface pr-8 pl-9 text-sm text-foreground"
              value={activeMonth}
              onChange={(event) => setMonth(event.target.value)}
            >
              {months.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {calls === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Загрузка…</p>
        ) : calls.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Пока нет звонков" />
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            В этом месяце звонков нет.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {visible.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatItem({
  icon,
  iconClass,
  value,
  label,
}: {
  icon: ReactNode;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl text-foreground",
          iconClass
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CallRow({ call }: { call: VideoCallSummary }) {
  const joinable = isJoinable(call);
  const duration = formatCallDuration(
    callDurationMs(call.createdAt, call.endedAt)
  );

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3",
        "transition-colors motion-safe:duration-200 hover:bg-pastel-blue/50",
        "sm:flex-row sm:items-center sm:justify-between"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pastel-blue text-foreground">
          <Video className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold tracking-tight">
            {call.teacherName}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {formatDateTime(call.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-rose px-2.5 py-1 text-sm tabular-nums">
          <Clock className="size-3.5" />
          {duration}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-sm",
            statusChipClass(call)
          )}
        >
          {callStatusLabel(call)}
        </span>
        {joinable ? (
          <Link
            href={`/auditoria/calls/${call.id}`}
            className="inline-flex h-8 items-center rounded-full border border-black/10 bg-auditoria-surface px-3 text-sm transition-colors hover:bg-pastel-blue active:translate-y-px"
          >
            Войти
          </Link>
        ) : null}
      </div>
    </li>
  );
}
