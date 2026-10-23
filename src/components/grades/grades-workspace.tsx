"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentReviewDialog } from "@/components/tests/assignment-review-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime } from "@/lib/format";
import { nearestUpcomingLesson, sortStudentsByUpcomingLesson } from "@/lib/grades-sort";
import { hasPendingManual } from "@/lib/tests/grading";
import { gradeWorkLabel } from "@/lib/theory/work-kind";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

export function GradesWorkspace() {
  const { data, studentsForTeacher, lessonsForTeacher } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState<HomeworkAssignment | null>(null);
  const now = useMemo(() => new Date(), []);

  const students = useMemo(() => {
    const list = studentsForTeacher(teacherId).filter((s) =>
      query.trim()
        ? s.fullName.toLowerCase().includes(query.trim().toLowerCase())
        : true
    );
    return sortStudentsByUpcomingLesson(
      list,
      lessonsForTeacher(teacherId),
      now,
      data.attendances
    );
  }, [
    studentsForTeacher,
    lessonsForTeacher,
    teacherId,
    query,
    now,
    data.attendances,
  ]);

  const assignments = data.homeworkAssignments.filter(
    (a) => a.teacherId === teacherId
  );
  const lessons = lessonsForTeacher(teacherId);
  const pendingReview = assignments.filter(
    (a) => a.status === "completed" && hasPendingManual(a)
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Оценки"
        description="Домашние задания и тесты по теории. Сортировка учеников — по ближайшему будущему занятию."
      />
      {pendingReview > 0 ? (
        <p className="text-sm text-muted-foreground">
          Ожидают проверки:{" "}
          <span className="font-medium text-foreground">{pendingReview}</span>
        </p>
      ) : null}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по имени"
        className="max-w-xs"
      />
      {students.length === 0 ? (
        <EmptyState
          title="Учеников нет"
          description="Закрепите учеников за преподавателем, чтобы видеть оценки."
        />
      ) : (
        <ul className="space-y-2">
          {students.map((s) => {
            const next = nearestUpcomingLesson(lessons, s.id, now);
            const done = assignments
              .filter(
                (a) =>
                  a.studentId === s.id &&
                  (a.status === "completed" || a.status === "reviewed")
              )
              .sort((a, b) => {
                const ta = new Date(a.completedAt ?? a.reviewedAt ?? 0).getTime();
                const tb = new Date(b.completedAt ?? b.reviewedAt ?? 0).getTime();
                return tb - ta;
              });
            const lastTwo = done.slice(0, 2);
            const more = done.slice(2);
            const open = expanded[s.id];
            return (
              <li key={s.id} className="panel space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {next
                        ? `Ближайшее: ${formatDate(next.startsAt)} · ${formatTime(next.startsAt)}`
                        : "Нет предстоящих занятий"}
                    </p>
                  </div>
                </div>
                {lastTwo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Результатов ДЗ и теории пока нет
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {(open ? done : lastTwo).map((a) => {
                      const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                      const rawTitle =
                        a.theoryTitle || a.testSnapshot?.title || hw?.title || "Тест";
                      const title = gradeWorkLabel(
                        a.sourceKind === "theory" ? "theory" : "homework",
                        rawTitle
                      );
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted/50"
                            onClick={() => setReview(a)}
                          >
                            <span className="min-w-0 truncate">
                              {title}
                              <span className="text-muted-foreground">
                                {" "}
                                ·{" "}
                                {a.completedAt ? formatDate(a.completedAt) : "—"}
                              </span>
                            </span>
                            <span className="tabular-nums">
                              {pct(a.attempt2Percent ?? a.attempt1Percent ?? a.score)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {more.length > 0 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [s.id]: !open }))
                    }
                  >
                    {open ? "Свернуть" : `Ещё (${more.length})`}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AssignmentReviewDialog
        assignment={review}
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
      />
    </div>
  );
}
