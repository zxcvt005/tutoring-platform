"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { TestTakeDialog } from "@/components/tests/test-take-dialog";
import { Button } from "@/components/ui/button";
import { formatDueAt } from "@/lib/format";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment, Topic } from "@/lib/types";
import { UNSECTIONED_ID } from "@/lib/types";
import { cn } from "@/lib/utils";

type StudyStatus = "not_started" | "in_progress" | "done";

const studyLabel: Record<StudyStatus, string> = {
  not_started: "Не начата",
  in_progress: "Изучается",
  done: "Пройдена",
};

function studyTone(status: StudyStatus) {
  if (status === "done") return "text-success";
  if (status === "in_progress") return "text-[oklch(0.45_0.08_55)]";
  return "text-muted-foreground";
}

export function AuditoriaLearningPanel() {
  const {
    data,
    lessonsForStudent,
    assignmentsForStudent,
    sectionsForTeacher,
    topicsForTeacher,
  } = useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const teacherId = student?.teacherId ?? "";
  const [openHw, setOpenHw] = useState<HomeworkAssignment | null>(null);

  const lessons = useMemo(
    () => lessonsForStudent(studentId),
    [lessonsForStudent, studentId]
  );
  const assignments = useMemo(
    () => assignmentsForStudent(studentId),
    [assignmentsForStudent, studentId]
  );
  const sections = useMemo(
    () => sectionsForTeacher(teacherId),
    [sectionsForTeacher, teacherId]
  );
  const topics = useMemo(
    () => topicsForTeacher(teacherId).filter((t) => t.status === "active"),
    [topicsForTeacher, teacherId]
  );

  function studyStatus(topic: Topic): StudyStatus {
    const hadLesson = lessons.some(
      (l) => l.status === "done" && l.topicId === topic.id
    );
    if (hadLesson) return "done";
    const related = assignments.filter((a) => a.topicId === topic.id);
    if (related.length > 0) return "in_progress";
    return "not_started";
  }

  const grouped = useMemo(() => {
    const bySection = new Map<string, Topic[]>();
    for (const section of sections) {
      bySection.set(section.id, []);
    }
    bySection.set(UNSECTIONED_ID, []);
    for (const topic of topics) {
      const key = topic.sectionId ?? UNSECTIONED_ID;
      const list = bySection.get(key) ?? [];
      list.push(topic);
      bySection.set(key, list);
    }
    return bySection;
  }, [sections, topics]);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  if (!teacherId) {
    return (
      <EmptyState
        title="Нет программы"
        description="Преподаватель ещё не назначен — темы появятся после назначения."
      />
    );
  }

  const sectionBlocks = [
    ...sections.map((s) => ({
      id: s.id,
      title: s.title,
      topics: grouped.get(s.id) ?? [],
    })),
    {
      id: UNSECTIONED_ID,
      title: "Без раздела",
      topics: grouped.get(UNSECTIONED_ID) ?? [],
    },
  ].filter((b) => b.topics.length > 0);

  return (
    <div>
      <PageHeader
        title="Обучение"
        description="Темы вашей программы, статус изучения и связанные домашние задания."
      />

      {sectionBlocks.length === 0 ? (
        <EmptyState
          title="Тем пока нет"
          description="Преподаватель ещё не добавил разделы и темы."
        />
      ) : (
        <div className="space-y-10">
          {sectionBlocks.map((block) => (
            <section key={block.id} className="space-y-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {block.title}
              </h2>
              <ul className="divide-y divide-border/70 border-y border-border/70">
                {block.topics.map((topic) => {
                  const status = studyStatus(topic);
                  const related = assignments
                    .filter((a) => a.topicId === topic.id)
                    .sort((a, b) => {
                      const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
                      const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
                      return ta - tb;
                    });
                  return (
                    <li key={topic.id} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-medium">{topic.title}</p>
                          {topic.description ? (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {topic.description}
                            </p>
                          ) : null}
                        </div>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            studyTone(status)
                          )}
                        >
                          {studyLabel[status]}
                        </p>
                      </div>

                      {related.length > 0 ? (
                        <ul className="mt-3 space-y-2 pl-0 sm:pl-1">
                          {related.map((a) => {
                            const hw = data.homeworks.find(
                              (h) => h.id === a.homeworkId
                            );
                            const qCount =
                              a.testSnapshot?.questions?.length ??
                              hw?.questions?.length ??
                              0;
                            const max =
                              a.maxScore ??
                              a.testSnapshot?.maxScore ??
                              hw?.maxScore;
                            return (
                              <li
                                key={a.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2.5"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    {getAssignmentTitle(a, hw)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDueAt(a.dueAt)}
                                    {qCount ? ` · ${qCount} вопр.` : ""}
                                    {max != null ? ` · до ${max} б.` : ""}
                                    {a.score != null
                                      ? ` · ${a.score}${max != null ? `/${max}` : ""}`
                                      : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <HomeworkAssignmentStatusBadge
                                    status={a.status}
                                    perspective="student"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl"
                                    onClick={() => setOpenHw(a)}
                                  >
                                    {a.status === "assigned" ||
                                    a.status === "overdue" ||
                                    a.status === "in_progress"
                                      ? "Выполнить"
                                      : "Открыть"}
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Нет назначенных ДЗ по этой теме.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TestTakeDialog
        assignment={openHw}
        open={!!openHw}
        onOpenChange={(o) => !o && setOpenHw(null)}
      />
    </div>
  );
}
