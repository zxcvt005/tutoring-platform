"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  AttendanceStatusBadge,
  LessonStatusBadge,
} from "@/components/status-badge";
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
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type {
  AttendanceStatus,
  Lesson,
  LessonStatus,
} from "@/lib/types";

type FormState = {
  id?: string;
  title: string;
  teacherId: string;
  groupId: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

const attendanceOptions: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
];

export function SchedulePanel({
  mode,
}: {
  mode: "direkciya" | "kafedra";
}) {
  const {
    data,
    upsertLesson,
    deleteLesson,
    setAttendance,
    lessonsForTeacher,
    lessonStudents,
  } = useDemoStore();

  const [open, setOpen] = useState(false);
  const [attendanceLesson, setAttendanceLesson] = useState<Lesson | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    teacherId: data.teachers[0]?.id ?? "",
    groupId: "",
    startsAt: "",
    endsAt: "",
    status: "planned",
  });

  const rows = useMemo(() => {
    const list =
      mode === "kafedra"
        ? lessonsForTeacher(data.currentTeacherId)
        : data.lessons;
    return [...list].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  }, [data.currentTeacherId, data.lessons, lessonsForTeacher, mode]);

  function openCreate() {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    setForm({
      title: "",
      teacherId:
        mode === "kafedra"
          ? data.currentTeacherId
          : (data.teachers[0]?.id ?? ""),
      groupId: "",
      startsAt: toLocalInput(start.toISOString()),
      endsAt: toLocalInput(end.toISOString()),
      status: "planned",
    });
    setOpen(true);
  }

  function openEdit(lesson: Lesson) {
    setForm({
      id: lesson.id,
      title: lesson.title ?? "",
      teacherId: lesson.teacherId,
      groupId: lesson.groupId ?? "",
      startsAt: toLocalInput(lesson.startsAt),
      endsAt: toLocalInput(lesson.endsAt),
      status: lesson.status,
    });
    setOpen(true);
  }

  function save() {
    if (!form.teacherId || !form.startsAt || !form.endsAt) return;
    upsertLesson({
      id: form.id,
      title: form.title.trim() || undefined,
      teacherId: form.teacherId,
      groupId: form.groupId || undefined,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      status: form.status,
    });
    setOpen(false);
  }

  const canEdit = mode === "direkciya" || mode === "kafedra";
  const groupsForForm =
    mode === "kafedra"
      ? data.groups.filter((g) => g.teacherId === data.currentTeacherId)
      : data.groups.filter((g) => g.teacherId === form.teacherId);

  return (
    <div>
      <PageHeader
        title="Расписание"
        description="Список занятий. Посещаемость отмечается из Кафедры (и доступна в Дирекции)."
        actions={
          canEdit ? (
            <Button type="button" onClick={openCreate}>
              Добавить занятие
            </Button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Нет занятий" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Когда</TableHead>
              <TableHead>Тема</TableHead>
              <TableHead>Преподаватель</TableHead>
              <TableHead>Группа</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lesson) => (
              <TableRow key={lesson.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(lesson.startsAt)}
                </TableCell>
                <TableCell className="font-medium">
                  {lesson.title || "Занятие"}
                </TableCell>
                <TableCell>
                  {data.teachers.find((t) => t.id === lesson.teacherId)
                    ?.fullName ?? "—"}
                </TableCell>
                <TableCell>
                  {lesson.groupId
                    ? (data.groups.find((g) => g.id === lesson.groupId)
                        ?.title ?? "—")
                    : lesson.studentIds?.length
                      ? "Индивидуал"
                      : "—"}
                </TableCell>
                <TableCell>
                  <LessonStatusBadge status={lesson.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setAttendanceLesson(lesson)}
                    >
                      Посещ.
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(lesson)}
                    >
                      Изменить
                    </Button>
                    {mode === "direkciya" ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteLesson(lesson.id)}
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
              {form.id ? "Редактировать занятие" : "Новое занятие"}
            </DialogTitle>
            <DialogDescription>
              Расписание в виде таблицы — без календарной сетки.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="l-title">Тема</Label>
              <Input
                id="l-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
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
              <Label>Группа</Label>
              <Select
                value={form.groupId || "__none__"}
                onValueChange={(v) => {
                  if (v)
                    setForm((f) => ({
                      ...f,
                      groupId: v === "__none__" ? "" : v,
                    }));
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="l-start">Начало</Label>
                <Input
                  id="l-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startsAt: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-end">Конец</Label>
                <Input
                  id="l-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endsAt: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  if (v) setForm((f) => ({ ...f, status: v as LessonStatus }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Запланировано</SelectItem>
                  <SelectItem value="done">Проведено</SelectItem>
                  <SelectItem value="cancelled">Отменено</SelectItem>
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

      <Dialog
        open={Boolean(attendanceLesson)}
        onOpenChange={(v) => {
          if (!v) setAttendanceLesson(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Посещаемость</DialogTitle>
            <DialogDescription>
              {attendanceLesson?.title || "Занятие"} ·{" "}
              {attendanceLesson
                ? formatDateTime(attendanceLesson.startsAt)
                : ""}
            </DialogDescription>
          </DialogHeader>
          {attendanceLesson ? (
            <div className="space-y-2">
              {lessonStudents(attendanceLesson).length === 0 ? (
                <EmptyState
                  title="Нет учеников у занятия"
                  description="Привяжите группу или учеников."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ученик</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Отметить</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lessonStudents(attendanceLesson).map((student) => {
                      const current = data.attendances.find(
                        (a) =>
                          a.lessonId === attendanceLesson.id &&
                          a.studentId === student.id
                      );
                      return (
                        <TableRow key={student.id}>
                          <TableCell>{student.fullName}</TableCell>
                          <TableCell>
                            {current ? (
                              <AttendanceStatusBadge status={current.status} />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                не отмечен
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={current?.status ?? "__none__"}
                              onValueChange={(v) => {
                                if (!v || v === "__none__") return;
                                setAttendance(
                                  attendanceLesson.id,
                                  student.id,
                                  v as AttendanceStatus
                                );
                              }}
                            >
                              <SelectTrigger className="w-36" size="sm">
                                <SelectValue placeholder="Статус" />
                              </SelectTrigger>
                              <SelectContent>
                                {attendanceOptions.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {
                                      {
                                        present: "Был",
                                        absent: "Пропуск",
                                        late: "Опоздал",
                                        excused: "Уваж. причина",
                                      }[opt]
                                    }
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setAttendanceLesson(null)}
            >
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
