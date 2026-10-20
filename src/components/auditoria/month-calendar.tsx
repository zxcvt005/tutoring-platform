"use client";

import { useMemo, useState } from "react";

import { LessonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WEEKDAY_LABELS_RU,
  addMonths,
  buildMonthGrid,
  monthTitleRu,
  parseIsoToLocalDateKey,
  startOfMonth,
} from "@/lib/calendar-month";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Attendance, Lesson, Teacher, Topic } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CalendarLessonView = Lesson & {
  displayStatus: "planned" | "done" | "cancelled" | "missed";
};

function resolveDisplayStatus(
  lesson: Lesson,
  studentId: string,
  attendances: Attendance[]
): CalendarLessonView["displayStatus"] {
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.status === "done") {
    const att = attendances.find(
      (a) => a.lessonId === lesson.id && a.studentId === studentId
    );
    if (att?.status === "absent") return "missed";
    return "done";
  }
  return "planned";
}

const statusDot: Record<CalendarLessonView["displayStatus"], string> = {
  planned: "bg-[#3166F0]",
  done: "bg-emerald-500",
  cancelled: "bg-muted-foreground/50",
  missed: "bg-red-500",
};

export function AuditoriaMonthCalendar({
  lessons,
  studentId,
  attendances,
  teachers,
  topics,
}: {
  lessons: Lesson[];
  studentId: string;
  attendances: Attendance[];
  teachers: Teacher[];
  topics: Topic[];
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<CalendarLessonView | null>(null);

  const views = useMemo(
    () =>
      lessons.map((l) => ({
        ...l,
        displayStatus: resolveDisplayStatus(l, studentId, attendances),
      })),
    [lessons, studentId, attendances]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarLessonView[]>();
    for (const l of views) {
      const key = parseIsoToLocalDateKey(l.startsAt);
      const list = map.get(key) ?? [];
      list.push(l);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      );
    }
    return map;
  }, [views]);

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const selectedLessons = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setAnchor((a) => addMonths(a, -1))}
          >
            ←
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setAnchor(startOfMonth(new Date()))}
          >
            Сегодня
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setAnchor((a) => addMonths(a, 1))}
          >
            →
          </Button>
        </div>
        <p className="font-display text-lg font-semibold capitalize tracking-tight">
          {monthTitleRu(anchor)}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
        {WEEKDAY_LABELS_RU.map((d) => (
          <div
            key={d}
            className="bg-muted/40 px-1 py-2 text-center text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const dayLessons = byDay.get(cell.key) ?? [];
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedKey(cell.key)}
              className={cn(
                "min-h-[4.5rem] bg-background p-1.5 text-left transition-colors sm:min-h-[5.5rem]",
                !cell.inMonth && "bg-muted/20 text-muted-foreground/70",
                cell.isToday && "ring-1 ring-inset ring-[#3166F0]/60",
                selectedKey === cell.key && "bg-[#3166F0]/8"
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  cell.isToday && "bg-[#3166F0] font-semibold text-white"
                )}
              >
                {cell.date.getDate()}
              </span>
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {dayLessons.slice(0, 3).map((l) => (
                  <span
                    key={l.id}
                    className={cn(
                      "size-1.5 rounded-full",
                      statusDot[l.displayStatus]
                    )}
                  />
                ))}
              </div>
              <ul className="mt-1 hidden space-y-0.5 sm:block">
                {dayLessons.slice(0, 2).map((l) => (
                  <li
                    key={l.id}
                    className="truncate rounded px-1 text-[0.65rem] leading-tight"
                    style={{ background: "color-mix(in oklab, #3166F0 12%, transparent)" }}
                  >
                    <span
                      className={cn(
                        "mr-1 inline-block size-1.5 rounded-full align-middle",
                        statusDot[l.displayStatus]
                      )}
                    />
                    {formatTime(l.startsAt)}
                  </li>
                ))}
                {dayLessons.length > 2 ? (
                  <li className="px-1 text-[0.65rem] text-muted-foreground">
                    +{dayLessons.length - 2}
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>

      <p className="flex flex-wrap gap-3 text-[0.7rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#3166F0]" /> запланировано
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" /> проведено
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> пропущено
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/50" /> отменено
        </span>
      </p>

      {selectedKey ? (
        <div className="rounded-2xl border border-border/70 p-3">
          <p className="mb-2 text-sm font-medium">
            Занятия{" "}
            {new Date(selectedKey + "T12:00:00").toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            })}
          </p>
          {selectedLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет занятий в этот день.</p>
          ) : (
            <ul className="space-y-2">
              {selectedLessons.map((l) => {
                const teacher = teachers.find((t) => t.id === l.teacherId);
                const topic = l.topicId
                  ? topics.find((t) => t.id === l.topicId)
                  : null;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-muted/40"
                      onClick={() => setOpenLesson(l)}
                    >
                      <div>
                        <p className="font-medium tabular-nums">
                          {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {teacher?.fullName ?? "Преподаватель"}
                          {topic ? ` · ${topic.title}` : l.subject ? ` · ${l.subject}` : ""}
                        </p>
                      </div>
                      <LessonStatusBadge
                        status={
                          l.displayStatus === "missed" ? "done" : l.displayStatus
                        }
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <Dialog
        open={!!openLesson}
        onOpenChange={(o) => !o && setOpenLesson(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Занятие</DialogTitle>
          </DialogHeader>
          {openLesson ? (
            <div className="space-y-2 text-sm">
              <p className="font-display text-lg font-semibold tabular-nums">
                {formatDateTime(openLesson.startsAt)}
              </p>
              <p>
                Преподаватель:{" "}
                {teachers.find((t) => t.id === openLesson.teacherId)?.fullName ??
                  "—"}
              </p>
              <p>
                Тема:{" "}
                {openLesson.topicId
                  ? topics.find((t) => t.id === openLesson.topicId)?.title ??
                    openLesson.subject ??
                    "—"
                  : openLesson.subject ?? "—"}
              </p>
              <p>
                Статус:{" "}
                {openLesson.displayStatus === "missed"
                  ? "Пропущено"
                  : openLesson.displayStatus === "planned"
                    ? "Запланировано"
                    : openLesson.displayStatus === "done"
                      ? "Проведено"
                      : "Отменено"}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
