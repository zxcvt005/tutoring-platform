"use client";

import Link from "next/link";
import { useMemo } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { formatDate, formatTime } from "@/lib/format";
import {
  assignmentsForLesson,
  attendanceForLesson,
  historyLessonsNewestFirst,
  historyStripeClass,
  historyStripeTone,
  homeworkStillOpen,
  lessonHistoryStatusLabel,
  topicListForLesson,
  topicTextForLesson,
} from "@/lib/lesson-history";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function LessonHistoryPanel({ lessonId }: { lessonId?: string }) {
  const {
    data,
    lessonsForStudent,
    assignmentsForStudent,
  } = useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);

  const now = useMemo(() => new Date(), []);
  const allMine = useMemo(
    () =>
      lessonsForStudent(studentId).filter((l) =>
        l.studentIds.includes(studentId)
      ),
    [lessonsForStudent, studentId]
  );
  const lessons = useMemo(
    () => historyLessonsNewestFirst(allMine, studentId, now),
    [allMine, studentId, now]
  );
  const assignments = useMemo(
    () => assignmentsForStudent(studentId),
    [assignmentsForStudent, studentId]
  );

  const selected = lessonId
    ? lessons.find((l) => l.id === lessonId)
    : null;
  const futureRequested =
    Boolean(lessonId) &&
    !selected &&
    allMine.some((l) => l.id === lessonId);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="История занятий доступна в кабинете ученика."
      />
    );
  }

  const list = (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card">
      {lessons.map((lesson) => {
        const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
        const att = attendanceForLesson(
          data.attendances,
          lesson.id,
          studentId
        );
        const topic = topicTextForLesson(lesson, data.topics);
        const hw = assignmentsForLesson(assignments, lesson.id, studentId);
        const stripe = historyStripeTone(lesson, att);
        const active = selected?.id === lesson.id;
        return (
          <li key={lesson.id}>
            <Link
              href={`/auditoria/history/${lesson.id}`}
              className={cn(
                "grid grid-cols-[5.2rem_minmax(0,1fr)_minmax(7.5rem,9.5rem)] items-start gap-x-2 px-3 py-2 text-sm hover:bg-muted/40",
                historyStripeClass[stripe],
                active && "bg-muted/50"
              )}
            >
              <div className="tabular-nums">
                <p className="font-medium leading-tight">
                  {formatDate(lesson.startsAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium leading-tight">{topic.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {teacher?.fullName ?? "Преподаватель"}
                  {hw.length > 0
                    ? ` · ДЗ: ${hw.length}`
                    : ""}
                </p>
              </div>
              <span className="text-right text-[0.7rem] leading-snug text-muted-foreground">
                {lessonHistoryStatusLabel(lesson, att)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="История занятий"
        description="Прошедшие занятия — от новых к старым. Будущие уроки здесь не показываются."
      />

      {lessons.length === 0 ? (
        <EmptyState
          title="Пока нет занятий"
          description="Когда появятся уроки в расписании, они отобразятся здесь."
        />
      ) : (
        <div
          className={cn(
            "grid gap-4",
            selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : ""
          )}
        >
          <div className={cn(selected && "hidden lg:block")}>{list}</div>
          {selected ? (
            <LessonHistoryDetail
              lessonId={selected.id}
              studentId={studentId}
            />
          ) : futureRequested ? (
            <EmptyState
              title="Занятие ещё не состоялось"
              description="История показывает только прошедшие уроки. Расписание — на главной странице Аудитории."
            />
          ) : (
            <p className="hidden text-sm text-muted-foreground lg:block">
              Выберите занятие, чтобы открыть подробности.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function LessonHistoryDetail({
  lessonId,
  studentId,
}: {
  lessonId: string;
  studentId: string;
}) {
  const { data, assignmentsForStudent } = useDemoStore();
  const now = useMemo(() => new Date(), []);
  const lesson = data.lessons.find(
    (l) => l.id === lessonId && l.studentIds.includes(studentId)
  );

  if (!lesson) {
    return (
      <EmptyState
        title="Занятие не найдено"
        description="Это занятие недоступно или принадлежит другому ученику."
      />
    );
  }

  if (new Date(lesson.startsAt).getTime() > now.getTime()) {
    return (
      <EmptyState
        title="Занятие ещё не состоялось"
        description="Карточка откроется после того, как занятие должно было начаться."
      />
    );
  }

  const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
  const att = attendanceForLesson(data.attendances, lesson.id, studentId);
  const topicItems = topicListForLesson(lesson, data.topics);
  const topic = topicTextForLesson(lesson, data.topics);
  const hw = assignmentsForLesson(
    assignmentsForStudent(studentId),
    lesson.id,
    studentId
  );

  return (
    <div className="space-y-3">
      <Link
        href="/auditoria/history"
        className="inline-flex text-sm text-muted-foreground hover:text-foreground lg:hidden"
      >
        ← К истории
      </Link>
      <section className="rounded-xl border border-border/80 bg-card px-3 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-base font-semibold">{topic.title}</p>
          <p className="text-xs text-muted-foreground">
            {lessonHistoryStatusLabel(lesson, att)}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(lesson.startsAt)} · {formatTime(lesson.startsAt)}–
          {formatTime(lesson.endsAt)}
        </p>
        <p className="text-sm">{teacher?.fullName ?? "Преподаватель"}</p>
        {topicItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Темы этого занятия не указаны.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {topicItems.map((item, i) => (
              <li key={`${item.topicId ?? item.title}-${i}`}>
                <p className="text-sm font-medium">{item.title}</p>
                {item.description ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Описание темы в каталоге пока не задано.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-card px-3 py-3">
        <h2 className="text-sm font-semibold">Домашние задания после занятия</h2>
        {hw.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            После этого занятия домашнее задание не назначали.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {hw.map((a) => {
              const template = data.homeworks.find((h) => h.id === a.homeworkId);
              const title = getAssignmentTitle(a, template);
              const showResult =
                (a.status === "completed" || a.status === "reviewed") &&
                a.score != null &&
                a.maxScore != null;
              const open = homeworkStillOpen(a);
              return (
                <li
                  key={a.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border border-border/70 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between",
                    a.missedNextLesson &&
                      open &&
                      "border-destructive/40 bg-destructive/5"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    {showResult ? (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Результат: {a.score} из {a.maxScore}
                        {a.attempt1Percent != null
                          ? ` · 1-я: ${a.attempt1Percent}%`
                          : ""}
                        {a.attempt2Percent != null
                          ? ` · 2-я: ${a.attempt2Percent}%`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <HomeworkAssignmentStatusBadge
                      status={a.status}
                      perspective="student"
                      missedNextLesson={a.missedNextLesson}
                    />
                    {open ? (
                      <Link
                        href={`/auditoria/homework/${a.id}`}
                        className="text-sm font-medium text-primary"
                      >
                        Открыть
                      </Link>
                    ) : a.revealKeys ? (
                      <Link
                        href={`/auditoria/homework/${a.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        Результаты
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
