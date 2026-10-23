"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TheoryAssignmentStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { groupStudentTheories } from "@/lib/theory/list";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function StudentTheoryWorkspace() {
  const { data, theoryAssignmentsForStudent } = useDemoStore();
  const items = theoryAssignmentsForStudent(data.currentStudentId);
  const sections = groupStudentTheories(items);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Теория"
        description="Материалы, которые преподаватель отправил вам: видео, конспекты и тесты."
      />
      {items.length === 0 ? (
        <EmptyState
          title="Теории пока нет"
          description="Когда преподаватель отправит материал, он появится здесь."
        />
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.key} className="space-y-2">
              <h2 className="text-sm font-semibold">{section.title}</h2>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/auditoria/theory/${item.id}`}
                      className={cn(
                        "block rounded-xl border border-border/70 px-3 py-2.5 hover:bg-muted/40",
                        (item.status === "assigned" ||
                          item.status === "viewed" ||
                          item.status === "in_progress") &&
                          "border-primary/40 bg-primary/5"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Назначено {formatDate(item.assignedAt)}
                            {item.description
                              ? ` · ${item.description.slice(0, 80)}`
                              : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.hasTest ? "Есть тест" : "Без теста"}
                            {item.files.length > 0
                              ? ` · файлов: ${item.files.length}`
                              : ""}
                            {item.testPercent != null
                              ? ` · результат ${item.testPercent}%`
                              : ""}
                          </p>
                        </div>
                        <TheoryAssignmentStatusBadge status={item.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
