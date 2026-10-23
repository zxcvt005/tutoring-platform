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

import { formatDate, personStatusLabel } from "@/lib/format";
import {
  currentAssignmentForStudent,
  packageStatusLabel,
} from "@/lib/tariff-package";
import { averageFinishedAttempt2 } from "@/lib/tests/attempts";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { STUDENT_GRADES, gradeLabel } from "@/lib/student-contacts";
import type { PersonStatus, Student, StudentGrade } from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = {
  id?: string;
  fullName: string;
  grade: StudentGrade | "";
  telegram: string;
  phone: string;
  status: PersonStatus;
  teacherId: string;
  tariffId: string;
  parentContacts: string;
  notes: string;
};

const emptyForm = (teacherId: string): FormState => ({
  fullName: "",
  grade: "",
  telegram: "",
  phone: "",
  status: "active",
  teacherId,
  tariffId: "",
  parentContacts: "",
  notes: "",
});

export function StudentsByTeacher({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    upsertStudent,
    deleteStudent,
    studentsForTeacher,
    unassignedStudents,
    reload,
  } = useDemoStore();

  const [teacherFilter, setTeacherFilter] = useState<string>(
    mode === "kafedra" ? data.currentTeacherId : "unassigned"
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PersonStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(data.teachers[0]?.id ?? ""));
  const [initialTariffId, setInitialTariffId] = useState("");
  const [assignFor, setAssignFor] = useState<Student | null>(null);
  const [assignTariffId, setAssignTariffId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

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
          (s.telegram?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false) ||
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
      grade: student.grade ?? "",
      telegram: student.telegram ?? "",
      phone: student.phone ?? "",
      status: student.status,
      teacherId: student.teacherId,
      tariffId,
      parentContacts: student.parentContacts ?? "",
      notes: student.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.fullName.trim()) return;
    const id =
      form.id ?? `s_${Math.random().toString(36).slice(2, 9)}`;
    const saved = await upsertStudent({
      id,
      fullName: form.fullName.trim(),
      grade: form.grade || null,
      telegram: form.telegram.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status,
      teacherId: form.teacherId,
      parentContacts: form.parentContacts.trim() || null,
      notes: form.notes.trim() || undefined,
    });
    if (!saved.ok) return;
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
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось назначить тариф");
      }
    }
    setOpen(false);
  }

  async function saveAssignOnly() {
    if (!assignFor || !assignTariffId) return;
    setAssignBusy(true);
    try {
      await apiPlatform("assignTariff", {
        studentId: assignFor.id,
        tariffId: assignTariffId,
      });
      toast.success("Тариф назначен");
      setAssignFor(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось назначить тариф");
    } finally {
      setAssignBusy(false);
    }
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
                v === "active" || v === "paused"
                  ? personStatusLabel[v as PersonStatus]
                  : "Все статусы"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">{personStatusLabel.active}</SelectItem>
            <SelectItem value="paused">{personStatusLabel.paused}</SelectItem>
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
              {mode === "kafedra" ? (
                <>
                  <TableHead className="whitespace-nowrap">
                    Ср. ДЗ, 2-я попытка
                  </TableHead>
                  <TableHead>Класс</TableHead>
                  <TableHead>Тариф</TableHead>
                </>
              ) : null}
              <TableHead>Статус</TableHead>
              {mode === "direkciya" ? (
                <>
                  <TableHead>Тариф</TableHead>
                  <TableHead>Остаток</TableHead>
                  <TableHead>Использовано</TableHead>
                  <TableHead>Прогноз</TableHead>
                  <TableHead>Оплата</TableHead>
                  <TableHead>Аккаунт</TableHead>
                </>
              ) : null}
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
                {mode === "kafedra"
                  ? (() => {
                      const avg2 = averageFinishedAttempt2(
                        data.homeworkAssignments.filter(
                          (a) => a.studentId === s.id && a.sourceKind !== "theory"
                        )
                      );
                      const asg = currentAssignmentForStudent(
                        data.tariffAssignments,
                        s.id
                      );
                      return (
                        <>
                          <TableCell className="tabular-nums whitespace-nowrap">
                            {avg2 == null ? "—" : `${avg2}%`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            —
                          </TableCell>
                          <TableCell className="min-w-[8.5rem]">
                            {asg ? (
                              <div>
                                <div className="font-medium leading-tight">
                                  {asg.tariffName ?? "Тариф"}
                                </div>
                                <div className="text-[0.7rem] text-muted-foreground">
                                  {packageStatusLabel[asg.packageStatus ?? "none"]}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </>
                      );
                    })()
                  : null}
                <TableCell>
                  <PersonStatusBadge status={s.status} />
                </TableCell>
                {mode === "direkciya"
                  ? (() => {
                      const asg = currentAssignmentForStudent(
                        data.tariffAssignments,
                        s.id
                      );
                      const pkg = asg?.packageStatus ?? "none";
                      return (
                        <>
                          <TableCell>
                            {asg?.tariffName ?? (
                              <span className="text-muted-foreground">Нет тарифа</span>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {asg?.lessonsRemaining == null
                              ? "—"
                              : asg.lessonsRemaining}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {asg?.lessonsUsed ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {asg ? formatDate(asg.endsAt) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {packageStatusLabel[pkg]}
                          </TableCell>
                        </>
                      );
                    })()
                  : null}
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
                      <>
                        <button
                          type="button"
                          className="text-sm font-medium underline-offset-2 hover:underline"
                          onClick={() => {
                            const current = currentAssignmentForStudent(
                              data.tariffAssignments,
                              s.id
                            );
                            setAssignTariffId(current?.tariffId ?? "");
                            setAssignFor(s);
                          }}
                        >
                          Тариф
                        </button>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => openEdit(s)}
                        >
                          Изменить
                        </button>
                      </>
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
              <Label>Класс</Label>
              <Select
                value={form.grade || "__none__"}
                onValueChange={(v) =>
                  v &&
                  setForm({
                    ...form,
                    grade: v === "__none__" ? "" : (v as StudentGrade),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "__none__"
                        ? gradeLabel(null)
                        : gradeLabel(String(v))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{gradeLabel(null)}</SelectItem>
                  {STUDENT_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telegram</Label>
                <Input
                  value={form.telegram}
                  onChange={(e) =>
                    setForm({ ...form, telegram: e.target.value })
                  }
                  placeholder="@username"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 …"
                />
              </div>
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
                    {(v) =>
                      personStatusLabel[v as PersonStatus] ?? "Статус"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {personStatusLabel.active}
                  </SelectItem>
                  <SelectItem value="paused">
                    {personStatusLabel.paused}
                  </SelectItem>
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
                  Новое назначение создаётся только при смене тарифа.
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Контакты родителей</Label>
              <Textarea
                value={form.parentContacts}
                onChange={(e) =>
                  setForm({ ...form, parentContacts: e.target.value })
                }
                placeholder="Имя, телефон, Telegram…"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Внутренние заметки администрации"
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

      <Dialog
        open={!!assignFor}
        onOpenChange={(o) => {
          if (!o) setAssignFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Тариф{assignFor ? ` · ${assignFor.fullName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Назначить тариф</Label>
            <Select
              value={assignTariffId || "__none__"}
              onValueChange={(v) =>
                v && setAssignTariffId(v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) =>
                    !v || v === "__none__"
                      ? "Не выбран"
                      : (data.tariffs.find((t) => t.id === v)?.name ?? "—")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Не выбран</SelectItem>
                {data.tariffs
                  .filter((t) => t.status === "active")
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.lessonsLimit ?? "—"} зан. ·{" "}
                      {t.price.toLocaleString("ru-RU")} ₽
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Создаётся новое назначение со снимком пакета. Предыдущее
              сохраняется в истории как истёкшее.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignFor(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!assignTariffId || assignBusy}
              onClick={() => void saveAssignOnly()}
            >
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
