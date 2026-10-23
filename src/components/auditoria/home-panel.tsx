"use client";

import Link from "next/link";
import { useMemo } from "react";

import { CompactScheduleCard } from "@/components/auditoria/compact-schedule";
import { MyTariffBlock } from "@/components/auditoria/my-tariff-block";
import { AuditoriaTeacherCard } from "@/components/auditoria/teacher-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { homeworkAssignedDateInfo, sortHomeworkForStudent } from "@/lib/homework-list";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { incompleteTheoryCount, newestIncompleteTheory } from "@/lib/theory/list";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function AuditoriaHomePanel() {
  const { data, lessonsForStudent, assignmentsForStudent, theoryAssignmentsForStudent } =
    useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const teacher = data.teachers.find((t) => t.id === student?.teacherId);

  const lessons = useMemo(
    () => lessonsForStudent(studentId),
    [lessonsForStudent, studentId]
  );
  const assignments = useMemo(
    () => assignmentsForStudent(studentId),
    [assignmentsForStudent, studentId]
  );
  const now = useMemo(() => new Date(), []);

  const { missed, incomplete } = useMemo(
    () => sortHomeworkForStudent(assignments, lessons),
    [assignments, lessons]
  );
  const attention = [...missed, ...incomplete];
  const theoryItems = theoryAssignmentsForStudent(studentId);
  const theoryOpen = incompleteTheoryCount(theoryItems);
  const latestTheory = newestIncompleteTheory(theoryItems);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={`Здравствуйте, ${student.fullName.split(" ")[0]}`} />

      {latestTheory && theoryOpen > 0 ? (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Новая теория</p>
              <p className="truncate text-sm text-muted-foreground">
                {latestTheory.title}
                {theoryOpen > 1 ? ` · ещё ${theoryOpen - 1}` : ""}
              </p>
            </div>
            <Link
              href={`/auditoria/theory/${latestTheory.id}`}
              className="text-sm hover:underline"
            >
              Открыть
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <AuditoriaTeacherCard teacher={teacher ?? null} compact />
        <MyTariffBlock studentId={studentId} compact />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <CompactScheduleCard
            lessons={lessons}
            studentId={studentId}
            attendances={data.attendances}
            now={now}
          />
        </div>

        <section className="min-w-0 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Актуальные задания
            </h2>
            <Link
              href="/auditoria/homework"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Все домашние задания →
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Нет заданий, которые требуют внимания. Завершённые работы — в
              разделе «Домашние задания».
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {attention.map((a) => {
                const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                const assigned = homeworkAssignedDateInfo(a, lessons);
                const overdue = Boolean(a.missedNextLesson);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/auditoria/homework/${a.id}`}
                      className={cn(
                        "block rounded-xl border border-border/70 px-3 py-2.5 hover:bg-muted/40",
                        overdue &&
                          "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/25"
                      )}
                    >
                      <p className="min-w-0 font-medium">
                        {getAssignmentTitle(a, hw)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {assigned.label}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
