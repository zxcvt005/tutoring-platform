"use client";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function OverviewPanel({ mode }: { mode: "direkciya" | "kafedra" }) {
  if (mode === "kafedra") {
    return null; // Кафедра: отдельный day-home
  }

  return <DirekciyaOverview />;
}

function DirekciyaOverview() {
  const { data } = useDemoStore();

  const activeTeachers = data.teachers.filter((t) => t.status === "active").length;
  const activeStudents = data.students.filter((s) => s.status === "active").length;
  const unassigned = data.students.filter((s) => !s.teacherId).length;
  const planned = data.lessons.filter((l) => l.status === "planned").length;
  const done = data.lessons.filter((l) => l.status === "done").length;

  const needsAttention = data.homeworkAssignments.filter(
    (a) =>
      a.sourceKind !== "theory" &&
      (a.status === "completed" || a.status === "overdue")
  );
  const completed = needsAttention.filter((a) => a.status === "completed").length;
  const overdue = needsAttention.filter((a) => a.status === "overdue").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Обзор дирекции"
        description="Состояние сети и ситуации, которые требуют внимания администратора."
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.75fr)]">
        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Контроль
              </p>
              <h2 className="font-display mt-1 text-[1.65rem] font-semibold tracking-tight">
                Требует внимания
              </h2>
            </div>
            <Link
              href="/direkciya/results"
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              К результатам →
            </Link>
          </div>
          <div className="grid sm:grid-cols-[1.15fr_0.85fr]">
            <div className="surface-sky flex flex-col justify-between gap-4 px-5 py-6">
              <span className="text-sm text-foreground/70">
                Выполнено и ждёт проверки, либо просрочено
              </span>
              <span className="font-display text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                {needsAttention.length}
              </span>
            </div>
            <div className="grid grid-rows-2">
              <div className="flex items-end justify-between gap-3 border-b border-border/70 px-5 py-4">
                <span className="text-sm text-muted-foreground">К проверке</span>
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {completed}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3 px-5 py-4">
                <span className="text-sm text-muted-foreground">Просрочено</span>
                <span
                  className={cn(
                    "font-display text-3xl font-semibold tabular-nums",
                    overdue > 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {overdue}
                </span>
              </div>
            </div>
          </div>
          {needsAttention.length > 0 ? (
            <ul className="divide-y divide-border/70 border-t border-border/70">
              {needsAttention.slice(0, 4).map((a) => {
                const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                const student = data.students.find((s) => s.id === a.studentId);
                const teacher = data.teachers.find((t) => t.id === a.teacherId);
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{hw?.title ?? "Задание"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {student?.fullName ?? "Ученик"} · {teacher?.fullName ?? "—"}
                      </p>
                    </div>
                    <HomeworkAssignmentStatusBadge status={a.status} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground">
              Критичных ситуаций нет.
            </p>
          )}
        </div>

        <div className="panel flex flex-col overflow-hidden">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Сеть
            </p>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Сводка
            </h2>
          </div>
          <ul className="flex flex-1 flex-col divide-y divide-border/70">
            {(
              [
                ["Активные преподаватели", activeTeachers, "/direkciya/teachers"],
                ["Активные ученики", activeStudents, "/direkciya/students"],
                ["Без преподавателя", unassigned, "/direkciya/students"],
                ["Занятий запланировано", planned, "/direkciya/schedule"],
                ["Занятий проведено", done, "/direkciya/schedule"],
              ] as const
            ).map(([label, value, href]) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/35"
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span
                    className={cn(
                      "font-display text-2xl font-semibold tabular-nums",
                      label === "Без преподавателя" && value > 0
                        ? "text-destructive"
                        : ""
                    )}
                  >
                    {value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
