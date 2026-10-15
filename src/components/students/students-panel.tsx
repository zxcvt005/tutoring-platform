"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
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
import { useDemoStore } from "@/lib/store/demo-store";
import type { PersonStatus, Student } from "@/lib/types";

type FormState = {
  id?: string;
  fullName: string;
  contacts: string;
  status: PersonStatus;
  teacherId: string;
  groupIds: string[];
  notes: string;
};

const emptyForm = (teacherId: string): FormState => ({
  fullName: "",
  contacts: "",
  status: "active",
  teacherId,
  groupIds: [],
  notes: "",
});

export function StudentsPanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    upsertStudent,
    deleteStudent,
    studentsForTeacher,
  } = useDemoStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PersonStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(data.teachers[0]?.id ?? ""));

  const rows = useMemo(() => {
    const base =
      mode === "kafedra"
        ? studentsForTeacher(data.currentTeacherId)
        : data.students;
    return base
      .filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          s.fullName.toLowerCase().includes(q) ||
          (s.contacts?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [
    data.currentTeacherId,
    data.students,
    mode,
    query,
    statusFilter,
    studentsForTeacher,
  ]);

  const teacherName = (id: string) =>
    data.teachers.find((t) => t.id === id)?.fullName ?? "—";
  const groupNames = (ids: string[]) =>
    ids
      .map((id) => data.groups.find((g) => g.id === id)?.title)
      .filter(Boolean)
      .join(", ") || "—";

  function openCreate() {
    setForm(
      emptyForm(
        mode === "kafedra"
          ? data.currentTeacherId
          : (data.teachers[0]?.id ?? "")
      )
    );
    setOpen(true);
  }

  function openEdit(student: Student) {
    setForm({
      id: student.id,
      fullName: student.fullName,
      contacts: student.contacts ?? "",
      status: student.status,
      teacherId: student.teacherId,
      groupIds: [...student.groupIds],
      notes: student.notes ?? "",
    });
    setOpen(true);
  }

  function save() {
    if (!form.fullName.trim() || !form.teacherId) return;
    upsertStudent({
      id: form.id,
      fullName: form.fullName.trim(),
      contacts: form.contacts.trim() || undefined,
      status: form.status,
      teacherId: form.teacherId,
      groupIds: form.groupIds,
      notes: form.notes.trim() || undefined,
    });
    setOpen(false);
  }

  const editable = mode === "direkciya";
  const availableGroups =
    mode === "kafedra"
      ? data.groups.filter((g) => g.teacherId === data.currentTeacherId)
      : data.groups;

  return (
    <div>
      <PageHeader
        title="Ученики"
        description={
          mode === "kafedra"
            ? "Ученики, связанные с выбранным преподавателем и его группами."
            : "Справочник учеников: основной преподаватель и группы."
        }
        actions={
          editable ? (
            <Button type="button" onClick={openCreate}>
              Добавить ученика
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени или контакту…"
          className="sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v as "all" | PersonStatus);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="paused">Пауза</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Нет учеников"
          description="Измените фильтр или добавьте запись."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ФИО</TableHead>
              <TableHead>Преподаватель</TableHead>
              <TableHead>Группы</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.fullName}</div>
                  {s.contacts ? (
                    <div className="text-xs text-muted-foreground">
                      {s.contacts}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{teacherName(s.teacherId)}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {groupNames(s.groupIds)}
                </TableCell>
                <TableCell>
                  <PersonStatusBadge status={s.status} />
                </TableCell>
                <TableCell>
                  {editable ? (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => openEdit(s)}
                      >
                        Изменить
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteStudent(s.id)}
                      >
                        Удал.
                      </Button>
                    </div>
                  ) : s.notes ? (
                    <span className="text-xs text-muted-foreground">
                      {s.notes}
                    </span>
                  ) : null}
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
              {form.id ? "Редактировать ученика" : "Новый ученик"}
            </DialogTitle>
            <DialogDescription>
              У ученика один основной преподаватель; групп может быть несколько.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">ФИО</Label>
              <Input
                id="s-name"
                value={form.fullName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-contacts">Контакты</Label>
              <Input
                id="s-contacts"
                value={form.contacts}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contacts: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Статус</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => {
                    if (v) setForm((f) => ({ ...f, status: v as PersonStatus }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Активен</SelectItem>
                    <SelectItem value="paused">Пауза</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Преподаватель</Label>
                <Select
                  value={form.teacherId}
                  onValueChange={(v) => {
                    if (v) setForm((f) => ({ ...f, teacherId: v }));
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
            </div>
            <div className="space-y-1.5">
              <Label>Группы</Label>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                {availableGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Групп пока нет</p>
                ) : (
                  availableGroups.map((g) => {
                    const checked = form.groupIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setForm((f) => ({
                              ...f,
                              groupIds: v
                                ? [...f.groupIds, g.id]
                                : f.groupIds.filter((id) => id !== g.id),
                            }));
                          }}
                        />
                        {g.title}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-notes">Заметки</Label>
              <Textarea
                id="s-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
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
