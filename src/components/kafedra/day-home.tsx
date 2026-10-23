"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LessonContentEditor } from "@/components/kafedra/lesson-content-editor";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CompleteLessonDialog } from "@/components/schedule/complete-lesson-dialog";
import { LessonDialog } from "@/components/schedule/lesson-dialog";
import {
  AttendanceStatusBadge,
  LessonStatusBadge,
} from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatInAppZone, startOfAppDay } from "@/lib/app-time";
import { formatTime } from "@/lib/format";
import {
  attendanceMarkFeedback,
  groupLessonsByAppDate,
  isFinalAttendanceStatus,
  lessonHasOccurred,
  splitKafedraTodayLessons,
  studentNeedsAttendanceMark,
} from "@/lib/kafedra-today";
import { canCompleteAttendanceMark } from "@/lib/lesson-mark-requirements";
import { useDemoStore } from "@/lib/store/demo-store";
import { currentAssignmentForStudent } from "@/lib/tariff-package";
import type { Attendance, AttendanceStatus, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

export function KafedraDayHome() {
  const {
    data,
    lessonsForTeacher,
    studentsForTeacher,
    upsertLesson,
    deleteLesson,
    setAttendance,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const now = new Date();
  const today = startOfAppDay(now);

  const [completeLesson, setCompleteLesson] = useState<Lesson | null>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [markErrors, setMarkErrors] = useState<Record<string, string>>({});
  const [lastAttempt, setLastAttempt] = useState<
    Record<string, AttendanceStatus>
  >({});

  const teacherLessons = lessonsForTeacher(teacherId);
  const { overdue, today: dayLessons } = splitKafedraTodayLessons(
    teacherLessons,
    data.attendances,
    now
  );
  const overdueGroups = groupLessonsByAppDate(overdue);

  const slots = lessonsByStartTime(dayLessons);

  const students = useMemo(
    () => studentsForTeacher(teacherId).filter((s) => s.status === "active"),
    [studentsForTeacher, teacherId]
  );

  const nameOf = (id: string) =>
    data.students.find((s) => s.id === id)?.fullName ?? "Ученик";

  const queue = data.homeworkAssignments.filter(
    (a) =>
      a.teacherId === teacherId &&
      a.sourceKind !== "theory" &&
      (a.status === "completed" || a.status === "overdue")
  ).length;

  async function mark(
    lesson: Lesson,
    studentId: string,
    status: AttendanceStatus
  ) {
    if (lesson.status === "cancelled") return;
    const ready = canCompleteAttendanceMark(lesson, now);
    if (!ready.ok) {
      setMarkErrors((prev) => ({
        ...prev,
        [`${lesson.id}:${studentId}`]:
          ready.message ?? "Чтобы отметить занятие, укажите тему урока.",
      }));
      return;
    }
    const key = `${lesson.id}:${studentId}`;
    setBusyKey(key);
    setLastAttempt((prev) => ({ ...prev, [key]: status }));
    setMarkErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const result = await setAttendance(lesson.id, studentId, status);
      const feedback = attendanceMarkFeedback(result);
      if (!feedback.saved) {
        setMarkErrors((prev) => ({
          ...prev,
          [key]:
            feedback.message ??
            "Не удалось сохранить отметку. Повторите действие.",
        }));
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function cancelByTeacher(lesson: Lesson) {
    if (lesson.status === "cancelled") return;
    const key = `cancel:${lesson.id}`;
    setBusyKey(key);
    try {
      const result = await upsertLesson({ ...lesson, status: "cancelled" });
      const feedback = attendanceMarkFeedback(result);
      if (!feedback.saved) {
        setMarkErrors((prev) => ({
          ...prev,
          [key]:
            feedback.message ??
            "Не удалось отменить занятие. Повторите действие.",
        }));
      }
    } finally {
      setBusyKey(null);
    }
  }

  const emptyToday = dayLessons.length === 0 && overdue.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Сегодня"
        description={`${teacher?.fullName ?? "Преподаватель"} · ${formatInAppZone(today, { weekday: "long", day: "numeric", month: "long" })}`}
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
            href="/kafedra/grades"
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            Открыть оценки →
          </Link>
        </div>
      ) : null}

      {overdue.length > 0 ? (
        <section className="space-y-3">
          <div className="rounded-xl border border-amber-400/50 bg-amber-50/70 px-4 py-3 dark:bg-amber-950/30">
            <h2 className="text-sm font-semibold">Пропущенные отметки</h2>
            <p className="text-xs text-muted-foreground">
              Занятия уже должны были состояться, но посещаемость не сохранена.
              Отметьте или отмените слот — без отметки занятие не списывается.
            </p>
          </div>
          {overdueGroups.map((group) => (
            <div key={group.dateKey} className="space-y-2">
              <h3 className="font-display text-base font-semibold capitalize">
                {formatInAppZone(group.lessons[0]!.startsAt, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <ul className="space-y-3">
                {group.lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    attendances={data.attendances}
                    nameOf={nameOf}
                    tariffAssignments={data.tariffAssignments}
                    now={now}
                    highlightNeedsMark
                    showDate={false}
                    busyKey={busyKey}
                    markErrors={markErrors}
                    lastAttempt={lastAttempt}
                    onMark={mark}
                    onCancelTeacher={cancelByTeacher}
                    onEdit={() => setEditLesson(lesson)}
                    onTopics={() => setCompleteLesson(lesson)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {emptyToday ? (
        <EmptyState
          title="На сегодня занятий нет"
          description="Можно открыть недельную сетку и запланировать занятие."
        />
      ) : dayLessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          На сегодня занятий нет — сначала разберите пропущенные отметки.
        </p>
      ) : (
        <ul className="space-y-5">
          {slots.map(([time, lessons]) => (
            <li key={time} className="space-y-2">
              <h2 className="font-display text-lg font-semibold tabular-nums tracking-tight">
                {time}
              </h2>
              <ul className="space-y-3">
                {lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    attendances={data.attendances}
                    nameOf={nameOf}
                    tariffAssignments={data.tariffAssignments}
                    now={now}
                    highlightNeedsMark={false}
                    showDate={false}
                    busyKey={busyKey}
                    markErrors={markErrors}
                    lastAttempt={lastAttempt}
                    onMark={mark}
                    onCancelTeacher={cancelByTeacher}
                    onEdit={() => setEditLesson(lesson)}
                    onTopics={() => setCompleteLesson(lesson)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {emptyToday ? (
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

function LessonCard({
  lesson,
  attendances,
  nameOf,
  tariffAssignments,
  now,
  highlightNeedsMark,
  showDate,
  busyKey,
  markErrors,
  lastAttempt,
  onMark,
  onCancelTeacher,
  onEdit,
  onTopics,
}: {
  lesson: Lesson;
  attendances: Attendance[];
  nameOf: (id: string) => string;
  tariffAssignments: Parameters<typeof currentAssignmentForStudent>[0];
  now: Date;
  highlightNeedsMark: boolean;
  showDate: boolean;
  busyKey: string | null;
  markErrors: Record<string, string>;
  lastAttempt: Record<string, AttendanceStatus>;
  onMark: (
    lesson: Lesson,
    studentId: string,
    status: AttendanceStatus
  ) => void;
  onCancelTeacher: (lesson: Lesson) => void;
  onEdit: () => void;
  onTopics: () => void;
}) {
  const needsMark = lesson.studentIds.some((sid) =>
    studentNeedsAttendanceMark(lesson, sid, attendances, now)
  );

  return (
    <li
      className={cn(
        "panel space-y-3 p-4",
        highlightNeedsMark && "border-amber-400/60 ring-1 ring-amber-400/30"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {showDate
              ? `${formatInAppZone(lesson.startsAt, {
                  day: "numeric",
                  month: "long",
                })} · `
              : ""}
            {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {needsMark ? (
            <span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2 text-[0.7rem] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Требует отметки
            </span>
          ) : (
            <LessonStatusBadge status={lesson.status} />
          )}
          {lesson.status !== "cancelled" ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 rounded-full px-2 text-[0.7rem]"
              onClick={onTopics}
            >
              Тема и ДЗ
            </Button>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 rounded-full px-2 text-[0.7rem]"
            onClick={onEdit}
          >
            Открыть
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border/70">
        {lesson.studentIds.map((sid) => {
          const att = attendances.find(
            (a) => a.lessonId === lesson.id && a.studentId === sid
          );
          const asg = currentAssignmentForStudent(tariffAssignments, sid);
          const waiting = studentNeedsAttendanceMark(
            lesson,
            sid,
            attendances,
            now
          );
          const unmarkedFuture =
            lesson.status !== "cancelled" &&
            !isFinalAttendanceStatus(att?.status) &&
            !lessonHasOccurred(lesson, now);
          const key = `${lesson.id}:${sid}`;
          const showAfterMark =
            isFinalAttendanceStatus(att?.status) &&
            lesson.status !== "cancelled" &&
            att?.status !== "cancelled" &&
            att?.status !== "rescheduled";
          const markReady = canCompleteAttendanceMark(lesson, now);
          const showContentEditor =
            lesson.status !== "cancelled" && (waiting || showAfterMark);
          const blockMark = waiting && !markReady.ok;
          const cancelBusy =
            busyKey === `cancel:${lesson.id}` || busyKey === key;
          const errorText =
            markErrors[key] ?? markErrors[`cancel:${lesson.id}`];
          return (
            <li key={sid} className="flex flex-col gap-2 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{nameOf(sid)}</p>
                  <p className="text-xs text-muted-foreground">
                    {asg?.lessonsRemaining != null
                      ? `Остаток: ${asg.lessonsRemaining}`
                      : asg
                        ? "Остаток: —"
                        : "Нет тарифа"}
                    {asg?.lessonsUsed != null
                      ? ` · использовано ${asg.lessonsUsed}`
                      : ""}
                  </p>
                  {lesson.status === "cancelled" ? (
                    <p className="mt-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                      Отменил преподаватель — занятие не списывается
                    </p>
                  ) : waiting ? (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Требует отметки
                    </p>
                  ) : unmarkedFuture ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Занятие ещё не началось
                    </p>
                  ) : att ? (
                    <div className="mt-1">
                      <AttendanceStatusBadge status={att.status} />
                    </div>
                  ) : null}
                </div>
                {lesson.status === "cancelled" ? null : (
                  <AttendanceControls
                    key={`${lesson.id}-${sid}-${att?.status ?? "none"}`}
                    current={att?.status}
                    disabled={cancelBusy || blockMark}
                    cancelDisabled={cancelBusy}
                    onMark={(status) => onMark(lesson, sid, status)}
                    onCancelTeacher={() => onCancelTeacher(lesson)}
                  />
                )}
              </div>
              {blockMark && !errorText ? (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {markReady.message}
                </p>
              ) : null}
              {errorText ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <p className="text-xs text-destructive">{errorText}</p>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-6"
                    disabled={cancelBusy}
                    onClick={() => {
                      if (markErrors[`cancel:${lesson.id}`]) {
                        onCancelTeacher(lesson);
                        return;
                      }
                      const retry = lastAttempt[key];
                      if (retry) onMark(lesson, sid, retry);
                    }}
                  >
                    Повторить
                  </Button>
                </div>
              ) : null}
              {showContentEditor ? (
                <LessonContentEditor
                  key={`${lesson.id}-${sid}-${(lesson.lessonTopics ?? []).map((t) => t.id).join(",")}`}
                  lesson={lesson}
                  studentId={sid}
                  required={waiting}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function lessonsByStartTime(lessons: Lesson[]): [string, Lesson[]][] {
  const map = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const key = formatTime(l.startsAt);
    const list = map.get(key) ?? [];
    list.push(l);
    map.set(key, list);
  }
  return [...map.entries()];
}

function AttendanceControls({
  current,
  disabled,
  cancelDisabled,
  onMark,
  onCancelTeacher,
}: {
  current?: AttendanceStatus;
  disabled: boolean;
  cancelDisabled?: boolean;
  onMark: (status: AttendanceStatus) => void;
  onCancelTeacher: () => void;
}) {
  const [showAbsent, setShowAbsent] = useState(
    current === "absent_excused" || current === "absent_unexcused"
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={current === "present" ? "default" : "outline"}
        className="h-7 rounded-full px-3 text-xs"
        disabled={disabled}
        onClick={() => {
          setShowAbsent(false);
          onMark("present");
        }}
      >
        Был
      </Button>
      <Button
        type="button"
        size="sm"
        variant={
          current === "absent_excused" || current === "absent_unexcused"
            ? "default"
            : "outline"
        }
        className="h-7 rounded-full px-3 text-xs"
        disabled={disabled}
        onClick={() => setShowAbsent(true)}
      >
        Не был
      </Button>
      {showAbsent ? (
        <>
          <Button
            type="button"
            size="sm"
            variant={current === "absent_excused" ? "default" : "outline"}
            className={cn("h-7 rounded-full px-3 text-xs")}
            disabled={disabled}
            onClick={() => onMark("absent_excused")}
          >
            Уважительная
          </Button>
          <Button
            type="button"
            size="sm"
            variant={current === "absent_unexcused" ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            disabled={disabled}
            onClick={() => onMark("absent_unexcused")}
          >
            Неуважительная
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 rounded-full px-3 text-xs text-sky-700 dark:text-sky-400"
        disabled={cancelDisabled ?? disabled}
        onClick={onCancelTeacher}
      >
        Отменил преподаватель
      </Button>
    </div>
  );
}
