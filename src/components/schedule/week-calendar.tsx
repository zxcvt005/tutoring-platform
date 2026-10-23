"use client";

import { useMemo, useState } from "react";

import { LessonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { appZonedParts, formatInAppZone } from "@/lib/app-time";
import { formatTime, weekdayShort } from "@/lib/format";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  PX_PER_MINUTE,
  addDays,
  layoutLessonColumns,
  lessonCardSlotLayout,
  lessonParticipantsLabel,
  minutesSinceMidnight,
  sameDay,
  startOfWeek,
} from "@/lib/schedule";
import type { Lesson, Student } from "@/lib/types";
import { cn } from "@/lib/utils";

type WeekCalendarProps = {
  lessons: Lesson[];
  students: Student[];
  weekAnchor: Date;
  onWeekChange: (anchor: Date) => void;
  onSlotClick: (day: Date, hour: number, minute: number) => void;
  onLessonClick: (lesson: Lesson) => void;
};

export function WeekCalendar({
  lessons,
  students,
  weekAnchor,
  onWeekChange,
  onSlotClick,
  onLessonClick,
}: WeekCalendarProps) {
  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) list.push(h);
    return list;
  }, []);

  const dayStartMin = DAY_START_HOUR * 60;
  const dayEndMin = DAY_END_HOUR * 60;
  const totalMin = dayEndMin - dayStartMin;
  const gridHeight = totalMin * PX_PER_MINUTE;

  const nameOf = (id: string) =>
    students.find((s) => s.id === id)?.fullName ?? "Ученик";

  const today = new Date();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => onWeekChange(addDays(weekStart, -7))}
          >
            ← Неделя
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => onWeekChange(new Date())}
          >
            Сегодня
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => onWeekChange(addDays(weekStart, 7))}
          >
            Неделя →
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatInAppZone(weekStart, {
            day: "numeric",
            month: "long",
          })}{" "}
          —{" "}
          {formatInAppZone(addDays(weekStart, 6), {
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      <div className="space-y-2 md:hidden">
        {days.map((day) => {
          const dayLessons = lessons
            .filter((l) => sameDay(new Date(l.startsAt), day))
            .sort(
              (a, b) =>
                new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
            );
          return (
            <div key={day.toISOString()} className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-1.5">
                <span className="font-medium capitalize">
                  {weekdayShort[appZonedParts(day).weekday - 1]} ·{" "}
                  {formatInAppZone(day, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onSlotClick(day, 10, 0)}
                >
                  + Занятие
                </Button>
              </div>
              {dayLessons.length === 0 ? (
                <p className="px-2.5 py-2.5 text-sm text-muted-foreground">Пусто</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {dayLessons.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40"
                        onClick={() => onLessonClick(l)}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium tabular-nums">
                            {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                          </div>
                          <div className="truncate text-sm">
                            {lessonParticipantsLabel(l, nameOf)}
                          </div>
                        </div>
                        <LessonStatusBadge status={l.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel hidden overflow-x-auto md:block">
        <div
          className="grid min-w-[720px]"
          style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
        >
          <div className="border-b border-border/70" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "border-b border-l border-border/70 px-1 py-1 text-center",
                sameDay(day, today) && "surface-sky"
              )}
            >
              <div className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                {weekdayShort[appZonedParts(day).weekday - 1]}
              </div>
              <div className="font-display text-sm font-semibold tabular-nums">
                {appZonedParts(day).day}
              </div>
            </div>
          ))}

          <div className="relative border-border/70" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-[0.65rem] text-muted-foreground tabular-nums"
                style={{
                  top: (h * 60 - dayStartMin) * PX_PER_MINUTE - 6,
                }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
            <div
              className="absolute right-1 text-[0.65rem] text-muted-foreground tabular-nums"
              style={{ top: gridHeight - 8 }}
            >
              24:00
            </div>
          </div>

          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              lessons={lessons.filter((l) => sameDay(new Date(l.startsAt), day))}
              nameOf={nameOf}
              gridHeight={gridHeight}
              dayStartMin={dayStartMin}
              onSlotClick={onSlotClick}
              onLessonClick={onLessonClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  day,
  lessons,
  nameOf,
  gridHeight,
  dayStartMin,
  onSlotClick,
  onLessonClick,
}: {
  day: Date;
  lessons: Lesson[];
  nameOf: (id: string) => string;
  gridHeight: number;
  dayStartMin: number;
  onSlotClick: (day: Date, hour: number, minute: number) => void;
  onLessonClick: (lesson: Lesson) => void;
}) {
  const [hoverY, setHoverY] = useState<number | null>(null);
  const laidOut = useMemo(() => layoutLessonColumns(lessons), [lessons]);

  return (
    <div
      className="relative border-l border-border/70"
      style={{ height: gridHeight }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoverY(e.clientY - rect.top);
      }}
      onMouseLeave={() => setHoverY(null)}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const mins = Math.floor(y / PX_PER_MINUTE / 30) * 30 + dayStartMin;
        const hour = Math.floor(mins / 60);
        const minute = mins % 60;
        if (hour >= DAY_START_HOUR && hour < DAY_END_HOUR) {
          onSlotClick(day, hour, minute);
        }
      }}
    >
      {hoursGridLines()}
      {hoverY != null ? (
        <div
          className="pointer-events-none absolute inset-x-1 z-0 h-5 rounded-md bg-muted/50"
          style={{
            top:
              Math.floor(hoverY / (30 * PX_PER_MINUTE)) * 30 * PX_PER_MINUTE,
          }}
        />
      ) : null}
      {laidOut.map(({ lesson: l, column, columns }) => {
        const start = minutesSinceMidnight(new Date(l.startsAt));
        const end = minutesSinceMidnight(new Date(l.endsAt));
        const top =
          (Math.max(start, dayStartMin) - dayStartMin) * PX_PER_MINUTE;
        const height = Math.max(
          (Math.min(end, DAY_END_HOUR * 60) - Math.max(start, dayStartMin)) *
            PX_PER_MINUTE,
          18
                );
        const { leftPct, widthPct } = lessonCardSlotLayout(column, columns);
        return (
          <button
            key={l.id}
            type="button"
            className={cn(
              "absolute z-10 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[0.65rem] leading-tight shadow-none transition-opacity hover:opacity-95",
              l.status === "cancelled"
                ? "border-destructive/30 bg-destructive/10 text-destructive line-through"
                : l.status === "done"
                  ? "border-success/25 surface-mint text-foreground"
                  : "border-border/80 surface-sky text-foreground"
            )}
            style={{
              top,
              height,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onLessonClick(l);
            }}
          >
            <div className="font-semibold tabular-nums">
              {formatTime(l.startsAt)}
            </div>
            <div className="truncate">{lessonParticipantsLabel(l, nameOf)}</div>
          </button>
        );
      })}
    </div>
  );
}

function hoursGridLines() {
  const lines = [];
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    lines.push(
      <div
        key={h}
        className="pointer-events-none absolute inset-x-0 border-t border-border/50"
        style={{ top: (h * 60 - DAY_START_HOUR * 60) * PX_PER_MINUTE }}
      />
    );
    lines.push(
      <div
        key={`${h}-h`}
        className="pointer-events-none absolute inset-x-0 border-t border-border/25"
        style={{
          top: (h * 60 + 30 - DAY_START_HOUR * 60) * PX_PER_MINUTE,
        }}
      />
    );
  }
  return lines;
}
