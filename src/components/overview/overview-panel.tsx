"use client";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ResultStatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

function TextLink({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-full px-3 text-[0.8rem] font-medium transition-colors",
        variant === "default"
          ? "bg-primary text-primary-foreground hover:bg-primary/85"
          : "border border-border bg-background hover:bg-muted"
      )}
    >
      {children}
    </Link>
  );
}

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
  const base = mode === "direkciya" ? "/direkciya" : "/kafedra";

  const lessons =
    mode === "kafedra" ? lessonsForTeacher(teacherId) : data.lessons;
  const results =
    mode === "kafedra" ? resultsForTeacher(teacherId) : data.results;

  const upcoming = [...lessons]
    .filter((l) => l.status === "planned")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, mode === "kafedra" ? 4 : 6);

  const nextLesson = upcoming[0];

  const actionResults = [...results]
    .filter((r) => r.status === "submitted" || r.status === "overdue")
    .sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      return 0;
    })
    .slice(0, 5);

  const pendingResults = results.filter(
    (r) => r.status === "submitted" || r.status === "pending"
  ).length;
  const overdue = results.filter((r) => r.status === "overdue").length;
  const submitted = results.filter((r) => r.status === "submitted").length;

  const networkStats =
    mode === "direkciya"
      ? [
          {
            label: "Ученики",
            value: data.students.length,
            href: `${base}/students`,
          },
          {
            label: "Преподаватели",
            value: data.teachers.length,
            href: `${base}/teachers`,
          },
          {
            label: "Группы",
            value: data.groups.length,
            href: `${base}/groups`,
          },
          {
            label: "Задания",
            value: data.assignments.length,
            href: `${base}/assignments`,
          },
        ]
      : [
          {
            label: "Ученики",
            value: studentsForTeacher(teacherId).length,
            href: `${base}/students`,
          },
          {
            label: "Группы",
            value: groupsForTeacher(teacherId).length,
            href: `${base}/students`,
          },
          {
            label: "Занятия",
            value: lessonsForTeacher(teacherId).length,
            href: `${base}/schedule`,
          },
          {
            label: "Задания",
            value: assignmentsForTeacher(teacherId).length,
            href: `${base}/assignments`,
          },
        ];

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader
        title={mode === "direkciya" ? "Обзор дирекции" : "Обзор кафедры"}
        description={
          mode === "kafedra"
            ? `Рабочее место: ${teacher?.fullName ?? "—"}. Очередь проверки, ближайшие занятия и действия.`
            : "Контроль сети: проблемные результаты, масштаб и ближайшие занятия."
        }
      />

      {mode === "direkciya" ? (
        <>
          {/* Иерархия: внимание → масштаб → расписание */}
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.75fr)]">
            <div className="panel overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Контроль
                  </p>
                  <h2 className="font-display mt-1 text-[1.65rem] font-semibold tracking-tight">
                    Требует внимания
                  </h2>
                </div>
                <TextLink href={`${base}/results`} variant="outline">
                  Все результаты
                </TextLink>
              </div>
              <div className="grid sm:grid-cols-[1.1fr_0.9fr]">
                <Link
                  href={`${base}/results`}
                  className="surface-sky flex flex-col justify-between gap-6 px-5 py-6 transition-opacity hover:opacity-95"
                >
                  <span className="text-sm text-foreground/70">
                    В очереди проверки или сдачи
                  </span>
                  <span className="font-display text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                    {pendingResults}
                  </span>
                </Link>
                <div className="grid grid-rows-2">
                  <Link
                    href={`${base}/results`}
                    className="flex items-end justify-between gap-3 border-b border-border/70 px-5 py-4 transition-colors hover:bg-muted/35"
                  >
                    <span className="text-sm text-muted-foreground">
                      Сдано, ждут оценку
                    </span>
                    <span className="font-display text-3xl font-semibold tabular-nums">
                      {submitted}
                    </span>
                  </Link>
                  <Link
                    href={`${base}/results`}
                    className="flex items-end justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/35"
                  >
                    <span className="text-sm text-muted-foreground">
                      Просрочено
                    </span>
                    <span
                      className={cn(
                        "font-display text-3xl font-semibold tabular-nums",
                        overdue > 0 ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {overdue}
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="panel flex flex-col overflow-hidden">
              <div className="border-b border-border/70 px-4 py-3">
                <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Масштаб сети
                </p>
              </div>
              <ul className="flex flex-1 flex-col divide-y divide-border/70">
                {networkStats.map((s) => (
                  <li key={s.label} className="flex-1">
                    <Link
                      href={s.href}
                      className="flex h-full items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/35"
                    >
                      <span className="text-sm text-muted-foreground">
                        {s.label}
                      </span>
                      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">
                        {s.value}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.75fr)]">
            <UpcomingBlock
              upcoming={upcoming}
              data={data}
              href={`${base}/schedule`}
            />
            <aside className="panel-soft surface-sand flex flex-col gap-3 p-5">
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Быстрые разделы
              </p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["Ученики", `${base}/students`],
                    ["Преподаватели", `${base}/teachers`],
                    ["Группы", `${base}/groups`],
                    ["Задания", `${base}/assignments`],
                  ] as const
                ).map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-xl bg-background/70 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-background"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </aside>
          </section>
        </>
      ) : (
        <>
          {/* Кафедра: действия + ближайшее занятие + очередь */}
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="panel-soft surface-sand overflow-hidden p-5 sm:p-6">
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Сегодня у преподавателя
              </p>
              <h2 className="font-display mt-1 text-[1.7rem] font-semibold tracking-tight">
                {teacher?.fullName ?? "Преподаватель"}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {submitted > 0 || overdue > 0
                  ? `К оценке: ${submitted}. Просрочено: ${overdue}.`
                  : "Нет срочных работ на оценку — можно готовиться к занятиям."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <TextLink href={`${base}/results`}>Открыть результаты</TextLink>
                <TextLink href={`${base}/schedule`} variant="outline">
                  Расписание
                </TextLink>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {networkStats.map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-muted-foreground">{s.label}</dt>
                    <dd className="font-display text-xl font-semibold tabular-nums">
                      <Link href={s.href} className="hover:underline">
                        {s.value}
                      </Link>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="panel flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Действия
                  </p>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Что сделать сейчас
                  </h2>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums">
                  {actionResults.length}
                </span>
              </div>
              {actionResults.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground">
                  Очередь пуста — можно отметить посещаемость на ближайшем
                  занятии.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {actionResults.map((r) => {
                    const assignment = data.assignments.find(
                      (a) => a.id === r.assignmentId
                    );
                    const student = data.students.find(
                      (s) => s.id === r.studentId
                    );
                    return (
                      <li key={r.id}>
                        <Link
                          href={`${base}/results`}
                          className="flex flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {assignment?.title ?? "Задание"}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {student?.fullName ?? "Ученик"}
                            </p>
                          </div>
                          <ResultStatusBadge status={r.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            {nextLesson ? (
              <div className="panel-soft surface-sky flex flex-col justify-between gap-4 p-5">
                <div>
                  <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Ближайшее занятие
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight">
                    {nextLesson.title || "Занятие"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {nextLesson.groupId
                      ? (data.groups.find((g) => g.id === nextLesson.groupId)
                          ?.title ?? "—")
                      : "Индивидуал"}
                  </p>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p className="font-display text-lg font-medium tabular-nums">
                    {formatDateTime(nextLesson.startsAt)}
                  </p>
                  <TextLink href={`${base}/schedule`}>Посещаемость</TextLink>
                </div>
              </div>
            ) : (
              <div className="panel flex items-center px-5 py-8 text-sm text-muted-foreground">
                Нет запланированных занятий.
              </div>
            )}

            <UpcomingBlock
              upcoming={upcoming.slice(nextLesson ? 1 : 0)}
              data={data}
              href={`${base}/schedule`}
              title="Дальше по расписанию"
            />
          </section>
        </>
      )}
    </div>
  );
}

function UpcomingBlock({
  upcoming,
  data,
  href,
  title = "Ближайшие занятия",
}: {
  upcoming: {
    id: string;
    title?: string;
    groupId?: string | null;
    startsAt: string;
  }[];
  data: {
    groups: { id: string; title: string }[];
  };
  href: string;
  title?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">Список, не календарь</p>
        </div>
        <TextLink href={href} variant="outline">
          К расписанию
        </TextLink>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет следующих занятий.</p>
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
    </div>
  );
}
