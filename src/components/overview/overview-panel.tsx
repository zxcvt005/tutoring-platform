"use client";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";

export function OverviewPanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    studentsForTeacher,
    groupsForTeacher,
    lessonsForTeacher,
    assignmentsForTeacher,
    resultsForTeacher,
  } = useDemoStore();

  const teacherId = data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);

  const stats =
    mode === "direkciya"
      ? [
          { label: "Ученики", value: data.students.length, href: "/direkciya/students" },
          { label: "Преподаватели", value: data.teachers.length, href: "/direkciya/teachers" },
          { label: "Группы", value: data.groups.length, href: "/direkciya/groups" },
          { label: "Задания", value: data.assignments.length, href: "/direkciya/assignments" },
        ]
      : [
          {
            label: "Мои ученики",
            value: studentsForTeacher(teacherId).length,
            href: "/kafedra/students",
          },
          {
            label: "Мои группы",
            value: groupsForTeacher(teacherId).length,
            href: "/kafedra/students",
          },
          {
            label: "Занятия",
            value: lessonsForTeacher(teacherId).length,
            href: "/kafedra/schedule",
          },
          {
            label: "Задания",
            value: assignmentsForTeacher(teacherId).length,
            href: "/kafedra/assignments",
          },
        ];

  const upcoming = (
    mode === "kafedra"
      ? lessonsForTeacher(teacherId)
      : data.lessons
  )
    .filter((l) => l.status === "planned")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, 5);

  const pendingResults = (
    mode === "kafedra" ? resultsForTeacher(teacherId) : data.results
  ).filter((r) => r.status === "submitted" || r.status === "pending").length;

  return (
    <div>
      <PageHeader
        title={mode === "direkciya" ? "Обзор дирекции" : "Обзор кафедры"}
        description={
          mode === "kafedra"
            ? `Сейчас как: ${teacher?.fullName ?? "—"}. Данные общие с Дирекцией, показаны только «свои».`
            : "Сводка по демо-данным. Переключайтесь в Кафедру, чтобы увидеть фильтр преподавателя."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Ближайшие занятия</h2>
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              href={
                mode === "direkciya" ? "/direkciya/schedule" : "/kafedra/schedule"
              }
            />
          }
        >
          К расписанию
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">
          Нет запланированных занятий.
        </p>
      ) : (
        <div className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Когда</TableHead>
                <TableHead>Тема</TableHead>
                <TableHead>Группа</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatDateTime(l.startsAt)}</TableCell>
                  <TableCell>{l.title || "Занятие"}</TableCell>
                  <TableCell>
                    {l.groupId
                      ? (data.groups.find((g) => g.id === l.groupId)?.title ??
                        "—")
                      : "Индивидуал"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Ожидают проверки / сдачи:{" "}
        <span className="font-medium text-foreground">{pendingResults}</span>
        .{" "}
        <Link
          href={mode === "direkciya" ? "/direkciya/results" : "/kafedra/results"}
          className="underline underline-offset-2"
        >
          Открыть результаты
        </Link>
      </p>
    </div>
  );
}
