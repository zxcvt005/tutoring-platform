"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { TheoryAssignmentStatusBadge } from "@/components/status-badge";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { formatDate } from "@/lib/format";
import { studentLearningLock } from "@/lib/learning-lock";
import { useDemoStore } from "@/lib/store/demo-store";
import {
  groupStudentTheories,
  studentTheoryMaterialChips,
  studentTheorySection,
  theoryPackageCountLabel,
} from "@/lib/theory/list";
import type { HomeworkAssignment, TheoryAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

const chipTone = {
  video: "border-[#d3e6f4] bg-pastel-blue/80",
  test: "border-[#d5eadc] bg-pastel-mint",
  file: "border-[#eadcc8] bg-pastel-beige",
} as const;

export function StudentTheoryWorkspace() {
  const { data, theoryAssignmentsForStudent } = useDemoStore();
  const items = theoryAssignmentsForStudent(data.currentStudentId);
  const ordered = groupStudentTheories(items).flatMap((section) => section.items);
  const learning = studentLearningLock(
    data.tariffAssignments,
    data.currentStudentId
  );

  return (
    <div className="space-y-5">
      {learning.locked ? (
        <LearningLockedBanner message={learning.message} />
      ) : null}

      <section className="auditoria-home-card flex flex-wrap items-center gap-3 py-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Ваши материалы
        </h2>
        <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-sm text-foreground/80">
          {theoryPackageCountLabel(items.length)}
        </span>
      </section>

      {ordered.length === 0 ? (
        <EmptyState
          title="Теории пока нет"
          description="Когда преподаватель отправит материал, он появится здесь."
        />
      ) : (
        <ul className="space-y-4">
          {ordered.map((item) => (
            <li key={item.id}>
              <TheoryPackageCard
                item={item}
                questionCount={questionCountFor(data.homeworkAssignments, item)}
                locked={learning.locked}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function questionCountFor(
  assignments: HomeworkAssignment[],
  item: TheoryAssignment
): number | null {
  if (!item.testAssignmentId) return null;
  const linked = assignments.find((row) => row.id === item.testAssignmentId);
  const count = linked?.testSnapshot?.questions?.length ?? 0;
  return count > 0 ? count : null;
}

function TheoryPackageCard({
  item,
  questionCount,
  locked,
}: {
  item: TheoryAssignment;
  questionCount: number | null;
  locked: boolean;
}) {
  const chips = studentTheoryMaterialChips({
    videoUrl: item.videoUrl,
    hasTest: item.hasTest,
    files: item.files,
    questionCount,
  });
  const isNew = studentTheorySection(item.status) === "new";
  const mark = isNew ? (
    <span className="rounded-full bg-pastel-mint px-2.5 py-1 text-xs text-[#3f6b52]">
      Новое
    </span>
  ) : (
    <TheoryAssignmentStatusBadge status={item.status} />
  );
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          {item.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Назначено {formatDate(item.assignedAt)}
          {locked ? " · недоступно до продления тарифа" : ""}
        </p>
        {item.description ? (
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
            {item.description}
          </p>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-2 lg:flex-1">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className={cn(
                "w-full rounded-2xl border px-3 py-2.5 sm:w-auto sm:min-w-40",
                chipTone[chip.tone]
              )}
            >
              <p className="font-medium">{chip.title}</p>
              {chip.detail ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{chip.detail}</p>
              ) : null}
              <p className="mt-1 text-xs text-[#3f6b52]">Доступно</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        {mark}
        <span className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-blue px-4 text-sm text-foreground">
          Открыть материалы →
        </span>
      </div>
    </>
  );
  const className =
    "auditoria-home-card flex flex-col items-stretch gap-4 lg:flex-row lg:items-center";

  if (locked) {
    return <div className={cn(className, "opacity-80")}>{body}</div>;
  }

  return (
    <Link href={`/auditoria/theory/${item.id}`} className={className}>
      {body}
    </Link>
  );
}
