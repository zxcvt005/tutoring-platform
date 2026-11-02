"use client";

import { useMemo } from "react";

import { StudentTourProblemTrainerCard } from "@/components/student-tour/problem-trainer";
import { formatDate, formatTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import { isHomeworkHistoryView } from "@/lib/learning-lock";

export function StudentTourHomeDashboard() {
  const { data, lessonsForStudent, assignmentsForStudent, theoryAssignmentsForStudent } =
    useDemoStore();
  const studentId = data.currentStudentId;
  const now = useMemo(() => new Date(), []);

  const lessons = lessonsForStudent(studentId);
  const assignments = assignmentsForStudent(studentId);
  const theories = theoryAssignmentsForStudent(studentId);

  const doneHw = assignments.filter((a) => isHomeworkHistoryView(a.status)).length;
  const present = data.attendances.filter(
    (a) => a.studentId === studentId && a.status === "present"
  ).length;
  const topicsDone = new Set(
    lessons
      .filter((l) => l.status === "done")
      .flatMap((l) => l.lessonTopics?.map((t) => t.title) ?? [])
  ).size;
  const nextLesson = lessons
    .filter((l) => new Date(l.startsAt).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];
  const theoryDone = theories.filter((t) => t.status === "completed").length;
  const openHw = assignments.filter((a) => !isHomeworkHistoryView(a.status)).length;

  return (
    <div className="space-y-5">
      <section className="auditoria-home-card">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Подготовка к ЕГЭ · физика
          </p>
          <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight">
            Прогресс Артёма
          </h2>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Домашних сдано" value={`${doneHw}/${assignments.length}`} />
          <Metric label="Тем на занятиях" value={String(topicsDone)} />
          <Metric label="Занятий посещено" value={String(present)} />
          <Metric label="Теории изучено" value={`${theoryDone}/${theories.length}`} />
        </dl>
        {nextLesson ? (
          <p className="mt-4 rounded-2xl bg-pastel-blue/70 px-4 py-3 text-sm">
            Ближайшее занятие:{" "}
            <span className="font-medium">
              {formatDate(nextLesson.startsAt)} · {formatTime(nextLesson.startsAt)}
            </span>
            {" — "}
            {nextLesson.lessonTopics?.[0]?.title ?? "Физика"}
          </p>
        ) : null}
        {openHw > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Открытых домашних заданий: {openHw}
          </p>
        ) : null}
      </section>

      <StudentTourProblemTrainerCard />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
