"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Assignment, AssignmentStatus } from "@/lib/types";

type FormState = {
  id?: string;
  title: string;
  description: string;
  teacherId: string;
  groupId: string;
  studentIds: string[];
  dueAt: string;
  status: AssignmentStatus;
  maxScore: string;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentsPanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const { data, upsertAssignment, deleteAssignment, assignmentsForTeacher } =
    useDemoStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    teacherId: data.teachers[0]?.id ?? "",
    groupId: "",
    studentIds: [],
    dueAt: "",
    status: "draft",
    maxScore: "10",
  });

  const rows = useMemo(() => {
    const list =
      mode === "kafedra"
        ? assignmentsForTeacher(data.currentTeacherId)
        : data.assignments;
    return [...list].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    );
  }, [
    assignmentsForTeacher,
    data.assignments,
    data.currentTeacherId,
    mode,
  ]);

  function openCreate() {
    const due = new Date();
    due.setDate(due.getDate() + 3);
    due.setHours(23, 59, 0, 0);
    const teacherId =
      mode === "kafedra"
        ? data.currentTeacherId
        : (data.teachers[0]?.id ?? "");
    setForm({
      title: "",
      description: "",
      teacherId,
      groupId: "",
      studentIds: [],
      dueAt: toLocalInput(due.toISOString()),
      status: "draft",
      maxScore: "10",
    });
    setOpen(true);
  }

  function openEdit(a: Assignment) {
    setForm({
      id: a.id,
      title: a.title,
      description: a.description ?? "",
      teacherId: a.teacherId,
      groupId: a.groupId ?? "",
      studentIds: [...a.studentIds],
      dueAt: toLocalInput(a.dueAt),
      status: a.status,
      maxScore: String(a.maxScore),
    });
    setOpen(true);
  }

  function applyGroup(groupId: string) {
    const group = data.groups.find((g) => g.id === groupId);
    setForm((f) => ({
      ...f,
      groupId,
      studentIds: group ? [...group.studentIds] : f.studentIds,
      teacherId: group?.teacherId ?? f.teacherId,
    }));
  }

  function save() {
    if (!form.title.trim() || !form.teacherId || !form.dueAt) return;
    const maxScore = Number(form.maxScore) || 10;
    upsertAssignment({
      id: form.id,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      teacherId: form.teacherId,
      groupId: form.groupId || undefined,
      studentIds: form.studentIds,
      dueAt: new Date(form.dueAt).toISOString(),
      status: form.status,
      maxScore,
    });
    setOpen(false);
  }

  const groupsForForm =
    mode === "kafedra"
      ? data.groups.filter((g) => g.teacherId === data.currentTeacherId)
      : data.groups.filter((g) => g.teacherId === form.teacherId);

  const studentsForForm =
    mode === "kafedra"
      ? data.students.filter(
          (s) =>
            s.teacherId === data.currentTeacherId ||
            s.groupIds.some((gid) =>
              data.groups.some(
                (g) => g.id === gid && g.teacherId === data.currentTeacherId
              )
            )
        )
      : data.students;

  return (
    <div>
      <PageHeader
        title="Задания"
        description="Публикация заданий группе или выбранным ученикам."
        actions={
          <Button type="button" className="rounded-full" onClick={openCreate}>
            Добавить задание
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Нет заданий" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Преподаватель</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Учеников</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.title}</TableCell>
                <TableCell>
                  {data.teachers.find((t) => t.id === a.teacherId)?.fullName ??
                    "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(a.dueAt)}
                </TableCell>
                <TableCell>{a.studentIds.length}</TableCell>
                <TableCell>
                  <AssignmentStatusBadge status={a.status} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(a)}
                    >
                      Изменить
                    </Button>
                    {mode === "direkciya" ||
                    a.teacherId === data.currentTeacherId ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteAssignment(a.id)}
                      >
                        Удал.
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Редактировать задание" : "Новое задание"}
            </DialogTitle>
            <DialogDescription>
              При сохранении создаются строки результатов для учеников.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="a-title">Название</Label>
              <Input
                id="a-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-desc">Описание</Label>
              <Textarea
                id="a-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            {mode === "direkciya" ? (
              <div className="space-y-1.5">
                <Label>Преподаватель</Label>
                <Select
                  value={form.teacherId}
                  onValueChange={(v) => {
                    if (v)
                      setForm((f) => ({ ...f, teacherId: v, groupId: "" }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Группа (заполняет список учеников)</Label>
              <Select
                value={form.groupId || "__none__"}
                onValueChange={(v) => {
                  if (!v) return;
                  if (v === "__none__") {
                    setForm((f) => ({ ...f, groupId: "" }));
                    return;
                  }
                  applyGroup(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без группы</SelectItem>
                  {groupsForForm.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ученики</Label>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                {studentsForForm.map((s) => {
                  const checked = form.studentIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForm((f) => ({
                            ...f,
                            studentIds: v
                              ? [...f.studentIds, s.id]
                              : f.studentIds.filter((id) => id !== s.id),
                          }));
                        }}
                      />
                      {s.fullName}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="a-due">Срок</Label>
                <Input
                  id="a-due"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dueAt: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-max">Макс. балл</Label>
                <Input
                  id="a-max"
                  type="number"
                  min={1}
                  value={form.maxScore}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxScore: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  if (v)
                    setForm((f) => ({ ...f, status: v as AssignmentStatus }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="published">Опубликовано</SelectItem>
                  <SelectItem value="closed">Закрыто</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
