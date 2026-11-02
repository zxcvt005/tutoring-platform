"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  formatDate,
  studentHomeworkDisplayLabel,
} from "@/lib/format";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import { isHomeworkHistoryView } from "@/lib/learning-lock";
import { cn } from "@/lib/utils";

/**
 * В демо не открываем вопросы и ключи.
 * Можно отметить задание выполненным локально.
 */
export function StudentTourHomeworkDemoPanel() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, submitHomeworkAssignment } = useDemoStore();
  const href = useStudentCabinetHref();
  const assignment = data.homeworkAssignments.find((a) => a.id === id);
  const hw = data.homeworks.find((h) => h.id === assignment?.homeworkId);
  const topic = data.topics.find((t) => t.id === hw?.topicId);
  const section = data.topicSections.find((s) => s.id === hw?.sectionId);
  const teacher =
    data.teachers.find((t) => t.id === assignment?.teacherId)?.fullName ??
    "Преподаватель";
  const done = assignment
    ? isHomeworkHistoryView(assignment.status)
    : false;
  const exerciseCount =
    hw?.questionCount ??
    assignment?.maxScore ??
    assignment?.testSnapshot?.maxScore ??
    null;

  if (!assignment) {
    return (
      <EmptyState
        title="Задание не найдено"
        description="В демо доступны только учебные карточки Артёма."
      />
    );
  }

  return (
    <section className="auditoria-home-card mx-auto max-w-2xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Демонстрационный режим
      </p>
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight">
        {getAssignmentTitle(assignment, hw)}
      </h1>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Meta
          label="Тема физики"
          value={topic?.title ?? section?.title ?? "Физика"}
        />
        <Meta
          label="Статус"
          value={studentHomeworkDisplayLabel(
            assignment.status,
            assignment.missedNextLesson
          )}
        />
        <Meta
          label="Выдано"
          value={
            assignment.assignedAt ? formatDate(assignment.assignedAt) : "—"
          }
        />
        <Meta
          label="Дедлайн"
          value={assignment.dueAt ? formatDate(assignment.dueAt) : "Без срока"}
        />
        <Meta label="Преподаватель" value={teacher} />
        <Meta
          label="Упражнений"
          value={exerciseCount != null ? String(exerciseCount) : "—"}
        />
      </dl>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
        {assignment.testSnapshot?.description ??
          hw?.description ??
          "Демонстрационное домашнее задание."}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Вопросы, ответы и разбор решений в демо не показываются. Так мы не
        раскрываем учебные материалы школы. Сам кабинет и список заданий можно
        изучить полностью.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!done ? (
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => void submitHomeworkAssignment(id, [], 1)}
          >
            Отметить выполненным
          </Button>
        ) : (
          <p className="inline-flex h-10 items-center rounded-full bg-pastel-mint/80 px-4 text-sm">
            Выполнено в демо
            {assignment.attempt1Percent != null
              ? ` · ${assignment.attempt1Percent}%`
              : ""}
          </p>
        )}
        <Link
          href={href("/homework")}
          className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}
        >
          К списку заданий
        </Link>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
