"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ResultStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { resultStatusLabel } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Result, ResultStatus } from "@/lib/types";

type FormState = {
  id: string;
  score: string;
  status: ResultStatus;
  feedback: string;
};

export function ResultsPanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const { data, upsertResult, resultsForTeacher } = useDemoStore();
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ResultStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const results = useMemo(() => {
    const list =
      mode === "kafedra"
        ? resultsForTeacher(data.currentTeacherId)
        : data.results;
    return list.filter((r) => {
      if (assignmentFilter !== "all" && r.assignmentId !== assignmentFilter) {
        return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [
    assignmentFilter,
    data.currentTeacherId,
    data.results,
    mode,
    resultsForTeacher,
    statusFilter,
  ]);

  const assignmentOptions =
    mode === "kafedra"
      ? data.assignments.filter((a) => a.teacherId === data.currentTeacherId)
      : data.assignments;

  function openGrade(result: Result) {
    setForm({
      id: result.id,
      score: result.score != null ? String(result.score) : "",
      status: result.status === "pending" ? "graded" : result.status,
      feedback: result.feedback ?? "",
    });
    setOpen(true);
  }

  function save() {
    if (!form) return;
    const existing = data.results.find((r) => r.id === form.id);
    if (!existing) return;
    const score =
      form.score.trim() === "" ? undefined : Number(form.score);
    upsertResult({
      ...existing,
      score: Number.isFinite(score) ? score : undefined,
      status: form.status,
      feedback: form.feedback.trim() || undefined,
      submittedAt:
        existing.submittedAt ??
        (form.status === "submitted" || form.status === "graded"
          ? new Date().toISOString()
          : undefined),
    });
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Результаты"
        description="Балл, статус и необязательный комментарий к работе."
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Select
          value={assignmentFilter}
          onValueChange={(v) => {
            if (v) setAssignmentFilter(v);
          }}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Задание">
              {(v: string | null) =>
                !v || v === "all"
                  ? "Все задания"
                  : (assignmentOptions.find((a) => a.id === v)?.title ??
                    "Задание")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все задания</SelectItem>
            {assignmentOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v as "all" | ResultStatus);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue>
              {(v: "all" | ResultStatus | null) =>
                !v || v === "all" ? "Все статусы" : resultStatusLabel[v]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидает</SelectItem>
            <SelectItem value="submitted">Сдано</SelectItem>
            <SelectItem value="graded">Оценено</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {results.length === 0 ? (
        <EmptyState title="Нет результатов" description="Смените фильтр." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Задание</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>Балл</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Комментарий</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => {
              const assignment = data.assignments.find(
                (a) => a.id === r.assignmentId
              );
              const student = data.students.find((s) => s.id === r.studentId);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {assignment?.title ?? "—"}
                  </TableCell>
                  <TableCell>{student?.fullName ?? "—"}</TableCell>
                  <TableCell>
                    {r.score != null
                      ? `${r.score}/${r.maxScore ?? assignment?.maxScore ?? "—"}`
                      : `—/${r.maxScore ?? assignment?.maxScore ?? "—"}`}
                  </TableCell>
                  <TableCell>
                    <ResultStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">
                    {r.feedback || "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => openGrade(r)}
                    >
                      Оценить
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Оценка работы</DialogTitle>
            <DialogDescription>
              Числовой балл, статус и комментарий (необязательно).
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-score">Балл</Label>
                <Input
                  id="r-score"
                  type="number"
                  value={form.score}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, score: e.target.value } : f))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Статус</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => {
                    if (v && form)
                      setForm({ ...form, status: v as ResultStatus });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ожидает</SelectItem>
                    <SelectItem value="submitted">Сдано</SelectItem>
                    <SelectItem value="graded">Оценено</SelectItem>
                    <SelectItem value="overdue">Просрочено</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-feedback">Комментарий</Label>
                <Textarea
                  id="r-feedback"
                  value={form.feedback}
                  onChange={(e) =>
                    setForm((f) =>
                      f ? { ...f, feedback: e.target.value } : f
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={save}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
