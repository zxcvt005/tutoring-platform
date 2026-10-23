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
  type AuditoriaLegendCategory,
} from "@/lib/auditoria-calendar";
import type { Attendance, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

const legendClass: Record<AuditoriaLegendCategory, string> = {
  present: "bg-emerald-500 text-white",
  absent: "bg-amber-500 text-white",
  future: "bg-[#3166F0] text-white",
};

const legendDot: Record<AuditoriaLegendCategory, string> = {
  present: "bg-emerald-500",
  absent: "bg-amber-500",
  future: "bg-[#3166F0]",
};

const legendLabel: Record<AuditoriaLegendCategory, string> = {
  present: "Был",
  absent: "Не был",
  future: "Будущее",
};

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
    const map = new Map<string, AuditoriaLegendCategory[]>();
    for (const lesson of mine) {
      const att = attendanceForStudent(attendances, lesson.id, studentId);
      const cat = legendCategoryForLesson(
        classifyAuditoriaLesson(lesson, att, now)
      );
      if (!cat) continue;
      const key = parseIsoToLocalDateKey(lesson.startsAt);
      const list = map.get(key) ?? [];
      list.push(cat);
      map.set(key, list);
    }
    return map;
  }, [mine, attendances, studentId, now]);

  const cells = useMemo(() => buildMonthGrid(anchor, now), [anchor, now]);
  const todayKey = dateKeyLocal(now);

  return (
    <section className="overflow-x-hidden rounded-2xl border border-border/70 bg-card p-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Расписание занятий
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{APP_TIME_ZONE_LABEL}</p>

      {slots.length > 0 ? (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {slots.map((s) => (
            <span key={`${s.weekday}-${s.time}`}>
              <span className="font-medium">{s.weekday}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="tabular-nums text-[#3166F0]">{s.time}</span>
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
          aria-label="Предыдущий месяц"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
        >
          ←
        </Button>
        <p className="font-display text-sm font-semibold capitalize tracking-tight">
          {monthTitleRu(anchor)}
        </p>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Следующий месяц"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
        >
          →
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS_RU.map((d) => (
          <div
            key={d}
            className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const cats = cell.inMonth ? byDay.get(cell.key) ?? [] : [];
          const unique = [...new Set(cats)];
          const single = unique.length === 1 ? unique[0]! : null;
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
                  single && legendClass[single],
                  !single && isToday && "ring-1 ring-inset ring-foreground/40",
                  !cell.inMonth && "text-muted-foreground"
                )}
              >
                {cell.dayNumber}
              </span>
              {unique.length > 1 ? (
                <span className="mt-0.5 flex gap-0.5">
                  {unique.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className={cn("size-1.5 rounded-full", legendDot[c])}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex flex-wrap gap-3 text-[0.7rem] text-muted-foreground">
        {(Object.keys(legendLabel) as AuditoriaLegendCategory[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-full", legendDot[k])} />
            {legendLabel[k]}
          </span>
        ))}
      </p>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">
        Отмена преподавателя не отмечается как «Не был».
      </p>
    </section>
  );
}
