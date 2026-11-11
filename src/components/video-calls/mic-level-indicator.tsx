"use client";

import { useEffect, useState } from "react";

import { createMicLevelMonitor } from "@/lib/video/mic-level-monitor";
import { cn } from "@/lib/utils";

const BARS = 5;

export function MicLevelIndicator({
  stream,
  active,
  className,
}: {
  stream: MediaStream | null;
  active: boolean;
  className?: string;
}) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active || !stream) {
      setLevel(0);
      return;
    }
    const monitor = createMicLevelMonitor(stream);
    if (!monitor) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLevel(monitor.getLevel());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      monitor.stop();
    };
  }, [active, stream]);

  const shown = active ? level : 0;

  return (
    <div
      className={cn("flex h-8 items-end gap-0.5", className)}
      aria-hidden
      title="Уровень микрофона"
    >
      {Array.from({ length: BARS }, (_, i) => {
        const threshold = (i + 1) / BARS;
        const on = shown >= threshold * 0.55;
        return (
          <span
            key={i}
            className={cn(
              "w-1 rounded-sm transition-colors duration-75",
              on ? "bg-emerald-500" : "bg-muted-foreground/25"
            )}
            style={{ height: `${30 + i * 14}%` }}
          />
        );
      })}
    </div>
  );
}
