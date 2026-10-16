"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
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
import { useDemoStore } from "@/lib/store/demo-store";
import type { PersonStatus, Teacher } from "@/lib/types";

type FormState = {
  id?: string;
  fullName: string;
  email: string;
  subjects: string;
  status: PersonStatus;
};

const emptyForm = (): FormState => ({
  fullName: "",
  email: "",
  subjects: "",
  status: "active",
});

export function TeachersPanel() {
  const { data, upsertTeacher, deleteTeacher } = useDemoStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const rows = useMemo(
    () =>
      data.teachers
        .filter((t) => {
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          return (
            t.fullName.toLowerCase().includes(q) ||
            t.subjects.some((s) => s.toLowerCase().includes(q))
          );
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    [data.teachers, query]
  );

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(teacher: Teacher) {
    setForm({
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email ?? "",
      subjects: teacher.subjects.join(", "),
      status: teacher.status,
    });
    setOpen(true);
  }

  function save() {
    if (!form.fullName.trim()) return;
    upsertTeacher({
      id: form.id,
      fullName: form.fullName.trim(),
      email: form.email.trim() || undefined,
      subjects: form.subjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      status: form.status,
    });
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Преподаватели"
        description="Справочник преподавателей и предметов."
        actions={
          <Button type="button" className="rounded-full" onClick={openCreate}>
            Добавить преподавателя
          </Button>
        }
      />

      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="border-transparent bg-background sm:max-w-xs"
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Нет преподавателей" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ФИО</TableHead>
              <TableHead>Предметы</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.fullName}</TableCell>
                <TableCell>{t.subjects.join(", ") || "—"}</TableCell>
                <TableCell>{t.email || "—"}</TableCell>
                <TableCell>
                  <PersonStatusBadge status={t.status} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(t)}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteTeacher(t.id)}
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
              {form.id ? "Редактировать преподавателя" : "Новый преподаватель"}
            </DialogTitle>
            <DialogDescription>
              Предметы через запятую, например: Математика, ЕГЭ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">ФИО</Label>
              <Input
                id="t-name"
                value={form.fullName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">Email</Label>
              <Input
                id="t-email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-subjects">Предметы</Label>
              <Input
                id="t-subjects"
                value={form.subjects}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subjects: e.target.value }))
                }
              />
            </div>
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
