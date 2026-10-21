"use client";

import { useMemo, useState } from "react";

import { AuditoriaMonthCalendar } from "@/components/auditoria/month-calendar";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { LessonStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTime } from "@/lib/format";
import {
  AUDITORIA_UPCOMING_DAYS,
  filterUpcomingLessonsForAuditoria,
} from "@/lib/recurring-schedule";
import { useDemoStore } from "@/lib/store/demo-store";

export function AuditoriaSchedulePanel() {
  const { data, lessonsForStudent } = useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const [nowMs] = useState(() => new Date().getTime());

  const allLessons = useMemo(
    () => lessonsForStudent(studentId),
    [lessonsForStudent, studentId]
  );

  const { upcoming, past } = useMemo(() => {
    const clock = new Date(nowMs);
    const upcoming = filterUpcomingLessonsForAuditoria(allLessons, clock);
    const past = [...allLessons]
      .filter(
        (l) =>
          l.status === "done" ||
          l.status === "cancelled" ||
          (l.status === "planned" &&
            new Date(l.startsAt).getTime() < clock.getTime())
      )
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
    return { upcoming, past };
  }, [allLessons, nowMs]);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  function renderRows(
    list: typeof upcoming,
    emptyTitle: string
  ) {
    if (list.length === 0) {
      return <EmptyState title={emptyTitle} />;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Когда</TableHead>
            <TableHead>Преподаватель</TableHead>
            <TableHead>Тема / предмет</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((l) => {
            const teacher = data.teachers.find((t) => t.id === l.teacherId);
            const topic = l.topicId
              ? data.topics.find((t) => t.id === l.topicId)
              : null;
            return (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateTime(l.startsAt)}
                  <span className="text-muted-foreground">
                    {" "}
                    – {formatTime(l.endsAt)}
                  </span>
                </TableCell>
                <TableCell>{teacher?.fullName ?? "—"}</TableCell>
                <TableCell>
                  {topic?.title ?? l.subject ?? "—"}
                </TableCell>
                <TableCell>
                  <LessonStatusBadge status={l.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      <PageHeader
        title="Расписание"
        description={`Занятия ${student.fullName}: только ваши слоты, без чужих учеников.`}
      />

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Календарь месяца
        </h2>
        <AuditoriaMonthCalendar
          lessons={allLessons}
          studentId={studentId}
          attendances={data.attendances}
          teachers={data.teachers}
          topics={data.topics}
        />
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Предстоящие (ближайшие {AUDITORIA_UPCOMING_DAYS} дней)
        </h2>
        {renderRows(upcoming, "Нет предстоящих занятий в ближайшие 14 дней")}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Прошедшие
        </h2>
        {renderRows(past, "Пока нет прошедших занятий")}
      </section>
    </div>
  );
}
