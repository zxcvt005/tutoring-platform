"use client";

import Link from "next/link";
import { useMemo } from "react";
import { notFound } from "next/navigation";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { PageHeader } from "@/components/layout/page-header";
import {
  HomeworkAssignmentStatusBadge,
  LessonStatusBadge,
  PersonStatusBadge,
} from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDueAt } from "@/lib/format";
import {
  gradeLabel,
  phoneHref,
  telegramDisplay,
  telegramHref,
} from "@/lib/student-contacts";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";

export function StudentDetail({
  studentId,
  mode,
}: {
  studentId: string;
  mode: "direkciya" | "kafedra";
}) {
  const { data, assignmentsForStudent, ready } = useDemoStore();
  const base = mode === "direkciya" ? "/direkciya" : "/kafedra";

  const student = data.students.find((s) => s.id === studentId);
  const teacher = student
    ? data.teachers.find((t) => t.id === student.teacherId)
    : undefined;

  const lessons = useMemo(
    () =>
      data.lessons
        .filter((l) => l.studentIds.includes(studentId))
        .sort(
          (a, b) =>
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
        ),
    [data.lessons, studentId]
  );

  const assignments = assignmentsForStudent(studentId);

  if (ready && !student) {
    notFound();
  }
  if (!student) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (mode === "kafedra" && student.teacherId !== data.currentTeacherId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Этот ученик не назначен текущему demo-преподавателю.
        </p>
        <Link href={`${base}/students`} className="text-sm underline">
          К списку
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.fullName}
        description={
          teacher
            ? `Преподаватель: ${teacher.fullName}`
            : "Преподаватель не назначен"
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {mode === "direkciya" ? (
              <EnterCabinetButton
                userId={student.userId}
                studentId={student.id}
              />
            ) : null}
            <Link
              href={`${base}/students`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              ← К списку
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-3 p-5 lg:col-span-1">
          <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Профиль
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Статус</span>
              <PersonStatusBadge status={student.status} />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Класс</span>
              <span>{gradeLabel(student.grade)}</span>
            </div>
            {telegramDisplay(student.telegram) ? (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Telegram</span>
                {telegramHref(student.telegram) ? (
                  <a
                    href={telegramHref(student.telegram)!}
                    className="underline-offset-2 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {telegramDisplay(student.telegram)}
                  </a>
                ) : (
                  <span>{telegramDisplay(student.telegram)}</span>
                )}
              </div>
            ) : null}
            {student.phone?.trim() ? (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Телефон</span>
                {phoneHref(student.phone) ? (
                  <a
                    href={phoneHref(student.phone)!}
                    className="underline-offset-2 hover:underline"
                  >
                    {student.phone.trim()}
                  </a>
                ) : (
                  <span>{student.phone.trim()}</span>
                )}
              </div>
            ) : null}
            {mode === "direkciya" ? (
              <>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Email входа</span>
                  <span>{student.accountEmail || "нет учётной записи"}</span>
                </div>
                {student.parentContacts?.trim() ? (
                  <div>
                    <p className="text-muted-foreground">Контакты родителей</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {student.parentContacts.trim()}
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
            {mode === "direkciya" && student.notes ? (
              <p className="rounded-xl bg-muted/40 px-3 py-2 text-muted-foreground">
                {student.notes}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Домашние задания
          </h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Задание</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Балл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const hw = data.homeworks.find((h) => h.id === a.homeworkId);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {getAssignmentTitle(a, hw)}
                      </TableCell>
                      <TableCell>{formatDueAt(a.dueAt)}</TableCell>
                      <TableCell>
                        <HomeworkAssignmentStatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.score != null
                          ? `${a.score}/${a.maxScore ?? "—"}`
                          : a.status === "completed"
                            ? "ждёт проверки"
                            : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          История занятий
        </h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Занятий пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Предмет</TableHead>
                <TableHead>Тема</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.map((l) => {
                const topic = data.topics.find((t) => t.id === l.topicId);
                return (
                  <TableRow key={l.id}>
                    <TableCell>{formatDateTime(l.startsAt)}</TableCell>
                    <TableCell>{l.subject || "—"}</TableCell>
                    <TableCell>{topic?.title ?? "—"}</TableCell>
                    <TableCell>
                      <LessonStatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
