"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { AssignmentReviewDialog } from "@/components/tests/assignment-review-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDueAt } from "@/lib/format";
import { hasPendingManual } from "@/lib/tests/grading";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment, HomeworkAssignmentStatus } from "@/lib/types";

export function ResultsWorkspace({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    setDirekciyaTeacherId,
    assignmentsForTeacher,
  } = useDemoStore();

  const teacherId =
    mode === "direkciya" ? data.direkciyaTeacherId : data.currentTeacherId;

  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HomeworkAssignmentStatus>(
    "all"
  );
  const [reviewing, setReviewing] = useState<HomeworkAssignment | null>(null);

  const rows = useMemo(() => {
    return assignmentsForTeacher(teacherId)
      .filter((a) => {
        if (studentFilter !== "all" && a.studentId !== studentFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.dueAt ?? a.completedAt ?? 0).getTime();
        const tb = new Date(b.dueAt ?? b.completedAt ?? 0).getTime();
        return tb - ta;
      });
  }, [assignmentsForTeacher, teacherId, studentFilter, statusFilter]);

  const students = data.students.filter((s) => s.teacherId === teacherId);

  const pendingCount = rows.filter(
    (a) => a.status === "completed" && hasPendingManual(a)
  ).length;

  return (
    <div>
      <PageHeader
        title="Результаты"
        description={
          mode === "direkciya"
            ? "Результаты выбранного преподавателя: назначения тестов и проверки."
            : "Проверка тестов и домашних заданий ваших учеников."
        }
        actions={
          mode === "direkciya" ? (
            <Select
              value={teacherId || null}
              onValueChange={(v) => v && setDirekciyaTeacherId(v)}
            >
              <SelectTrigger className="w-[220px] rounded-full">
                <SelectValue>
                  {(v) =>
                    data.teachers.find((t) => t.id === v)?.fullName ?? "Преподаватель"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {data.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : pendingCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              Ждут ручной проверки: {pendingCount}
            </span>
          ) : null
        }
      />

      <FilterBar>
        <Select
          value={studentFilter}
          onValueChange={(v) => v && setStudentFilter(v)}
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-52">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Все ученики"
                  : (students.find((s) => s.id === v)?.fullName ?? "Ученик")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ученики</SelectItem>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            v && setStatusFilter(v as "all" | HomeworkAssignmentStatus)
          }
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="assigned">Назначено</SelectItem>
            <SelectItem value="in_progress">Черновик</SelectItem>
            <SelectItem value="completed">На проверке</SelectItem>
            <SelectItem value="reviewed">Проверено</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Нет результатов" description="Смените фильтр." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тест</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Балл</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const hw = data.homeworks.find((h) => h.id === a.homeworkId);
              const student = data.students.find((s) => s.id === a.studentId);
              const title = getAssignmentTitle(a, hw);
              const pct =
                a.score != null && a.maxScore
                  ? Math.round((a.score / a.maxScore) * 100)
                  : null;
              const pending = hasPendingManual(a);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {title}
                    {pending ? (
                      <p className="text-[11px] font-normal text-[oklch(0.45_0.08_55)]">
                        есть развёрнутые ответы
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/${mode === "direkciya" ? "direkciya" : "kafedra"}/students/${a.studentId}`}
                      className="hover:underline"
                    >
                      {student?.fullName ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDueAt(a.dueAt)}</TableCell>
                  <TableCell>
                    <HomeworkAssignmentStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.score != null
                      ? `${a.score}/${a.maxScore ?? "—"}${
                          pct != null ? ` (${pct}%)` : ""
                        }`
                      : a.status === "completed"
                        ? "—"
                        : "—"}
                  </TableCell>
                  <TableCell>
                    {mode === "kafedra" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setReviewing(a)}
                      >
                        {pending || a.status === "completed"
                          ? "Проверить"
                          : "Открыть"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.feedback ? "есть комм." : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AssignmentReviewDialog
        assignment={reviewing}
        open={!!reviewing}
        onOpenChange={(o) => !o && setReviewing(null)}
      />
    </div>
  );
}
