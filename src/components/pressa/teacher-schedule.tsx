"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { TrialDialog } from "@/components/pressa/trial-dialog";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { combineDateAndTime } from "@/lib/schedule";
import { formatDateTime, formatTime } from "@/lib/format";
import { apiPressGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Lesson } from "@/lib/types";
import type { TrialLesson, TrialLessonPublic } from "@/lib/trial-lessons";

export function PressTeacherSchedule({ teacherId }: { teacherId: string }) {
  const { data, reload, lessonsForTeacher } = useDemoStore();
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrialLesson | null>(null);
  const [prefill, setPrefill] = useState<
    { teacherId: string; startsAt: string } | undefined
  >();
  const [lessonView, setLessonView] = useState<Lesson | null>(null);

  const lessons = useMemo(
    () => lessonsForTeacher(teacherId),
    [lessonsForTeacher, teacherId]
  );
  const trialLessons = useMemo(
    () => data.trialLessons.filter((t) => t.teacherId === teacherId),
    [data.trialLessons, teacherId]
  );

  async function openTrial(trial: TrialLessonPublic) {
    try {
      const res = await apiPressGet<{ trial: TrialLesson }>("trial", {
        id: trial.id,
      });
      setEditing(res.trial);
      setPrefill(undefined);
      setDialogOpen(true);
    } catch {
      setEditing(null);
    }
  }

  if (!teacher) {
    return (
      <p className="text-sm text-muted-foreground">
        Преподаватель не найден.{" "}
        <Link href="/pressa/teachers" className="underline">
          К списку
        </Link>
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title={teacher.fullName}
        description="Обычные занятия только для просмотра. Нажмите на свободный слот, чтобы назначить пробный урок."
        actions={
          <Link
            href="/pressa/teachers"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            ← К списку
          </Link>
        }
      />
      <WeekCalendar
        lessons={lessons}
        trialLessons={trialLessons}
        students={data.students}
        weekAnchor={weekAnchor}
        onWeekChange={setWeekAnchor}
        slotActionLabel="+ Пробный"
        onSlotClick={(day, hour, minute) => {
          const startsAt = combineDateAndTime(day, hour, minute).toISOString();
          setEditing(null);
          setPrefill({ teacherId, startsAt });
          setDialogOpen(true);
        }}
        onLessonClick={(lesson) => setLessonView(lesson)}
        onTrialClick={(trial) => void openTrial(trial)}
      />
      <TrialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trial={editing}
        prefill={prefill}
        onSaved={() => void reload()}
      />
      <Dialog
        open={Boolean(lessonView)}
        onOpenChange={(open) => {
          if (!open) setLessonView(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Обычное занятие</DialogTitle>
          </DialogHeader>
          {lessonView ? (
            <div className="space-y-2 text-sm">
              <p>
                {formatDateTime(lessonView.startsAt)}–
                {formatTime(lessonView.endsAt)}
              </p>
              <p className="text-muted-foreground">
                Продажник не может изменять обычные уроки, посещаемость и темы.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
