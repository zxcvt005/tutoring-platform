"use client";

import { useEffect, useState } from "react";

import type { HomeworkRingStats } from "@/lib/tests/attempts";
import { cn } from "@/lib/utils";

const ANIMATION_MS = 850;

const INNER_COLOR = "var(--chart-2)";
const OUTER_COLOR = "var(--chart-1)";
const TRACK_COLOR = "color-mix(in oklab, var(--border) 85%, transparent)";

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function formatRingPercent(value: number | null, animated: number): string {
  if (value == null) return "—";
  const n = Math.round(animated * 10) / 10;
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function useRingAnimation(
  first: number | null,
  final: number | null,
  duration = ANIMATION_MS
) {
  const [frame, setFrame] = useState({ first: 0, final: 0 });

  useEffect(() => {
    const firstTarget = first ?? 0;
    const finalTarget = final ?? 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setFrame({ first: firstTarget, final: finalTarget });
      return;
    }

    setFrame({ first: 0, final: 0 });
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setFrame({
        first: firstTarget * eased,
        final: finalTarget * eased,
      });
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [first, final, duration]);

  return frame;
}

function RingTrack({
  radius,
  strokeWidth,
  progress,
  color,
}: {
  radius: number;
  strokeWidth: number;
  progress: number;
  color: string;
}) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = circumference * (1 - clamped);
  return (
    <>
      <circle
        r={radius}
        cx="80"
        cy="80"
        fill="none"
        stroke={TRACK_COLOR}
        strokeWidth={strokeWidth}
      />
      {clamped > 0 ? (
        <circle
          r={radius}
          cx="80"
          cy="80"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
        />
      ) : null}
    </>
  );
}

export function HomeworkProgressRings({
  stats,
  totalCount,
  embedded = false,
  className,
}: {
  stats: HomeworkRingStats;
  totalCount?: number;
  embedded?: boolean;
  className?: string;
}) {
  const animated = useRingAnimation(
    stats.firstAttemptPercent,
    stats.finalPercent
  );
  const firstFill =
    stats.firstAttemptPercent == null
      ? 0
      : animated.first / 100;
  const finalFill =
    stats.finalPercent == null ? 0 : animated.final / 100;
  const centerLabel = formatRingPercent(
    stats.firstAttemptPercent,
    animated.first
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6",
        embedded ? "min-w-0 flex-1" : "panel p-4",
        className
      )}
    >
      <div
        className="relative size-[9.5rem] shrink-0 sm:size-[10.5rem]"
        role="img"
        aria-label={
          stats.firstAttemptPercent == null
            ? "Пока нет данных о правильных ответах"
            : `Правильных с первой попытки ${formatRingPercent(
                stats.firstAttemptPercent,
                stats.firstAttemptPercent
              )} процентов. Итого с учётом второй попытки ${formatRingPercent(
                stats.finalPercent,
                stats.finalPercent ?? 0
              )} процентов.`
        }
      >
        <svg viewBox="0 0 160 160" className="size-full" aria-hidden>
          <RingTrack
            radius={68}
            strokeWidth={10}
            progress={finalFill}
            color={OUTER_COLOR}
          />
          <RingTrack
            radius={52}
            strokeWidth={10}
            progress={firstFill}
            color={INNER_COLOR}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {centerLabel}
            {stats.firstAttemptPercent != null ? (
              <span className="text-base font-medium">%</span>
            ) : null}
          </p>
          <p className="mt-1 max-w-[4.8rem] text-center text-[10px] leading-tight text-muted-foreground">
            с 1-й попытки
          </p>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm font-medium">Прогресс домашних заданий</p>
        <ul className="space-y-2 text-sm">
          <LegendRow
            color={INNER_COLOR}
            label="Правильно с первой попытки"
            value={formatRingPercent(
              stats.firstAttemptPercent,
              animated.first
            )}
            hasPercent={stats.firstAttemptPercent != null}
          />
          <LegendRow
            color={OUTER_COLOR}
            label="Итого с учётом второй попытки"
            value={formatRingPercent(stats.finalPercent, animated.final)}
            hasPercent={stats.finalPercent != null}
          />
        </ul>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Выполнено заданий</span>
          <span className="font-display font-semibold tabular-nums">
            {totalCount == null
              ? stats.completedCount
              : `${stats.completedCount} из ${totalCount}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  hasPercent,
}: {
  color: string;
  label: string;
  value: string;
  hasPercent: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-baseline gap-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 text-muted-foreground">{label}</span>
      </span>
      <span className="shrink-0 font-display font-semibold tabular-nums">
        {value}
        {hasPercent ? "%" : ""}
      </span>
    </li>
  );
}
