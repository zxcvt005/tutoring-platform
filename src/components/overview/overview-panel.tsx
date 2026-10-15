"use client";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function OverviewPanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    studentsForTeacher,
    groupsForTeacher,
    lessonsForTeacher,
    assignmentsForTeacher,
    resultsForTeacher,
  } = useDemoStore();

  const teacherId = data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);

  const stats =
    mode === "direkciya"
      ? [
          {
            label: "Ученики",
            value: data.students.length,
            href: "/direkciya/students",
            tone: "sky" as const,
          },
          {
            label: "Преподаватели",
            value: data.teachers.length,
            href: "/direkciya/teachers",
            tone: "sand" as const,
          },
          {
            label: "Группы",
            value: data.groups.length,
            href: "/direkciya/groups",
            tone: "mint" as const,
          },
          {
            label: "Задания",
            value: data.assignments.length,
            href: "/direkciya/assignments",
            tone: "rose" as const,
          },
        ]
      : [
          {
            label: "Мои ученики",
            value: studentsForTeacher(teacherId).length,
            href: "/kafedra/students",
            tone: "sky" as const,
          },
          {
            label: "Мои группы",
            value: groupsForTeacher(teacherId).length,
            href: "/kafedra/students",
            tone: "sand" as const,
          },
          {
            label: "Занятия",
            value: lessonsForTeacher(teacherId).length,
            href: "/kafedra/schedule",
            tone: "mint" as const,
          },
          {
            label: "Задания",
            value: assignmentsForTeacher(teacherId).length,
            href: "/kafedra/assignments",
            tone: "rose" as const,
          },
        ];

  const upcoming = (
    mode === "kafedra" ? lessonsForTeacher(teacherId) : data.lessons
  )
    .filter((l) => l.status === "planned")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, 5);

  const pendingResults = (
    mode === "kafedra" ? resultsForTeacher(teacherId) : data.results
  ).filter((r) => r.status === "submitted" || r.status === "pending").length;

  const overdue = (
    mode === "kafedra" ? resultsForTeacher(teacherId) : data.results
  ).filter((r) => r.status === "overdue").length;

  const toneClass = {
    sky: "surface-sky",
    sand: "surface-sand",
    mint: "surface-mint",
    rose: "surface-rose",
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={mode === "direkciya" ? "Обзор дирекции" : "Обзор кафедры"}
        description={
          mode === "kafedra"
            ? `Сейчас как: ${teacher?.fullName ?? "—"}. Показаны только ваши данные.`
            : "Сводка по сети. Следите за очередью проверки и ближайшими занятиями."
        }
      />

      {/* Разные композиции: Дирекция — внимание + сетка; Кафедра — «сегодня» полосой */}
      {mode === "direkciya" ? (
        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel overflow-hidden">
            <div className="border-b border-border/70 px-5 py-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Контроль
              </p>
              <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight">
                Что требует внимания
              </h2>
            </div>
            <div className="grid sm:grid-cols-2">
              <Link
                href="/direkciya/results"
                className="flex flex-col gap-1 border-b border-border/70 px-5 py-5 transition-colors hover:bg-muted/40 sm:border-r sm:border-b-0"
              >
                <span className="font-display text-4xl font-semibold tabular-nums tracking-tight">
                  {pendingResults}
                </span>
                <span className="text-sm text-muted-foreground">
                  Ожидают проверки или сдачи
                </span>
              </Link>
              <Link
                href="/direkciya/results"
                className="flex flex-col gap-1 px-5 py-5 transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "font-display text-4xl font-semibold tabular-nums tracking-tight",
                    overdue > 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {overdue}
                </span>
                <span className="text-sm text-muted-foreground">Просрочено</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={cn(
                  "panel-soft flex flex-col justify-between gap-6 p-4 transition-opacity hover:opacity-90",
                  toneClass[s.tone]
                )}
              >
                <span className="text-xs font-medium tracking-wide text-foreground/70">
                  {s.label}
                </span>
                <span className="font-display text-3xl font-semibold tabular-nums tracking-tight">
                  {s.value}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="panel-soft surface-sand flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Рабочий день
              </p>
              <p className="font-display mt-1 text-2xl font-semibold tracking-tight">
                {teacher?.fullName ?? "Преподаватель"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                В очереди:{" "}
                <span className="font-medium text-foreground">
                  {pendingResults}
                </span>
                {overdue > 0 ? (
                  <>
                    {" "}
                    · просрочено{" "}
                    <span className="font-medium text-destructive">{overdue}</span>
                  </>
                ) : null}
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-full"
              nativeButton={false}
              render={<Link href="/kafedra/results" />}
            >
              К результатам
            </Button>
          </div>
          <div className="panel flex flex-wrap divide-x divide-border/70 overflow-hidden">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="min-w-[6.5rem] flex-1 px-4 py-3.5 transition-colors hover:bg-muted/40"
              >
                <div className="font-display text-2xl font-semibold tabular-nums tracking-tight">
                  {s.value}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Ближайшие занятия
            </h2>
            <p className="text-sm text-muted-foreground">Список, не календарь</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            nativeButton={false}
            render={
              <Link
                href={
                  mode === "direkciya"
                    ? "/direkciya/schedule"
                    : "/kafedra/schedule"
                }
              />
            }
          >
            К расписанию
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет запланированных занятий.
          </p>
        ) : (
          <ul className="panel divide-y divide-border/80 overflow-hidden">
            {upcoming.map((l, i) => (
              <li
                key={l.id}
                className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-display w-6 text-sm text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-medium">{l.title || "Занятие"}</p>
                    <p className="text-sm text-muted-foreground">
                      {l.groupId
                        ? (data.groups.find((g) => g.id === l.groupId)?.title ??
                          "—")
                        : "Индивидуал"}
                    </p>
                  </div>
                </div>
                <p className="pl-9 text-sm text-muted-foreground sm:pl-0">
                  {formatDateTime(l.startsAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
