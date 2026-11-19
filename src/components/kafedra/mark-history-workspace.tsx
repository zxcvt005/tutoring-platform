"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LessonContentEditor } from "@/components/kafedra/lesson-content-editor";
import { AttendanceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatTime, attendanceStatusLabel } from "@/lib/format";
import {
  attendanceMarkBinaryLabel,
  groupLessonsByAppDate,
  studentAttendanceMarkBinary,
} from "@/lib/kafedra-today";
import { topicsForLesson } from "@/lib/lesson-topics";
import { useDemoStore } from "@/lib/store/demo-store";
import type { AttendanceStatus, Lesson } from "@/lib/types";

const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent_excused",
  "absent_unexcused",
];

function lessonStudentId(lesson: Lesson): string | null {
  return lesson.studentIds[0] ?? null;
}

export function MarkHistoryWorkspace() {
  const {
    data,
    lessonsForTeacher,
    setAttendance,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const now = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pastLessons = useMemo(() => {
    return lessonsForTeacher(teacherId)
      .filter((l) => new Date(l.startsAt).getTime() <= now.getTime())
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
  }, [lessonsForTeacher, teacherId, now]);

  const groups = useMemo(
    () => groupLessonsByAppDate(pastLessons),
    [pastLessons]
  );

  const activeDate = selectedDate ?? groups[0]?.dateKey ?? null;
  const dayLessons =
    groups.find((g) => g.dateKey === activeDate)?.lessons ?? [];

  async function changeAttendance(
    lesson: Lesson,
    studentId: string,
    status: AttendanceStatus
  ) {
    const key = `${lesson.id}:${studentId}`;
    setBusyKey(key);
    try {
      const result = await setAttendance(lesson.id, studentId, status);
      if (!result.ok) {
        toast.error(result.error ?? "Не удалось изменить посещаемость");
        return;
      }
      toast.success("Посещаемость обновлена");
    } finally {
      setBusyKey(null);
    }
  }

  if (!teacherId) {
    return (
      <p className="text-sm text-muted-foreground">
        Профиль преподавателя не найден.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          История отметок
        </h1>
        <p className="text-sm text-muted-foreground">
          Прошлые занятия с возможностью править посещаемость, темы и домашние
          задания — в том числе после пропуска.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          Пока нет прошедших занятий.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="space-y-1 lg:sticky lg:top-4 lg:self-start">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Даты
            </p>
            <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto rounded-xl border border-border/70 bg-muted/10 p-1">
              {groups.map((group) => {
                const active = group.dateKey === activeDate;
                const sample = group.lessons[0];
                return (
                  <li key={group.dateKey}>
                    <button
                      type="button"
                      className={
                        active
                          ? "w-full rounded-lg bg-background px-3 py-2 text-left text-sm font-medium shadow-sm"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background/70 hover:text-foreground"
                      }
                      onClick={() => {
                        setSelectedDate(group.dateKey);
                        setOpenLessonId(null);
                      }}
                    >
                      <span className="block">
                        {sample ? formatDate(sample.startsAt) : group.dateKey}
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {group.lessons.length} зан.
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {dayLessons[0]
                ? formatDate(dayLessons[0].startsAt)
                : "Выберите дату"}
            </h2>
            <ul className="space-y-3">
              {dayLessons.map((lesson) => {
                const sid = lessonStudentId(lesson);
                const student = sid
                  ? data.students.find((s) => s.id === sid)
                  : null;
                const att = sid
                  ? data.attendances.find(
                      (a) => a.lessonId === lesson.id && a.studentId === sid
                    )
                  : undefined;
                const topicTitles = topicsForLesson(lesson, data.topics)
                  .map((t) => t.title)
                  .filter(Boolean);
                const hw = data.homeworkAssignments.filter(
                  (a) =>
                    a.lessonId === lesson.id &&
                    a.studentId === sid &&
                    a.sourceKind !== "theory" &&
                    a.sourceKind !== "intensive" &&
                    a.status !== "withdrawn"
                );
                const open = openLessonId === lesson.id;
                const busy = busyKey === `${lesson.id}:${sid}`;

                return (
                  <li key={lesson.id} className="panel space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium tabular-nums">
                          {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)}
                        </p>
                        <p className="text-sm">
                          {student?.fullName ?? "Ученик"}
                          {student?.grade ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {student.grade} класс
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Статус занятия:{" "}
                          {lesson.status === "cancelled"
                            ? "отменено"
                            : lesson.status === "done"
                              ? "проведено"
                              : lesson.status}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              studentAttendanceMarkBinary(
                                lesson,
                                sid ?? "",
                                data.attendances
                              ) === "marked"
                                ? "text-xs font-medium text-[#3f6b52]"
                                : "text-xs font-medium text-amber-800 dark:text-amber-300"
                            }
                          >
                            {attendanceMarkBinaryLabel(
                              studentAttendanceMarkBinary(
                                lesson,
                                sid ?? "",
                                data.attendances
                              )
                            )}
                          </span>
                          {att ? (
                            <AttendanceStatusBadge status={att.status} />
                          ) : null}
                        </div>
                        {topicTitles.length > 0 ? (
                          <p className="text-sm">
                            Темы: {topicTitles.join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Темы не указаны
                          </p>
                        )}
                        {hw.length > 0 ? (
                          <p className="text-sm">
                            ДЗ:{" "}
                            {hw
                              .map(
                                (a) =>
                                  data.homeworks.find((h) => h.id === a.homeworkId)
                                    ?.title ?? "Тест"
                              )
                              .join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Домашние задания не назначены
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={open ? "secondary" : "outline"}
                        className="h-8"
                        onClick={() =>
                          setOpenLessonId(open ? null : lesson.id)
                        }
                      >
                        {open ? "Свернуть" : "Открыть запись"}
                      </Button>
                    </div>

                    {open && sid && lesson.status !== "cancelled" ? (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[200px] flex-1 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Посещаемость
                            </p>
                            <Select
                              value={att?.status ?? ""}
                              onValueChange={(v) => {
                                if (!v) return;
                                void changeAttendance(
                                  lesson,
                                  sid,
                                  v as AttendanceStatus
                                );
                              }}
                            >
                              <SelectTrigger className="h-8" disabled={busy}>
                                <SelectValue>
                                  {() =>
                                    att?.status
                                      ? attendanceStatusLabel[att.status]
                                      : "Выбрать отметку"
                                  }
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {ATTENDANCE_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {attendanceStatusLabel[status]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <p className="text-[0.7rem] text-muted-foreground">
                            Повторное списание баланса не выполняется — ledger
                            идемпотентен.
                          </p>
                        </div>
                        <LessonContentEditor
                          key={`${lesson.id}-${sid}-history`}
                          lesson={lesson}
                          studentId={sid}
                          required={false}
                        />
                      </div>
                    ) : null}
                    {open && lesson.status === "cancelled" ? (
                      <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        Отменённое занятие нельзя редактировать. Баланс не
                        списывается.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
