"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  addMonths,
  buildMonthGrid,
  dateKeyLocal,
  monthTitleRu,
  parseIsoToLocalDateKey,
  startOfMonth,
  WEEKDAY_LABELS_RU,
} from "@/lib/calendar-month";
import {
  APP_TIME_ZONE_LABEL,
  attendanceForStudent,
  classifyAuditoriaLesson,
  legendCategoryForLesson,
  upcomingWeekdaySlots,
} from "@/lib/auditoria-calendar";
import type { Attendance, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

type CompactDayMark = "lesson" | "other";

export function CompactScheduleCard({
  lessons,
  studentId,
  attendances,
  now = new Date(),
}: {
  lessons: Lesson[];
  studentId: string;
  attendances: Attendance[];
  now?: Date;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(now));
  const mine = useMemo(
    () => lessons.filter((l) => l.studentIds.includes(studentId)),
    [lessons, studentId]
  );
  const slots = useMemo(
    () => upcomingWeekdaySlots(mine, studentId, now),
    [mine, studentId, now]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, CompactDayMark[]>();
    for (const lesson of mine) {
      const att = attendanceForStudent(attendances, lesson.id, studentId);
      const classified = classifyAuditoriaLesson(lesson, att, now);
      const legend = legendCategoryForLesson(classified);
      const mark: CompactDayMark | null = legend
        ? "lesson"
        : classified === "cancelled"
          ? "other"
          : null;
      if (!mark) continue;
      const key = parseIsoToLocalDateKey(lesson.startsAt);
      const list = map.get(key) ?? [];
      list.push(mark);
      map.set(key, list);
    }
    return map;
  }, [mine, attendances, studentId, now]);

  const cells = useMemo(() => buildMonthGrid(anchor, now), [anchor, now]);
  const todayKey = dateKeyLocal(now);

  return (
    <section className="auditoria-home-card overflow-x-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Расписание занятий
        </h2>
        <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-pastel-blue ring-1 ring-[#b7d4e8]" />
            Занятие
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-pastel-beige ring-1 ring-[#e4d5c0]" />
            Другое
          </span>
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{APP_TIME_ZONE_LABEL}</p>

      {slots.length > 0 ? (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {slots.map((s) => (
            <span key={`${s.weekday}-${s.time}`}>
              <span className="font-medium">{s.weekday}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="tabular-nums">{s.time}</span>
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Ближайших занятий нет.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="rounded-full"
          aria-label="Предыдущий месяц"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
        >
          ‹
        </Button>
        <p className="font-display text-base font-semibold capitalize tracking-tight">
          {monthTitleRu(anchor)}
        </p>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="rounded-full"
          aria-label="Следующий месяц"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
        >
          ›
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS_RU.map((d) => (
          <div
            key={d}
            className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const marks = cell.inMonth ? byDay.get(cell.key) ?? [] : [];
          const unique = [...new Set(marks)];
          const hasLesson = unique.includes("lesson");
          const hasOther = unique.includes("other");
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className={cn(
                "flex min-h-9 flex-col items-center justify-center py-0.5",
                !cell.inMonth && "opacity-35"
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-xs tabular-nums",
                  hasLesson && "bg-pastel-blue text-foreground",
                  !hasLesson && hasOther && "bg-pastel-beige text-foreground",
                  !hasLesson &&
                    !hasOther &&
                    isToday &&
                    "ring-1 ring-inset ring-foreground/35",
                  !cell.inMonth && "text-muted-foreground"
                )}
              >
                {cell.dayNumber}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.65rem] text-muted-foreground">
        Отмена преподавателя не отмечается как «Не был».
      </p>
    </section>
  );
}
