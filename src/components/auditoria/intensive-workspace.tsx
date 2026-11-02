"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { formatDueAt } from "@/lib/format";
import {
  intensiveDeadlineSummary,
  intensiveProgress,
} from "@/lib/intensives/progress";
import { studentLearningLock } from "@/lib/learning-lock";
import { useDemoStore } from "@/lib/store/demo-store";
import { useStudentCabinetHref } from "@/lib/student-tour/paths";
import type { IntensiveAssignment } from "@/lib/types";

function deadlineText(item: IntensiveAssignment): string {
  const summary = intensiveDeadlineSummary(item.tests);
  if (summary.kind === "none") return "Без тестов";
  if (summary.kind === "done") return "Все тесты сданы";
  if (summary.kind === "overdue") return `Просрочено · ${formatDueAt(summary.dueAt)}`;
  return `Ближайший дедлайн · ${formatDueAt(summary.dueAt)}`;
}

export function StudentIntensiveWorkspace() {
  const { data, intensiveAssignmentsForStudent } = useDemoStore();
  const href = useStudentCabinetHref();
  const items = intensiveAssignmentsForStudent(data.currentStudentId);
  const learning = studentLearningLock(
    data.tariffAssignments,
    data.currentStudentId
  );
  const teacherName =
    data.teachers.find((t) => t.id === data.currentTeacherId)?.fullName ??
    "Преподаватель";

  return (
    <div className="space-y-4">
      {learning.locked ? <LearningLockedBanner message={learning.message} /> : null}
      <section className="auditoria-home-card py-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Интенсивы
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} материалов · {teacherName}
        </p>
      </section>
      {items.length === 0 ? (
        <EmptyState
          title="Интенсивов пока нет"
          description="Когда преподаватель отправит интенсив, он появится здесь."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const progress = intensiveProgress(item.tests);
            const done =
              progress.total > 0 && progress.done === progress.total;
            const upcoming = progress.total === 0;
            return (
              <li key={item.id}>
                <Link
                  href={learning.locked ? "#" : href(`/intensivy/${item.id}`)}
                  className="auditoria-home-card block space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-display text-lg font-semibold tracking-tight">
                      {item.title}
                    </p>
                    <span className="rounded-full bg-pastel-blue/80 px-2.5 py-1 text-xs">
                      {done
                        ? "Завершён"
                        : upcoming
                          ? "Предстоящий / в записи"
                          : "В процессе"}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {progress.total === 0
                      ? "Тесты не назначены"
                      : `Пройдено ${progress.done} из ${progress.total}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {deadlineText(item)} · {teacherName}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
