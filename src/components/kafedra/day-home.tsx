"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CompleteLessonDialog } from "@/components/schedule/complete-lesson-dialog";
import { LessonDialog } from "@/components/schedule/lesson-dialog";
import { LessonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import {
  DAY_END_HOUR,
  DAY_HOME_PX_PER_MINUTE,
  DAY_START_HOUR,
  durationMinutes,
  layoutLessonColumns,
  lessonParticipantsLabel,
  minutesSinceMidnight,
  sameDay,
} from "@/lib/schedule";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Короткие блоки: меньше текста и кнопок на сетке */
const SHORT_LESSON_MIN = 40;

export function KafedraDayHome() {
  const {
    data,
    lessonsForTeacher,
    studentsForTeacher,
    upsertLesson,
    deleteLesson,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [completeLesson, setCompleteLesson] = useState<Lesson | null>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  const dayLessons = useMemo(
    () =>
      lessonsForTeacher(teacherId)
        .filter((l) => sameDay(new Date(l.startsAt), today))
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        ),
    [lessonsForTeacher, teacherId, today]
  );

  const laidOut = useMemo(
    () => layoutLessonColumns(dayLessons),
    [dayLessons]
  );

  const students = useMemo(
    () => studentsForTeacher(teacherId).filter((s) => s.status === "active"),
    [studentsForTeacher, teacherId]
  );

  const dayStartMin = DAY_START_HOUR * 60;
  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const height = totalMin * DAY_HOME_PX_PER_MINUTE;
  const px = DAY_HOME_PX_PER_MINUTE;

  const nameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";

  const queue = data.homeworkAssignments.filter(
    (a) =>
      a.teacherId === teacherId &&
      (a.status === "completed" || a.status === "overdue")
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Сегодня"
        description={`${teacher?.fullName ?? "Преподаватель"} · ${today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <Link
            href="/kafedra/schedule"
            className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Неделя
          </Link>
        }
      />

      {queue > 0 ? (
        <div className="panel-soft surface-sand flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <p className="text-sm">
            К проверке или просрочено:{" "}
            <span className="font-semibold tabular-nums">{queue}</span>
          </p>
          <Link
            href="/kafedra/results"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            Открыть результаты →
          </Link>
        </div>
      ) : null}

      {dayLessons.length === 0 ? (
        <EmptyState
          title="На сегодня занятий нет"
          description="Можно открыть недельную сетку и запланировать занятие."
        />
      ) : (
        <>
          <div
            className="panel relative hidden overflow-hidden md:block"
            style={{ height }}
          >
            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
              const h = DAY_START_HOUR + i;
              return (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/45"
                  style={{ top: i * 60 * px }}
                >
                  <span className="absolute top-0 left-1.5 -translate-y-1/2 bg-card px-1 text-[0.6rem] leading-none text-muted-foreground tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              );
            })}
            {laidOut.map(({ lesson: l, column, columns }) => {
              const start = minutesSinceMidnight(new Date(l.startsAt));
              const end = minutesSinceMidnight(new Date(l.endsAt));
              const top = (start - dayStartMin) * px;
              const mins = Math.max(end - start, 15);
              const blockH = Math.max(mins * px, 28);
              const short = durationMinutes(l.startsAt, l.endsAt) < SHORT_LESSON_MIN;
              const gap = 4;
              const leftBase = 52;
              const rightPad = 10;
              const colW = `calc((100% - ${leftBase + rightPad}px - ${(columns - 1) * gap}px) / ${columns})`;
              const left = `calc(${leftBase}px + ${column} * (${colW} + ${gap}px))`;
              const label = lessonParticipantsLabel(l, nameOf);

              return (
                <div
                  key={l.id}
                  className={cn(
                    "absolute overflow-hidden rounded-lg border px-2 py-1",
                    l.status === "cancelled"
                      ? "border-destructive/30 bg-destructive/10"
                      : l.status === "done"
                        ? "border-success/25 surface-mint"
                        : "border-border/80 surface-sky"
                  )}
                  style={{ top, height: blockH, left, width: colW }}
                >
                  {short ? (
                    <div className="flex h-full w-full flex-col justify-center">
                      <button
                        type="button"
                        className="truncate text-left text-[0.7rem] font-semibold tabular-nums leading-tight hover:underline"
                        onClick={() => setEditLesson(l)}
                      >
                        {formatTime(l.startsAt)} · {label}
                      </button>
                      {l.status === "planned" ? (
                        <button
                          type="button"
                          className="mt-0.5 w-fit text-[0.65rem] font-medium underline-offset-2 hover:underline"
                          onClick={() => setCompleteLesson(l)}
                        >
                          Завершить
                        </button>
                      ) : (
                        <span className="text-[0.65rem] text-muted-foreground">
                          {l.subject || "Занятие"}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-[0.75rem] font-semibold tabular-nums leading-tight">
                          {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                        </p>
                        <p className="truncate text-[0.8rem] font-medium leading-snug">
                          {label}
                        </p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          {l.subject || "Занятие"}
                          {l.studentIds.length > 1 ? " · совместное" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <LessonStatusBadge status={l.status} />
                        {l.status === "planned" ? (
                          <Button
                            type="button"
                            size="xs"
                            className="h-6 rounded-full px-2 text-[0.7rem]"
                            onClick={() => setCompleteLesson(l)}
                          >
                            Завершить
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-6 rounded-full px-2 text-[0.7rem]"
                          onClick={() => setEditLesson(l)}
                        >
                          Открыть
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <ul className="panel divide-y divide-border/70 overflow-hidden md:hidden">
            {dayLessons.map((l) => {
              const label = lessonParticipantsLabel(l, nameOf);
              const short =
                durationMinutes(l.startsAt, l.endsAt) < SHORT_LESSON_MIN;
              return (
                <li key={l.id} className="flex flex-col gap-1.5 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                    </span>
                    <LessonStatusBadge status={l.status} />
                  </div>
                  <p className="text-sm font-medium leading-snug">{label}</p>
                  {!short ? (
                    <p className="text-xs text-muted-foreground">
                      {l.subject || "Занятие"}
                      {l.studentIds.length > 1 ? " · совместное" : ""}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {l.status === "planned" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => setCompleteLesson(l)}
                      >
                        Завершить
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setEditLesson(l)}
                    >
                      Подробнее
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dayLessons.length === 0 ? (
        <div className="flex justify-center">
          <Link
            href="/kafedra/schedule"
            className="inline-flex h-8 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
          >
            Открыть расписание
          </Link>
        </div>
      ) : null}

      <CompleteLessonDialog
        lesson={completeLesson}
        open={!!completeLesson}
        onOpenChange={(o) => !o && setCompleteLesson(null)}
      />
      <LessonDialog
        open={!!editLesson}
        onOpenChange={(o) => !o && setEditLesson(null)}
        teacherId={teacherId}
        students={students}
        initial={editLesson ?? undefined}
        onSave={(lesson) => upsertLesson(lesson)}
        onDelete={deleteLesson}
      />
    </div>
  );
}
