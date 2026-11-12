"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LayoutGrid,
  Target,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { HomeworkMotivationCard } from "@/components/homework/homework-motivation-card";
import { HomeworkProgressRings } from "@/components/homework/homework-progress-rings";
import { MockExamChartCard } from "@/components/mock-exams/mock-exam-chart-card";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { formatInAppZone } from "@/lib/app-time";
import {
  homeworkBoardForStudent,
  type HomeworkBoardFilter,
  type HomeworkBoardKey,
} from "@/lib/homework-list";
import { isHomeworkHistoryView, studentLearningLock } from "@/lib/learning-lock";
import { studentHomeworkRingStats } from "@/lib/tests/attempts";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import type { HomeworkAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

function pctLabel(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

function dueLabel(dueAt?: string) {
  if (!dueAt) return "Без срока";
  return `До ${formatInAppZone(dueAt, { day: "numeric", month: "short" })}`;
}

const filters: {
  key: HomeworkBoardFilter;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { key: "all", label: "Все задания", icon: LayoutGrid },
  { key: "assigned", label: "Назначенные", icon: CalendarDays },
  { key: "overdue", label: "Просроченные", icon: Clock3 },
  { key: "completed", label: "Завершённые", icon: CheckCircle2 },
];

export function HomeworkWorkspace() {
  const { data, assignmentsForStudent, lessonsForStudent } = useDemoStore();
  const href = useStudentCabinetHref();
  const studentId = data.currentStudentId;
  const all = assignmentsForStudent(studentId);
  const lessons = lessonsForStudent(studentId);
  const learning = studentLearningLock(data.tariffAssignments, studentId);
  const [filter, setFilter] = useState<HomeworkBoardFilter>("all");

  const stats = useMemo(() => studentHomeworkRingStats(all), [all]);
  const board = useMemo(
    () => homeworkBoardForStudent(all, lessons),
    [all, lessons]
  );
  const counts: Record<HomeworkBoardFilter, number> = {
    all: board.overdue.length + board.assigned.length + board.completed.length,
    assigned: board.assigned.length,
    overdue: board.overdue.length,
    completed: board.completed.length,
  };
  const [open, setOpen] = useState(() => ({
    overdue: true,
    assigned: true,
    completed: board.completed.length < 4,
  }));

  const sections: {
    key: HomeworkBoardKey;
    title: string;
    items: HomeworkAssignment[];
  }[] = [
    { key: "overdue", title: "Просроченные", items: board.overdue },
    { key: "assigned", title: "Назначенные", items: board.assigned },
    { key: "completed", title: "Завершённые", items: board.completed },
  ];
  const visible = sections.filter(
    (section) => filter === "all" || filter === section.key
  );

  return (
    <div className="space-y-5">
      {learning.locked ? (
        <LearningLockedBanner message={learning.message} />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="auditoria-home-card flex flex-col">
          <HomeworkProgressRings
            embedded
            stats={stats}
            totalCount={counts.all}
            className="w-full"
          />
          <HomeworkMotivationCard
            percent={stats.finalPercent}
            className="mt-8"
          />
        </section>
        <MockExamChartCard
          exams={data.mockExams}
          results={data.mockExamResults}
          studentId={studentId}
        />
      </div>

      <section className="auditoria-home-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-pastel-beige text-foreground/80">
            <Target className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Отработка ошибок</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Персональный банк заданий, в которых были ошибки.
            </p>
          </div>
        </div>
        <Link
          href={href("/homework/errors")}
          className="inline-flex h-10 items-center rounded-full bg-pastel-beige px-4 text-sm"
        >
          Открыть
        </Link>
      </section>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => {
          const active = filter === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors motion-reduce:transition-none",
                active
                  ? "border-transparent bg-pastel-blue text-foreground"
                  : "border-black/10 bg-auditoria-surface text-foreground/75 hover:bg-auditoria-surface",
                !active && item.key === "overdue" && counts.overdue > 0
                  ? "text-[#8a5a60]"
                  : null,
                !active && item.key === "completed" && counts.completed > 0
                  ? "text-[#3f6b52]"
                  : null
              )}
              onClick={() => setFilter(item.key)}
            >
              <Icon className="size-4" />
              {item.label}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                  active ? "bg-auditoria-surface" : "bg-black/5"
                )}
              >
                {counts[item.key]}
              </span>
            </button>
          );
        })}
      </div>

      {counts.all === 0 ? (
        <EmptyState
          title="Домашних заданий нет"
          description="Когда преподаватель назначит тест, он появится здесь."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((section) => (
            <HomeworkSection
              key={section.key}
              title={section.title}
              count={section.items.length}
              tone={section.key}
              open={open[section.key]}
              onToggle={() =>
                setOpen((prev) => ({
                  ...prev,
                  [section.key]: !prev[section.key],
                }))
              }
              items={section.items}
              homeworks={data.homeworks}
              locked={learning.locked}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkSection({
  title,
  count,
  tone,
  open,
  onToggle,
  items,
  homeworks,
  locked,
}: {
  title: string;
  count: number;
  tone: HomeworkBoardKey;
  open: boolean;
  onToggle: () => void;
  items: HomeworkAssignment[];
  homeworks: { id: string; title: string; description?: string | null }[];
  locked: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border",
        tone === "overdue" && "border-[#f2d7d9] bg-pastel-rose/45",
        tone === "assigned" && "border-black/10 bg-auditoria-surface",
        tone === "completed" && "border-[#d5eadc] bg-pastel-mint/40"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="font-display text-lg font-semibold tracking-tight">
          {title}
          <span className="text-muted-foreground"> · {count}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {count === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              В этой категории заданий нет.
            </p>
          ) : (
            <ul className="space-y-2 px-3 pb-3">
              {items.map((assignment) => (
                <HomeworkRow
                  key={assignment.id}
                  assignment={assignment}
                  tone={tone}
                  homeworks={homeworks}
                  locked={locked}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function HomeworkRow({
  assignment,
  tone,
  homeworks,
  locked,
}: {
  assignment: HomeworkAssignment;
  tone: HomeworkBoardKey;
  homeworks: { id: string; title: string; description?: string | null }[];
  locked: boolean;
}) {
  const href = useStudentCabinetHref();
  const hw = homeworks.find((item) => item.id === assignment.homeworkId);
  const title = assignment.testSnapshot?.title || hw?.title || "Тест";
  const description =
    assignment.testSnapshot?.description?.trim() || hw?.description?.trim() || "";
  const allowOpen = !locked || isHomeworkHistoryView(assignment.status);
  const action = tone === "completed" ? "Посмотреть" : "Перейти";
  const meta =
    tone === "overdue" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-auditoria-surface px-2.5 py-1 text-xs text-[#8a5a60]">
        <Clock3 className="size-3.5" />
        Просрочено
      </span>
    ) : tone === "completed" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-auditoria-surface px-2.5 py-1 text-xs text-[#3f6b52]">
        <CheckCircle2 className="size-3.5" />
        Выполнено
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-2.5 py-1 text-xs text-foreground/80">
        <CalendarDays className="size-3.5" />
        {dueLabel(assignment.dueAt)}
      </span>
    );

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold tracking-tight">
          {title}
        </p>
        {description || (locked && !allowOpen) ? (
          <p className="truncate text-sm text-muted-foreground">
            {description}
            {locked && !allowOpen
              ? `${description ? " · " : ""}недоступно до продления тарифа`
              : ""}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {meta}
        <span className="text-sm tabular-nums text-muted-foreground">
          1-я: {pctLabel(assignment.attempt1Percent)} · 2-я:{" "}
          {pctLabel(assignment.attempt2Percent)}
        </span>
        <span className="inline-flex h-8 items-center rounded-full border border-black/10 bg-auditoria-surface px-3 text-sm">
          {allowOpen ? `${action} →` : "Закрыто"}
        </span>
      </div>
    </>
  );

  const className = cn(
    "flex flex-col gap-3 rounded-2xl border px-3 py-3 transition-colors motion-reduce:transition-none sm:flex-row sm:items-center",
    tone === "overdue" && "border-[#f2d7d9] bg-auditoria-surface hover:bg-auditoria-surface",
    tone === "assigned" && "border-black/10 bg-auditoria-surface hover:bg-pastel-blue/40",
    tone === "completed" && "border-[#d5eadc] bg-auditoria-surface hover:bg-auditoria-surface",
    !allowOpen && "opacity-70"
  );

  return (
    <li>
      {allowOpen ? (
        <Link
          href={href(`/homework/${assignment.id}`)}
          data-tour-homework-link=""
          className={className}
        >
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
