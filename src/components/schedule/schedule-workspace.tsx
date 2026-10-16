"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LessonDialog } from "@/components/schedule/lesson-dialog";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Lesson } from "@/lib/types";

export function ScheduleWorkspace({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    setDirekciyaTeacherId,
    studentsForTeacher,
    lessonsForTeacher,
    upsertLesson,
    deleteLesson,
  } = useDemoStore();

  const teacherId =
    mode === "direkciya" ? data.direkciyaTeacherId : data.currentTeacherId;

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<
    (Partial<Lesson> & { day?: Date; hour?: number; minute?: number }) | undefined
  >();

  const students = useMemo(
    () => studentsForTeacher(teacherId).filter((s) => s.status === "active"),
    [studentsForTeacher, teacherId]
  );
  const lessons = useMemo(
    () => lessonsForTeacher(teacherId),
    [lessonsForTeacher, teacherId]
  );

  const teacher = data.teachers.find((t) => t.id === teacherId);

  return (
    <div>
      <PageHeader
        title="Расписание"
        description={
          mode === "direkciya"
            ? "Недельная сетка выбранного преподавателя. Общего расписания всех сразу нет."
            : "Ваша недельная сетка. Нажмите на свободный слот, чтобы добавить занятие."
        }
        actions={
          mode === "direkciya" ? (
            <Select
              value={teacherId || null}
              onValueChange={(v) => v && setDirekciyaTeacherId(v)}
            >
              <SelectTrigger className="w-[220px] rounded-full">
                <SelectValue placeholder="Преподаватель">
                  {(v) =>
                    data.teachers.find((t) => t.id === v)?.fullName ?? "Преподаватель"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {data.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">{teacher?.fullName}</p>
          )
        }
      />

      {!teacherId ? (
        <p className="text-sm text-muted-foreground">Выберите преподавателя.</p>
      ) : (
        <WeekCalendar
          lessons={lessons}
          students={data.students}
          weekAnchor={weekAnchor}
          onWeekChange={setWeekAnchor}
          onSlotClick={(day, hour, minute) => {
            setEditing({ day, hour, minute });
            setDialogOpen(true);
          }}
          onLessonClick={(lesson) => {
            setEditing(lesson);
            setDialogOpen(true);
          }}
        />
      )}

      <LessonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teacherId={teacherId}
        students={students}
        initial={editing}
        onSave={(lesson) => upsertLesson(lesson)}
        onDelete={deleteLesson}
      />
    </div>
  );
}
