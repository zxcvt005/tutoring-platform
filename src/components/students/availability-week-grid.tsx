"use client";

import {
  AVAILABILITY_HOURS,
  MIN_AVAILABILITY_SLOTS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  formatHourLabel,
  slotKey,
} from "@/lib/students/availability";
import type { StudentAvailabilitySlot } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AvailabilityWeekGrid({
  slots,
  onChange,
  readOnly = false,
  className,
}: {
  slots: StudentAvailabilitySlot[];
  onChange?: (next: StudentAvailabilitySlot[]) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const selected = new Set(slots.map(slotKey));

  function toggle(weekday: number, hourStart: number) {
    if (readOnly || !onChange) return;
    const key = `${weekday}-${hourStart}`;
    const next = selected.has(key)
      ? slots.filter((s) => slotKey(s) !== key)
      : [...slots, { weekday, hourStart }];
    onChange(next);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:pb-0">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="min-w-[7.5rem] flex-1 rounded-2xl border border-[#E8DFD4] bg-[#FFFbf7] shadow-[0_1px_0_rgba(80,60,40,0.04)] md:min-w-0"
          >
            <div className="border-b border-[#EDE4DA] px-2 py-2 text-center">
              <p className="font-display text-[11px] font-semibold tracking-wide text-[#5B4A63] uppercase sm:text-xs">
                {WEEKDAY_LABELS[day - 1]}
              </p>
            </div>
            <div className="flex flex-col p-1.5">
              {AVAILABILITY_HOURS.map((hour) => {
                const active = selected.has(`${day}-${hour}`);
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggle(day, hour)}
                    className={cn(
                      "flex h-8 items-center justify-between rounded-lg border px-2 text-left text-[11px] transition-colors sm:h-9 sm:text-xs",
                      active
                        ? "border-emerald-500/40 bg-emerald-500/15 font-medium text-emerald-900"
                        : "border-transparent text-[#7A6B78] hover:bg-[#F4EBEF]",
                      readOnly && "cursor-default"
                    )}
                  >
                    <span>{formatHourLabel(hour)}</span>
                    <span className="text-[10px] opacity-60">
                      {formatHourLabel(hour === 23 ? 0 : hour + 1)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!readOnly ? (
        <p className="text-sm text-[#7A6B78]">
          Выбрано:{" "}
          <span className="font-medium text-[#3F3345]">{slots.length}</span>
          {" · "}
          нужно минимум {MIN_AVAILABILITY_SLOTS}
        </p>
      ) : null}
    </div>
  );
}
