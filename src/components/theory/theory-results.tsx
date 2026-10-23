"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentReviewDialog } from "@/components/tests/assignment-review-dialog";
import { TheoryAssignmentStatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

export function TheoryResults({ materialId }: { materialId: string }) {
  const {
    data,
    theoriesForTeacher,
    theoryAssignmentsForTeacher,
    studentsForTeacher,
  } = useDemoStore();
  const material = theoriesForTeacher(data.currentTeacherId).find(
    (t) => t.id === materialId
  );
  const assignments = theoryAssignmentsForTeacher(data.currentTeacherId).filter(
    (a) => a.materialId === materialId
  );
  const students = studentsForTeacher(data.currentTeacherId);
  const [review, setReview] = useState<HomeworkAssignment | null>(null);

  const rows = useMemo(
    () =>
      assignments
        .map((a) => ({
          assignment: a,
          student: students.find((s) => s.id === a.studentId),
          test: a.testAssignmentId
            ? data.homeworkAssignments.find((h) => h.id === a.testAssignmentId)
            : null,
        }))
        .sort(
          (a, b) =>
            (a.student?.fullName ?? "").localeCompare(
              b.student?.fullName ?? "",
              "ru"
            )
        ),
    [assignments, students, data.homeworkAssignments]
  );

  if (!material) {
    return (
      <EmptyState
        title="Теория не найдена"
        description="Материал недоступен или принадлежит другому преподавателю."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={material.title}
        description="Кому отправлена теория и кто её прошёл."
        actions={
          <Link href="/kafedra/theory" className={buttonVariants({ variant: "outline" })}>
            К списку
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Ещё никому не отправлена"
          description="Назначьте материал ученикам из списка теорий."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ assignment, student, test }) => (
            <li key={assignment.id} className="panel flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{student?.fullName ?? "Ученик"}</p>
                <p className="text-xs text-muted-foreground">
                  Отправлена {formatDate(assignment.assignedAt)}
                  {assignment.completedAt
                    ? ` · завершена ${formatDate(assignment.completedAt)}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TheoryAssignmentStatusBadge status={assignment.status} />
                {assignment.testPercent != null ? (
                  <span className="text-sm tabular-nums">
                    {assignment.testPercent}%
                  </span>
                ) : null}
                {test ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setReview(test)}
                  >
                    Ответы
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AssignmentReviewDialog
        assignment={review}
        open={!!review}
        onOpenChange={(open) => !open && setReview(null)}
      />
    </div>
  );
}
