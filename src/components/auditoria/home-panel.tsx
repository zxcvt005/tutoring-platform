"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CompactScheduleCard } from "@/components/auditoria/compact-schedule";
import {
  LessonRatingHomePrompt,
  type PendingLessonRating,
} from "@/components/auditoria/lesson-rating-form";
import { MyTariffBlock } from "@/components/auditoria/my-tariff-block";
import { AuditoriaTeacherCard } from "@/components/auditoria/teacher-card";
import { EmptyState } from "@/components/empty-state";
import { FormulaTrainerQuickCard } from "@/components/formula-trainer/quick-card";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import { StudentInviteBanners } from "@/components/video-calls/student-invite-banners";
import { TheoryNewMark } from "@/components/theory/theory-new-mark";
import { homeworkAssignedDateInfo, sortHomeworkForStudent } from "@/lib/homework-list";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { incompleteTheoryCount, newestIncompleteTheory } from "@/lib/theory/list";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { studentLearningLock } from "@/lib/learning-lock";
import { apiLessonRatingsGet } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";

export function AuditoriaHomePanel() {
  const { data, lessonsForStudent, assignmentsForStudent, theoryAssignmentsForStudent } =
    useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const learning = studentLearningLock(data.tariffAssignments, studentId);
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
  const [pendingRatings, setPendingRatings] = useState<PendingLessonRating[]>(
    []
  );

  useEffect(() => {
    let cancelled = false;
    void apiLessonRatingsGet<{ lessons: PendingLessonRating[] }>("pending")
      .then((data) => {
        if (!cancelled) setPendingRatings(data.lessons ?? []);
      })
      .catch(() => {
        if (!cancelled) setPendingRatings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

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
    <div className="space-y-5">
      <StudentInviteBanners />
      {pendingRatings.length > 0 ? (
        <LessonRatingHomePrompt
          lessons={pendingRatings}
          onRated={(lessonId) => {
            setPendingRatings((prev) =>
              prev.filter((item) => item.lessonId !== lessonId)
            );
          }}
        />
      ) : null}
      {learning.locked ? (
        <LearningLockedBanner message={learning.message} />
      ) : null}

      {latestTheory && theoryOpen > 0 && !learning.locked ? (
        <section className="auditoria-home-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
                <TheoryNewMark />
                Новая теория
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {latestTheory.title}
                {theoryOpen > 1 ? ` · ещё ${theoryOpen - 1}` : ""}
              </p>
            </div>
            <Link
              href={`/auditoria/theory/${latestTheory.id}`}
              className="shrink-0 text-sm text-foreground/80 hover:text-foreground hover:underline"
            >
              Открыть →
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AuditoriaTeacherCard teacher={teacher ?? null} compact />
        <MyTariffBlock studentId={studentId} compact featured />
      </div>

      {(data.availableProductSlugs ?? []).includes(FORMULA_TRAINER_PRODUCT_SLUG) ? (
        <FormulaTrainerQuickCard />
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <CompactScheduleCard
            lessons={lessons}
            studentId={studentId}
            attendances={data.attendances}
            now={now}
          />
        </div>

        <section className="auditoria-home-card min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Актуальные задания
            </h2>
            <Link
              href="/auditoria/homework"
              className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              Все домашние задания →
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Нет заданий, которые требуют внимания. Завершённые работы — в
              разделе «Домашние задания».
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {attention.map((a) => {
                const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                const assigned = homeworkAssignedDateInfo(a, lessons);
                const overdue = Boolean(a.missedNextLesson);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/auditoria/homework/${a.id}`}
                      className={cn(
                        "block rounded-2xl border border-[#f2d7d9] bg-pastel-rose px-4 py-3 hover:bg-[#f8e0e2]",
                        overdue && "border-destructive/40"
                      )}
                    >
                      <p className="min-w-0 font-display text-base font-semibold tracking-tight">
                        {getAssignmentTitle(a, hw)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
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
