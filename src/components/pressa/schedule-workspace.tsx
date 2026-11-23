"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TrialDialog } from "@/components/pressa/trial-dialog";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addAppDateKey, appDateKey } from "@/lib/app-time";
import { formatDateTime, formatTime } from "@/lib/format";
import { combineDateAndTime, lessonParticipantsLabel } from "@/lib/schedule";
import { apiPressGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Lesson } from "@/lib/types";
import type { TrialLesson, TrialLessonPublic } from "@/lib/trial-lessons";

const ALL_TEACHERS = "__all__";

export function PressScheduleWorkspace({
  fixedTeacherId,
}: {
  /** Если задан — расписание одного преподавателя без переключателя (карточка). */
  fixedTeacherId?: string;
} = {}) {
  const {
    data,
    reload,
    lessonsForTeacher,
    ensureSchedulesMaterialized,
  } = useDemoStore();

  const [teacherFilter, setTeacherFilter] = useState(
    () => fixedTeacherId ?? ALL_TEACHERS
  );
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrialLesson | null>(null);
  const [prefill, setPrefill] = useState<
    { teacherId: string; startsAt: string } | undefined
  >();
  const [lessonView, setLessonView] = useState<Lesson | null>(null);

  useEffect(() => {
    if (fixedTeacherId) setTeacherFilter(fixedTeacherId);
  }, [fixedTeacherId]);

  useEffect(() => {
    const untilKey = addAppDateKey(appDateKey(weekAnchor), 21);
    void (async () => {
      const r = await ensureSchedulesMaterialized(
        new Date(`${untilKey}T23:59:59+03:00`).toISOString()
      );
      if (r.ok && (r.created ?? 0) > 0) await reload();
    })();
  }, [weekAnchor, ensureSchedulesMaterialized, reload]);

  const showAll = !fixedTeacherId && teacherFilter === ALL_TEACHERS;
  const activeTeacherId = showAll ? "" : teacherFilter;

  const lessons = useMemo(() => {
    if (showAll) return data.lessons;
    return lessonsForTeacher(activeTeacherId);
  }, [showAll, data.lessons, lessonsForTeacher, activeTeacherId]);

  const trialLessons = useMemo(() => {
    if (showAll) return data.trialLessons;
    return data.trialLessons.filter((t) => t.teacherId === activeTeacherId);
  }, [showAll, data.trialLessons, activeTeacherId]);

  const teacher = data.teachers.find((t) => t.id === activeTeacherId);
  const teacherNameOf = (id: string) =>
    data.teachers.find((t) => t.id === id)?.fullName ?? "Преподаватель";
  const studentNameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";

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

  if (fixedTeacherId && !teacher) {
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
        title={fixedTeacherId ? (teacher?.fullName ?? "Расписание") : "Расписание"}
        description={
          showAll
            ? "Общая недельная сетка всех преподавателей. Обычные занятия только для просмотра; для пробного выберите преподавателя."
            : "Обычные занятия только для просмотра. Нажмите на свободный слот, чтобы назначить пробный урок."
        }
        actions={
          fixedTeacherId ? (
            <Link
              href="/pressa/teachers"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              ← К списку
            </Link>
          ) : (
            <Select
              value={teacherFilter || null}
              onValueChange={(v) => v && setTeacherFilter(v)}
            >
              <SelectTrigger className="w-[min(100%,240px)] rounded-full">
                <SelectValue placeholder="Преподаватель">
                  {(v) =>
                    v === ALL_TEACHERS
                      ? "Все преподаватели"
                      : (data.teachers.find((t) => t.id === v)?.fullName ??
                        "Преподаватель")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEACHERS}>Все преподаватели</SelectItem>
                {data.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {!fixedTeacherId && !showAll && !activeTeacherId ? (
        <p className="text-sm text-muted-foreground">Выберите преподавателя.</p>
      ) : (
        <WeekCalendar
          lessons={lessons}
          trialLessons={trialLessons}
          students={data.students}
          weekAnchor={weekAnchor}
          onWeekChange={setWeekAnchor}
          slotActionLabel={showAll ? "Выберите преп." : "+ Пробный"}
          lessonExtraLine={
            showAll
              ? (lesson) => teacherNameOf(lesson.teacherId)
              : undefined
          }
          onSlotClick={(day, hour, minute) => {
            if (showAll || !activeTeacherId) {
              toast.message("Выберите преподавателя", {
                description:
                  "Пробный урок назначается в сетке конкретного преподавателя.",
              });
              return;
            }
            const startsAt = combineDateAndTime(day, hour, minute).toISOString();
            setEditing(null);
            setPrefill({ teacherId: activeTeacherId, startsAt });
            setDialogOpen(true);
          }}
          onLessonClick={(lesson) => setLessonView(lesson)}
          onTrialClick={(trial) => void openTrial(trial)}
        />
      )}

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
              <p>
                <span className="text-muted-foreground">Преподаватель: </span>
                {teacherNameOf(lessonView.teacherId)}
              </p>
              <p>
                <span className="text-muted-foreground">Ученик: </span>
                {lessonParticipantsLabel(lessonView, studentNameOf)}
              </p>
              {lessonView.subject ? (
                <p>
                  <span className="text-muted-foreground">Тема: </span>
                  {lessonView.subject}
                </p>
              ) : null}
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
