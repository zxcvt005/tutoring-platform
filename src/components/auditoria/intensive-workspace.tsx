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
  const items = intensiveAssignmentsForStudent(data.currentStudentId);
  const learning = studentLearningLock(
    data.tariffAssignments,
    data.currentStudentId
  );

  return (
    <div className="space-y-4">
      {learning.locked ? <LearningLockedBanner message={learning.message} /> : null}
      <section className="auditoria-home-card py-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Интенсивы
        </h2>
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
            return (
              <li key={item.id}>
                <Link
                  href={learning.locked ? "#" : `/auditoria/intensivy/${item.id}`}
                  className="auditoria-home-card block space-y-1"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {progress.total === 0
                      ? "Тесты не назначены"
                      : `Пройдено ${progress.done} из ${progress.total}`}
                  </p>
                  <p className="text-sm text-muted-foreground">{deadlineText(item)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
