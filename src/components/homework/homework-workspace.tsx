"use client";

import Link from "next/link";
import { useMemo } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  homeworkAssignedDateInfo,
  isMissedHomework,
  isNewHomework,
  sortHomeworkForStudent,
} from "@/lib/homework-list";
import { studentHomeworkStats } from "@/lib/tests/attempts";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

function pctLabel(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

export function HomeworkWorkspace() {
  const { data, assignmentsForStudent, lessonsForStudent } = useDemoStore();
  const studentId = data.currentStudentId;
  const all = assignmentsForStudent(studentId);
  const lessons = lessonsForStudent(studentId);

  const stats = useMemo(() => studentHomeworkStats(all), [all]);
  const { overdue, newItems, incomplete, completed } = useMemo(
    () => sortHomeworkForStudent(all, lessons),
    [all, lessons]
  );

  const sections = [
    {
      key: "overdue",
      title: "Просроченные",
      items: overdue,
      accent: true as const,
    },
    { key: "new", title: "Новые", items: newItems, accent: false as const },
    {
      key: "incomplete",
      title: "Незавершённые",
      items: incomplete,
      accent: false as const,
    },
    {
      key: "completed",
      title: "Завершённые",
      items: completed,
      accent: false as const,
    },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Домашние задания"
        description="Назначенные тесты, попытки и результаты."
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label="Выполнено" value={String(stats.completedCount)} />
        <StatCard
          label="Средний результат 1-й попытки"
          value={pctLabel(stats.avgAttempt1)}
        />
        <StatCard
          label="Средний результат 2-й попытки"
          value={pctLabel(stats.avgAttempt2)}
        />
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="Домашних заданий нет"
          description="Когда преподаватель назначит тест, он появится здесь."
        />
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.key} className="space-y-2">
              {section.accent ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3">
                  <p className="text-sm font-medium">{section.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Не выполнено к следующему занятию — можно продолжить с
                    сохранёнными ответами.
                  </p>
                </div>
              ) : (
                <h2 className="text-sm font-semibold">{section.title}</h2>
              )}
              <HomeworkList
                items={section.items}
                lessons={lessons}
                homeworks={data.homeworks}
                sections={data.topicSections}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkList({
  items,
  lessons,
  homeworks,
  sections,
}: {
  items: HomeworkAssignment[];
  lessons: Lesson[];
  homeworks: { id: string; title: string; sectionId?: string | null }[];
  sections: { id: string; title: string }[];
}) {
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const hw = homeworks.find((h) => h.id === a.homeworkId);
        const title = a.testSnapshot?.title || hw?.title || "Тест";
        const section = sections.find((s) => s.id === hw?.sectionId);
        const assigned = homeworkAssignedDateInfo(a, lessons);
        const missed = isMissedHomework(a);
        const isNew = isNewHomework(a);
        return (
          <li key={a.id}>
            <Link
              href={`/auditoria/homework/${a.id}`}
              className={cn(
                "panel flex flex-col gap-1 p-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between",
                missed &&
                  "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/30",
                isNew && "ring-1 ring-primary/40"
              )}
            >
              <div className="min-w-0">
                <p className="font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">
                  {section?.title ? `${section.title} · ` : ""}
                  {assigned.label}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  1-я: {pctLabel(a.attempt1Percent)} · 2-я:{" "}
                  {pctLabel(a.attempt2Percent)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
