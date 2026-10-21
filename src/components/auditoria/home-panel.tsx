"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AuditoriaMonthCalendar } from "@/components/auditoria/month-calendar";
import { MyTariffBlock } from "@/components/auditoria/my-tariff-block";
import { AuditoriaTeacherCard } from "@/components/auditoria/teacher-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
} from "@/components/status-badge";
import { TestTakeDialog } from "@/components/tests/test-take-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDueAt, formatTime } from "@/lib/format";
import { filterUpcomingLessonsForAuditoria } from "@/lib/recurring-schedule";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function AuditoriaHomePanel() {
  const {
    data,
    lessonsForStudent,
    assignmentsForStudent,
  } = useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const teacher = data.teachers.find((t) => t.id === student?.teacherId);

  const [openHw, setOpenHw] = useState<HomeworkAssignment | null>(null);

  const lessons = useMemo(
    () => lessonsForStudent(studentId),
    [lessonsForStudent, studentId]
  );
  const assignments = useMemo(
    () => assignmentsForStudent(studentId),
    [assignmentsForStudent, studentId]
  );

  const clock = useMemo(() => {
    const anchor = new Date();
    const now = anchor.getTime();
    return {
      now,
      dayStart: startOfDay(anchor).getTime(),
      dayEnd: endOfDay(anchor).getTime(),
    };
  }, []);

  const upcoming = useMemo(
    () => filterUpcomingLessonsForAuditoria(lessons, new Date(clock.now)),
    [lessons, clock.now]
  );

  const nextLesson = upcoming[0] ?? null;

  const todayTasks = useMemo(() => {
    const todayLessons = lessons.filter((l) => {
      const t = new Date(l.startsAt).getTime();
      return (
        t >= clock.dayStart && t <= clock.dayEnd && l.status !== "cancelled"
      );
    });
    const dueToday = assignments.filter((a) => {
      if (!a.dueAt) return false;
      const t = new Date(a.dueAt).getTime();
      return (
        t >= clock.dayStart &&
        t <= clock.dayEnd &&
        (a.status === "assigned" ||
          a.status === "overdue" ||
          a.status === "in_progress")
      );
    });
    return { todayLessons, dueToday };
  }, [lessons, assignments, clock.dayStart, clock.dayEnd]);

  const activeHw = useMemo(
    () =>
      assignments
        .filter(
          (a) =>
            a.status === "assigned" ||
            a.status === "overdue" ||
            a.status === "in_progress" ||
            a.status === "completed"
        )
        .sort((a, b) => {
          const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
          const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
          return ta - tb;
        }),
    [assignments]
  );

  const lastLesson = useMemo(
    () =>
      lessons
        .filter((l) => l.status === "done")
        .sort(
          (a, b) =>
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
        )[0] ?? null,
    [lessons]
  );

  const progress = useMemo(() => {
    const reviewed = assignments.filter((a) => a.status === "reviewed");
    const withScore = reviewed.filter((a) => a.score != null);
    const avg =
      withScore.length > 0
        ? withScore.reduce((sum, a) => {
            const max = a.maxScore && a.maxScore > 0 ? a.maxScore : 1;
            return sum + (a.score! / max) * 100;
          }, 0) / withScore.length
        : null;
    const doneLessons = lessons.filter((l) => l.status === "done").length;
    const openHw = assignments.filter(
      (a) =>
        a.status === "assigned" ||
        a.status === "overdue" ||
        a.status === "in_progress"
    ).length;
    return {
      reviewedCount: reviewed.length,
      avgPct: avg != null ? Math.round(avg) : null,
      doneLessons,
      openHw,
    };
  }, [assignments, lessons]);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  const nextTeacher = nextLesson
    ? data.teachers.find((t) => t.id === nextLesson.teacherId)
    : null;
  const nextTopic = nextLesson?.topicId
    ? data.topics.find((t) => t.id === nextLesson.topicId)
    : null;
  const lastTopic = lastLesson?.topicId
    ? data.topics.find((t) => t.id === lastLesson.topicId)
    : null;

  return (
    <div>
      <PageHeader title={`Здравствуйте, ${student.fullName.split(" ")[0]}`} />

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <AuditoriaTeacherCard teacher={teacher ?? null} />
        <MyTariffBlock studentId={studentId} />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
          Календарь занятий
        </h2>
        <AuditoriaMonthCalendar
          lessons={lessons}
          studentId={studentId}
          attendances={data.attendances}
          teachers={data.teachers}
          topics={data.topics}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Ближайшее занятие
            </h2>
            {nextLesson ? (
              <div className="border-b border-border/70 pb-4">
                <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                  {formatDateTime(nextLesson.startsAt)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatTime(nextLesson.endsAt)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nextTeacher?.fullName ?? "Преподаватель"}
                  {nextLesson.subject ? ` · ${nextLesson.subject}` : ""}
                  {nextTopic ? ` · ${nextTopic.title}` : ""}
                </p>
                <div className="mt-2">
                  <LessonStatusBadge status={nextLesson.status} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет запланированных занятий.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Актуальные задания
              </h2>
              <Link
                href="/auditoria/learning"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Все в обучении →
              </Link>
            </div>
            {activeHw.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет открытых или ожидающих проверки заданий.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 border-y border-border/70">
                {activeHw.slice(0, 5).map((a) => {
                  const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {getAssignmentTitle(a, hw)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDueAt(a.dueAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <HomeworkAssignmentStatusBadge
                          status={a.status}
                          perspective="student"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => setOpenHw(a)}
                        >
                          {a.status === "assigned" ||
                          a.status === "overdue" ||
                          a.status === "in_progress"
                            ? "Открыть"
                            : "Смотреть"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Задачи на сегодня
            </h2>
            <ul className="space-y-2 text-sm">
              {todayTasks.todayLessons.length === 0 &&
              todayTasks.dueToday.length === 0 ? (
                <li className="text-muted-foreground">На сегодня ничего нет.</li>
              ) : (
                <>
                  {todayTasks.todayLessons.map((l) => (
                    <li key={l.id} className="flex gap-2">
                      <span className="tabular-nums text-muted-foreground">
                        {formatTime(l.startsAt)}
                      </span>
                      <span>
                        Занятие
                        {l.subject ? ` · ${l.subject}` : ""}
                      </span>
                    </li>
                  ))}
                  {todayTasks.dueToday.map((a) => {
                    const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                    return (
                      <li key={a.id}>
                        Сдать: {getAssignmentTitle(a, hw)}
                        {a.dueAt ? ` (до ${formatTime(a.dueAt)})` : ""}
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Последнее занятие
            </h2>
            {lastLesson ? (
              <div>
                <p className="font-medium">{formatDateTime(lastLesson.startsAt)}</p>
                <p className="text-sm text-muted-foreground">
                  {lastTopic?.title ?? lastLesson.subject ?? "Без темы"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Пока не было занятий.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Прогресс
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Проверено ДЗ</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {progress.reviewedCount}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Средний % балла</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {progress.avgPct != null ? `${progress.avgPct}%` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Проведено занятий</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {progress.doneLessons}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Открытых ДЗ</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {progress.openHw}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Считается только по вашим реальным результатам, без декоративных
              графиков.
            </p>
          </section>
        </div>
      </div>

      <TestTakeDialog
        assignment={openHw}
        open={!!openHw}
        onOpenChange={(o) => !o && setOpenHw(null)}
      />
    </div>
  );
}
