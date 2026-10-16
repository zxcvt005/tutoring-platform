"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CompleteLessonDialog } from "@/components/schedule/complete-lesson-dialog";
import { LessonStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  PX_PER_MINUTE,
  minutesSinceMidnight,
  sameDay,
} from "@/lib/schedule";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

export function KafedraDayHome() {
  const { data, lessonsForTeacher } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [completeLesson, setCompleteLesson] = useState<Lesson | null>(null);

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

  const dayStartMin = DAY_START_HOUR * 60;
  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const height = totalMin * PX_PER_MINUTE;

  const queue = data.homeworkAssignments.filter(
    (a) =>
      a.teacherId === teacherId &&
      (a.status === "completed" || a.status === "overdue")
  ).length;

  return (
    <div className="space-y-6">
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
        <div className="panel-soft surface-sand flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
          {/* Desktop day timeline */}
          <div className="panel relative hidden overflow-hidden md:block" style={{ height }}>
            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
              const h = DAY_START_HOUR + i;
              return (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/50"
                  style={{ top: i * 60 * PX_PER_MINUTE }}
                >
                  <span className="absolute top-0 left-2 -translate-y-1/2 bg-card px-1 text-[0.65rem] text-muted-foreground tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              );
            })}
            {dayLessons.map((l) => {
              const start = minutesSinceMidnight(new Date(l.startsAt));
              const end = minutesSinceMidnight(new Date(l.endsAt));
              const top = (start - dayStartMin) * PX_PER_MINUTE;
              const blockH = Math.max((end - start) * PX_PER_MINUTE, 36);
              const student = data.students.find((s) => s.id === l.studentId);
              return (
                <div
                  key={l.id}
                  className={cn(
                    "absolute right-3 left-16 overflow-hidden rounded-xl border px-3 py-2",
                    l.status === "cancelled"
                      ? "border-destructive/30 bg-destructive/10"
                      : l.status === "done"
                        ? "border-success/25 surface-mint"
                        : "border-border/80 surface-sky"
                  )}
                  style={{ top, height: blockH }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold tabular-nums">
                        {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                      </p>
                      <p className="font-medium">{student?.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {l.subject || "Занятие"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <LessonStatusBadge status={l.status} />
                      {l.status === "planned" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full"
                          onClick={() => setCompleteLesson(l)}
                        >
                          Завершить
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile list */}
          <ul className="panel divide-y divide-border/70 overflow-hidden md:hidden">
            {dayLessons.map((l) => {
              const student = data.students.find((s) => s.id === l.studentId);
              return (
                <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {formatTime(l.startsAt)}–{formatTime(l.endsAt)}
                    </span>
                    <LessonStatusBadge status={l.status} />
                  </div>
                  <p className="font-medium">{student?.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {l.subject || "Занятие"}
                  </p>
                  {l.status === "planned" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-fit rounded-full"
                      onClick={() => setCompleteLesson(l)}
                    >
                      Завершить и отметить посещаемость
                    </Button>
                  ) : null}
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
    </div>
  );
}
