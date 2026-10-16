"use client";

import { useState } from "react";

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
  combineDateAndTime,
  durationMinutes,
  fromLocalInput,
  toLocalInputValue,
} from "@/lib/schedule";
import {
  DURATION_OPTIONS,
  type Lesson,
  type LessonStatus,
  type Student,
} from "@/lib/types";

type Initial = Partial<Lesson> & { day?: Date; hour?: number; minute?: number };

type LessonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherId: string;
  students: Student[];
  initial?: Initial;
  onSave: (lesson: Omit<Lesson, "id"> & { id?: string }) => { ok: boolean };
  onDelete?: (id: string) => void;
};

function formKey(initial?: Initial) {
  if (initial?.id) return initial.id;
  if (initial?.day) {
    return `${initial.day.toISOString()}-${initial.hour}-${initial.minute}`;
  }
  return "new";
}

function buildDefaults(initial: Initial | undefined, students: Student[]) {
  if (initial?.id && initial.startsAt && initial.endsAt) {
    return {
      studentId: initial.studentId ?? "",
      subject: initial.subject ?? "",
      startsLocal: toLocalInputValue(initial.startsAt),
      duration: durationMinutes(initial.startsAt, initial.endsAt),
      status: (initial.status ?? "planned") as LessonStatus,
    };
  }
  const day = initial?.day ?? new Date();
  const hour = initial?.hour ?? 10;
  const minute = initial?.minute ?? 0;
  const start = combineDateAndTime(day, hour, minute);
  return {
    studentId: initial?.studentId ?? students[0]?.id ?? "",
    subject: initial?.subject ?? "",
    startsLocal: toLocalInputValue(start.toISOString()),
    duration: 60,
    status: "planned" as LessonStatus,
  };
}

export function LessonDialog({
  open,
  onOpenChange,
  teacherId,
  students,
  initial,
  onSave,
  onDelete,
}: LessonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Редактировать занятие" : "Новое занятие"}
          </DialogTitle>
        </DialogHeader>
        {open ? (
          <LessonForm
            key={formKey(initial)}
            teacherId={teacherId}
            students={students}
            initial={initial}
            onSave={onSave}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LessonForm({
  teacherId,
  students,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  teacherId: string;
  students: Student[];
  initial?: Initial;
  onSave: (lesson: Omit<Lesson, "id"> & { id?: string }) => { ok: boolean };
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const defaults = buildDefaults(initial, students);
  const [studentId, setStudentId] = useState(defaults.studentId);
  const [subject, setSubject] = useState(defaults.subject);
  const [startsLocal, setStartsLocal] = useState(defaults.startsLocal);
  const [duration, setDuration] = useState(defaults.duration);
  const [status, setStatus] = useState<LessonStatus>(defaults.status);

  function save() {
    if (!studentId || !startsLocal) return;
    const startsAt = fromLocalInput(startsLocal);
    const endsAt = new Date(
      new Date(startsAt).getTime() + duration * 60_000
    ).toISOString();
    const result = onSave({
      id: initial?.id,
      teacherId,
      studentId,
      subject: subject.trim() || undefined,
      startsAt,
      endsAt,
      status,
      topicId: status === "done" ? initial?.topicId : undefined,
    });
    if (result.ok) onClose();
  }

  return (
    <>
      <div className="grid gap-3 py-1">
        <div className="space-y-1.5">
          <Label>Ученик</Label>
          <Select value={studentId || null} onValueChange={(v) => v && setStudentId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите ученика">
                {(v) => students.find((s) => s.id === v)?.fullName ?? "Выберите"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Предмет</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Начало</Label>
          <Input
            type="datetime-local"
            value={startsLocal}
            onChange={(e) => setStartsLocal(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Длительность</Label>
          <Select
            value={String(duration)}
            onValueChange={(v) => v && setDuration(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{() => `${duration} мин`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} мин
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Статус</Label>
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as LessonStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) =>
                  v === "done"
                    ? "Проведено"
                    : v === "cancelled"
                      ? "Отменено"
                      : "Запланировано"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Запланировано</SelectItem>
              <SelectItem value="done">Проведено</SelectItem>
              <SelectItem value="cancelled">Отменено</SelectItem>
            </SelectContent>
          </Select>
          {status === "done" ? (
            <p className="text-xs text-muted-foreground">
              Для фиксации темы и посещаемости используйте «Завершить занятие» в
              Кафедре.
            </p>
          ) : null}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {initial?.id && onDelete ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onDelete(initial.id!);
              onClose();
            }}
          >
            Удалить
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" onClick={save}>
            Сохранить
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
