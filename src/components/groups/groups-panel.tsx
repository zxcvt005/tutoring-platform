"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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
import { useDemoStore } from "@/lib/store/demo-store";
import type { Group } from "@/lib/types";

type FormState = {
  id?: string;
  title: string;
  teacherId: string;
  studentIds: string[];
  scheduleHint: string;
};

export function GroupsPanel() {
  const { data, upsertGroup, deleteGroup } = useDemoStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: "",
    teacherId: data.teachers[0]?.id ?? "",
    studentIds: [],
    scheduleHint: "",
  });

  const rows = useMemo(
    () =>
      data.groups
        .filter((g) =>
          !query.trim()
            ? true
            : g.title.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => a.title.localeCompare(b.title, "ru")),
    [data.groups, query]
  );

  function openCreate() {
    setForm({
      title: "",
      teacherId: data.teachers[0]?.id ?? "",
      studentIds: [],
      scheduleHint: "",
    });
    setOpen(true);
  }

  function openEdit(group: Group) {
    setForm({
      id: group.id,
      title: group.title,
      teacherId: group.teacherId,
      studentIds: [...group.studentIds],
      scheduleHint: group.scheduleHint ?? "",
    });
    setOpen(true);
  }

  function save() {
    if (!form.title.trim() || !form.teacherId) return;
    upsertGroup({
      id: form.id,
      title: form.title.trim(),
      teacherId: form.teacherId,
      studentIds: form.studentIds,
      scheduleHint: form.scheduleHint.trim() || undefined,
    });
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Группы"
        description="У группы один куратор-преподаватель; ученики — многие-ко-многим."
        actions={
          <Button type="button" onClick={openCreate}>
            Добавить группу
          </Button>
        }
      />

      <div className="mb-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск группы…"
          className="sm:max-w-xs"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Нет групп" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Преподаватель</TableHead>
              <TableHead>Учеников</TableHead>
              <TableHead>Подсказка</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.title}</TableCell>
                <TableCell>
                  {data.teachers.find((t) => t.id === g.teacherId)?.fullName ??
                    "—"}
                </TableCell>
                <TableCell>{g.studentIds.length}</TableCell>
                <TableCell>{g.scheduleHint || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(g)}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteGroup(g.id)}
                    >
                      Удал.
                    </Button>
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
              {form.id ? "Редактировать группу" : "Новая группа"}
            </DialogTitle>
            <DialogDescription>
              Состав учеников синхронизируется со справочником учеников.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-title">Название</Label>
              <Input
                id="g-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
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
            <div className="space-y-1.5">
              <Label htmlFor="g-hint">Подсказка расписания</Label>
              <Input
                id="g-hint"
                value={form.scheduleHint}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scheduleHint: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ученики</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                {data.students.map((s) => {
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
