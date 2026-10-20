"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EnterCabinetButton } from "@/components/admin/enter-cabinet-button";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { PersonStatusBadge } from "@/components/status-badge";
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
import { toast } from "sonner";

import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { PersonStatus, Student } from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = {
  id?: string;
  fullName: string;
  contacts: string;
  status: PersonStatus;
  teacherId: string;
  notes: string;
  tariffId: string;
};

const emptyForm = (teacherId: string): FormState => ({
  fullName: "",
  contacts: "",
  status: "active",
  teacherId,
  notes: "",
  tariffId: "",
});

export function StudentsByTeacher({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const { data, upsertStudent, deleteStudent, studentsForTeacher, unassignedStudents } =
    useDemoStore();

  const [teacherFilter, setTeacherFilter] = useState<string>(
    mode === "kafedra" ? data.currentTeacherId : "unassigned"
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PersonStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(data.teachers[0]?.id ?? ""));
  const [initialTariffId, setInitialTariffId] = useState("");

  const basePath = mode === "direkciya" ? "/direkciya" : "/kafedra";

  const rows = useMemo(() => {
    const list: Student[] =
      mode === "kafedra"
        ? studentsForTeacher(data.currentTeacherId)
        : teacherFilter === "all"
          ? data.students
          : teacherFilter === "unassigned"
            ? unassignedStudents()
            : studentsForTeacher(teacherFilter);

    return list
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
    teacherFilter,
    unassignedStudents,
  ]);

  const editable = mode === "direkciya" || mode === "kafedra";

  function openCreate() {
    setInitialTariffId("");
    setForm(
      emptyForm(
        mode === "kafedra"
          ? data.currentTeacherId
          : teacherFilter !== "all" && teacherFilter !== "unassigned"
            ? teacherFilter
            : (data.teachers[0]?.id ?? "")
      )
    );
    setOpen(true);
  }

  function openEdit(student: Student) {
    const currentTariff = data.tariffAssignments
      .filter((a) => a.studentId === student.id)
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )[0];
    const tariffId = currentTariff?.tariffId ?? "";
    setInitialTariffId(tariffId);
    setForm({
      id: student.id,
      fullName: student.fullName,
      contacts: student.contacts ?? "",
      status: student.status,
      teacherId: student.teacherId,
      notes: student.notes ?? "",
      tariffId,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.fullName.trim()) return;
    const id =
      form.id ?? `s_${Math.random().toString(36).slice(2, 9)}`;
    upsertStudent({
      id,
      fullName: form.fullName.trim(),
      contacts: form.contacts.trim() || undefined,
      status: form.status,
      teacherId: form.teacherId,
      notes: form.notes.trim() || undefined,
    });
    if (
      mode === "direkciya" &&
      form.tariffId &&
      form.tariffId !== initialTariffId
    ) {
      try {
        await apiPlatform("assignTariff", {
          studentId: id,
          tariffId: form.tariffId,
        });
        toast.success("Тариф назначен");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось назначить тариф");
      }
    }
    setOpen(false);
  }

  const teacherName = (id: string) =>
    !id ? "Не назначен" : (data.teachers.find((t) => t.id === id)?.fullName ?? "—");

  return (
    <div>
      <PageHeader
        title="Ученики"
        description={
          mode === "kafedra"
            ? "Ваши ученики. История сохраняется при любых изменениях."
            : "Ученики по преподавателям. Смена преподавателя не удаляет историю."
        }
        actions={
          editable ? (
            <Button type="button" className="rounded-full" onClick={openCreate}>
              Добавить ученика
            </Button>
          ) : null
        }
      />

      <FilterBar>
        {mode === "direkciya" ? (
          <Select
            value={teacherFilter}
            onValueChange={(v) => v && setTeacherFilter(v)}
          >
            <SelectTrigger className="w-full border-transparent bg-background sm:w-56">
              <SelectValue>
                {(v) =>
                  v === "all"
                    ? "Все преподаватели"
                    : v === "unassigned"
                      ? "Без преподавателя"
                      : (data.teachers.find((t) => t.id === v)?.fullName ?? "—")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все преподаватели</SelectItem>
              <SelectItem value="unassigned">Без преподавателя</SelectItem>
              {data.teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="border-transparent bg-background sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as "all" | PersonStatus)}
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-40">
            <SelectValue>
              {(v) =>
                v === "active" ? "Активен" : v === "paused" ? "Пауза" : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="paused">Пауза</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {mode === "direkciya" && teacherFilter === "all" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.teachers.map((t) => {
            const count = studentsForTeacher(t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeacherFilter(t.id)}
                className={cn(
                  "rounded-full border border-border/80 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                  teacherFilter === t.id && "bg-primary text-primary-foreground"
                )}
              >
                {t.fullName}{" "}
                <span className="tabular-nums opacity-70">({count})</span>
              </button>
            );
          })}
          {unassignedStudents().length > 0 ? (
            <button
              type="button"
              onClick={() => setTeacherFilter("unassigned")}
              className="rounded-full border border-destructive/30 px-3 py-1.5 text-sm text-destructive"
            >
              Без преподавателя ({unassignedStudents().length})
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={
            mode === "direkciya" && teacherFilter === "unassigned"
              ? "Все ученики назначены"
              : "Нет учеников"
          }
          description={
            mode === "direkciya" && teacherFilter === "unassigned"
              ? "Сейчас нет учеников без преподавателя. Можно показать всех или выбрать преподавателя."
              : "Измените фильтр или добавьте запись."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ФИО</TableHead>
              {mode === "direkciya" ? <TableHead>Преподаватель</TableHead> : null}
              <TableHead>Статус</TableHead>
              {mode === "direkciya" ? <TableHead>Аккаунт</TableHead> : null}
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`${basePath}/students/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.fullName}
                  </Link>
                  {s.contacts ? (
                    <div className="text-xs text-muted-foreground">{s.contacts}</div>
                  ) : null}
                </TableCell>
                {mode === "direkciya" ? (
                  <TableCell
                    className={cn(!s.teacherId && "text-destructive")}
                  >
                    {teacherName(s.teacherId)}
                  </TableCell>
                ) : null}
                <TableCell>
                  <PersonStatusBadge status={s.status} />
                </TableCell>
                {mode === "direkciya" ? (
                  <TableCell className="text-xs text-muted-foreground">
                    {s.accountEmail ? (
                      <>
                        <div>{s.accountEmail}</div>
                        <div>роль: student</div>
                      </>
                    ) : (
                      "нет входа"
                    )}
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {mode === "direkciya" ? (
                      <EnterCabinetButton
                        userId={s.userId}
                        studentId={s.id}
                      />
                    ) : null}
                    <Link
                      href={`${basePath}/students/${s.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      Карточка
                    </Link>
                    {mode === "direkciya" ? (
                      <button
                        type="button"
                        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => openEdit(s)}
                      >
                        Изменить
                      </button>
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
              {form.id ? "Редактировать ученика" : "Новый ученик"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>ФИО</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Контакты</Label>
              <Input
                value={form.contacts}
                onChange={(e) => setForm({ ...form, contacts: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Преподаватель</Label>
              <Select
                value={form.teacherId || "__none__"}
                onValueChange={(v) =>
                  v && setForm({ ...form, teacherId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? "Не назначен"
                        : (data.teachers.find((t) => t.id === v)?.fullName ?? "—")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не назначен</SelectItem>
                  {data.teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as PersonStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => (v === "paused" ? "Пауза" : "Активен")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активен</SelectItem>
                  <SelectItem value="paused">Пауза</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "direkciya" ? (
              <div className="space-y-1.5">
                <Label>Тариф</Label>
                <Select
                  value={form.tariffId || "__none__"}
                  onValueChange={(v) =>
                    v &&
                    setForm({
                      ...form,
                      tariffId: v === "__none__" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === "__none__"
                          ? "Не назначен"
                          : (data.tariffs.find((t) => t.id === v)?.name ?? "—")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Не назначен</SelectItem>
                    {data.tariffs
                      .filter((t) => t.status === "active")
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} · {t.price.toLocaleString("ru-RU")} ₽
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  При сохранении создаётся новое назначение (история сохраняется).
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {form.id && mode === "direkciya" ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  deleteStudent(form.id!);
                  setOpen(false);
                }}
              >
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void save()}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
