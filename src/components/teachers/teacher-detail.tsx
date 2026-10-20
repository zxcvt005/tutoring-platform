"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo } from "react";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { PageHeader } from "@/components/layout/page-header";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
  PersonStatusBadge,
  TeacherStatusBadge,
} from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDateTime,
  initialsFromName,
  teacherStatusLabel,
} from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";

export function TeacherDetail({ teacherId }: { teacherId: string }) {
  const {
    data,
    ready,
    studentsForTeacher,
    lessonsForTeacher,
    assignmentsForTeacher,
  } = useDemoStore();

  const teacher = data.teachers.find((t) => t.id === teacherId);
  const students = studentsForTeacher(teacherId);
  const lessons = useMemo(
    () =>
      lessonsForTeacher(teacherId).sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      ),
    [lessonsForTeacher, teacherId]
  );
  const assignments = assignmentsForTeacher(teacherId);

  const done = lessons.filter((l) => l.status === "done").length;
  const present = data.attendances.filter(
    (a) =>
      a.status === "present" &&
      lessons.some((l) => l.id === a.lessonId)
  ).length;
  const reviewed = assignments.filter((a) => a.status === "reviewed").length;
  const overdue = assignments.filter((a) => a.status === "overdue").length;

  if (ready && !teacher) notFound();
  if (!teacher) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={teacher.fullName}
        description={teacher.subjects.join(" · ") || "Преподаватель"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <EnterCabinetButton
              userId={teacher.userId}
              teacherId={teacher.id}
            />
            <Link
              href="/direkciya/teachers"
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              ← К списку
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="panel space-y-4 p-5">
          <div className="flex items-center gap-3">
            <span className="surface-sand flex size-14 items-center justify-center rounded-full font-display text-lg font-semibold">
              {teacher.avatarInitials || initialsFromName(teacher.fullName)}
            </span>
            <div>
              <TeacherStatusBadge status={teacher.status} />
              <p className="mt-1 text-sm text-muted-foreground">
                {teacherStatusLabel[teacher.status]}
              </p>
            </div>
          </div>
          <dl className="grid gap-2 text-sm">
            <Row label="Телефон" value={teacher.phone || "—"} />
            <Row label="Email профиля" value={teacher.email || "—"} />
            <Row
              label="Email входа"
              value={teacher.accountEmail || "нет учётной записи"}
            />
            <Row
              label="Роль"
              value={teacher.userId ? "teacher" : "—"}
            />
            <Row
              label="Начало работы"
              value={teacher.startedAt ? formatDate(teacher.startedAt) : "—"}
            />
            <Row
              label="Специализации"
              value={(teacher.specializations ?? []).join(", ") || "—"}
            />
            <Row
              label="Стоимость занятия"
              value={
                teacher.lessonPrice != null ? `${teacher.lessonPrice} ₽` : "—"
              }
            />
            <Row
              label="Вознаграждение"
              value={
                teacher.teacherPay != null ? `${teacher.teacherPay} ₽` : "—"
              }
            />
            <Row
              label="Длительность"
              value={`${teacher.defaultDurationMin ?? 60} мин`}
            />
            <Row
              label="Рабочие дни"
              value={(teacher.workDays ?? []).join(", ") || "—"}
            />
            <Row
              label="Интервал"
              value={
                teacher.workIntervals?.[0]
                  ? `${teacher.workIntervals[0].start}–${teacher.workIntervals[0].end}`
                  : "—"
              }
            />
          </dl>
          {teacher.adminNotes ? (
            <p className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {teacher.adminNotes}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Учеников" value={students.length} href={`/direkciya/students`} />
          <Stat label="Проведено занятий" value={done} href="/direkciya/schedule" />
          <Stat label="Отметок «присутствовал»" value={present} />
          <Stat label="ДЗ проверено" value={reviewed} href="/direkciya/results" />
          <Stat
            label="ДЗ просрочено"
            value={overdue}
            danger={overdue > 0}
            href="/direkciya/results"
          />
          <Link
            href="/direkciya/schedule"
            className="panel-soft surface-sky flex items-end p-4 text-sm font-medium"
          >
            Открыть расписание →
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Ученики ({students.length})
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет учеников.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ФИО</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.fullName}</TableCell>
                  <TableCell>
                    <PersonStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/direkciya/students/${s.id}`}
                      className="text-sm underline-offset-2 hover:underline"
                    >
                      Карточка
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Недавние занятия
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.slice(0, 6).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatDateTime(l.startsAt)}</TableCell>
                  <TableCell>
                    {l.studentIds
                      .map(
                        (sid) =>
                          data.students.find((s) => s.id === sid)?.fullName ??
                          "Ученик"
                      )
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <LessonStatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Результаты ДЗ
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Задание</TableHead>
                <TableHead>Ученик</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.slice(0, 6).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {data.homeworks.find((h) => h.id === a.homeworkId)?.title ??
                      "—"}
                  </TableCell>
                  <TableCell>
                    {data.students.find((s) => s.id === a.studentId)?.fullName ??
                      "—"}
                  </TableCell>
                  <TableCell>
                    <HomeworkAssignmentStatusBadge status={a.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  danger,
}: {
  label: string;
  value: number;
  href?: string;
  danger?: boolean;
}) {
  const inner = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`font-display text-3xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="panel flex flex-col justify-between gap-2 p-4">
        {inner}
      </Link>
    );
  }
  return <div className="panel flex flex-col justify-between gap-2 p-4">{inner}</div>;
}
