"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
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
    upsertHomeworkAssignment,
  } = useDemoStore();

  const teacherId =
    mode === "direkciya" ? data.direkciyaTeacherId : data.currentTeacherId;

  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HomeworkAssignmentStatus>(
    "all"
  );
  const [editing, setEditing] = useState<HomeworkAssignment | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<HomeworkAssignmentStatus>("reviewed");

  const rows = useMemo(() => {
    return assignmentsForTeacher(teacherId)
      .filter((a) => {
        if (studentFilter !== "all" && a.studentId !== studentFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        return true;
      })
      .sort(
        (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime()
      );
  }, [assignmentsForTeacher, teacherId, studentFilter, statusFilter]);

  const students = data.students.filter((s) => s.teacherId === teacherId);

  function openReview(a: HomeworkAssignment) {
    setEditing(a);
    setScore(a.score != null ? String(a.score) : "");
    setFeedback(a.feedback ?? "");
    setStatus(a.status === "assigned" || a.status === "overdue" ? "completed" : "reviewed");
  }

  function saveReview() {
    if (!editing) return;
    upsertHomeworkAssignment({
      ...editing,
      status,
      score: score ? Number(score) : undefined,
      feedback: feedback.trim() || undefined,
      reviewedAt:
        status === "reviewed" ? new Date().toISOString() : editing.reviewedAt,
      completedAt:
        status === "completed" || status === "reviewed"
          ? editing.completedAt || new Date().toISOString()
          : editing.completedAt,
    });
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="Результаты"
        description={
          mode === "direkciya"
            ? "Результаты выбранного преподавателя: назначения ДЗ и история проверок."
            : "Проверка домашних заданий ваших учеников."
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
            <SelectItem value="completed">Выполнено</SelectItem>
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
              <TableHead>Задание</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Балл</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const hw = data.homeworks.find((h) => h.id === a.homeworkId);
              const student = data.students.find((s) => s.id === a.studentId);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{hw?.title ?? "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/${mode === "direkciya" ? "direkciya" : "kafedra"}/students/${a.studentId}`}
                      className="hover:underline"
                    >
                      {student?.fullName ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateTime(a.dueAt)}</TableCell>
                  <TableCell>
                    <HomeworkAssignmentStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.score != null ? `${a.score}/${a.maxScore ?? "—"}` : "—"}
                  </TableCell>
                  <TableCell>
                    {mode === "kafedra" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openReview(a)}
                      >
                        Проверить
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Проверка задания</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  v && setStatus(v as HomeworkAssignmentStatus)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Выполнено</SelectItem>
                  <SelectItem value="reviewed">Проверено</SelectItem>
                  <SelectItem value="assigned">Назначено</SelectItem>
                  <SelectItem value="overdue">Просрочено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Балл (необязательно)</Label>
              <Input value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={saveReview}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
