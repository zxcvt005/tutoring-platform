"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { lessonStatusLabel } from "@/lib/format";
import {
  firstUpcomingOccurrence,
  jsDayToWeekday,
} from "@/lib/recurring-schedule";
import {
  combineDateAndTime,
  durationMinutes,
  fromLocalInput,
  toLocalInputValue,
  uniqueStudentIds,
} from "@/lib/schedule";
import {
  DURATION_OPTIONS,
  type Lesson,
  type LessonStatus,
  type Student,
} from "@/lib/types";

type Initial = Partial<Lesson> & { day?: Date; hour?: number; minute?: number };

export type RecurringSaveInput = {
  teacherId: string;
  studentIds: string[];
  weekdays: number[];
  startTime: string;
  durationMin: number;
  subject?: string;
  activeFrom?: string;
};

type LessonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherId: string;
  students: Student[];
  initial?: Initial;
  onSave: (
    lesson: Omit<Lesson, "id"> & { id?: string }
  ) => { ok: boolean } | Promise<{ ok: boolean }>;
  onSaveRecurring?: (
    input: RecurringSaveInput
  ) => { ok: boolean } | Promise<{ ok: boolean }>;
  onDelete?: (id: string) => void;
};

const WEEKDAY_OPTS = [
  { v: 1, label: "Пн" },
  { v: 2, label: "Вт" },
  { v: 3, label: "Ср" },
  { v: 4, label: "Чт" },
  { v: 5, label: "Пт" },
  { v: 6, label: "Сб" },
  { v: 7, label: "Вс" },
];

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
      studentIds: uniqueStudentIds(initial.studentIds ?? []),
      subject: initial.subject ?? "",
      startsLocal: toLocalInputValue(initial.startsAt),
      duration: durationMinutes(initial.startsAt, initial.endsAt),
      status: (initial.status ?? "planned") as LessonStatus,
      defaultWeekday: jsDayToWeekday(new Date(initial.startsAt).getDay()),
    };
  }
  const day = initial?.day ?? new Date();
  const hour = initial?.hour ?? 10;
  const minute = initial?.minute ?? 0;
  const start = combineDateAndTime(day, hour, minute);
  const preset = uniqueStudentIds(initial?.studentIds ?? []);
  return {
    studentIds: preset.length ? preset : students[0] ? [students[0].id] : [],
    subject: initial?.subject ?? "",
    startsLocal: toLocalInputValue(start.toISOString()),
    duration: 60,
    status: "planned" as LessonStatus,
    defaultWeekday: jsDayToWeekday(day.getDay()),
  };
}

export function LessonDialog({
  open,
  onOpenChange,
  teacherId,
  students,
  initial,
  onSave,
  onSaveRecurring,
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
            onSaveRecurring={onSaveRecurring}
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
  onSaveRecurring,
  onDelete,
  onClose,
}: {
  teacherId: string;
  students: Student[];
  initial?: Initial;
  onSave: (
    lesson: Omit<Lesson, "id"> & { id?: string }
  ) => { ok: boolean } | Promise<{ ok: boolean }>;
  onSaveRecurring?: (
    input: RecurringSaveInput
  ) => { ok: boolean } | Promise<{ ok: boolean }>;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const defaults = buildDefaults(initial, students);
  const isEdit = Boolean(initial?.id);
  const [studentIds, setStudentIds] = useState<string[]>(defaults.studentIds);
  const [subject, setSubject] = useState(defaults.subject);
  const [startsLocal, setStartsLocal] = useState(defaults.startsLocal);
  const [duration, setDuration] = useState(defaults.duration);
  const [status, setStatus] = useState<LessonStatus>(defaults.status);
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([defaults.defaultWeekday]);

  const preview = useMemo(() => {
    if (!recurring || !startsLocal) return null;
    const start = new Date(fromLocalInput(startsLocal));
    const hh = String(start.getHours()).padStart(2, "0");
    const mm = String(start.getMinutes()).padStart(2, "0");
    return firstUpcomingOccurrence(
      {
        weekdays,
        startTime: `${hh}:${mm}`,
        durationMin: duration,
        activeFrom: new Date(),
      },
      new Date()
    );
  }, [recurring, startsLocal, weekdays, duration]);

  function toggleStudent(id: string, checked: boolean) {
    setStudentIds((prev) => {
      if (checked) return uniqueStudentIds([...prev, id]);
      return prev.filter((x) => x !== id);
    });
  }

  function toggleWeekday(v: number, checked: boolean) {
    setWeekdays((prev) => {
      if (checked) return [...new Set([...prev, v])].sort();
      return prev.filter((x) => x !== v);
    });
  }

  function save() {
    const ids = uniqueStudentIds(studentIds);
    if (!ids.length || !startsLocal) return;
    void (async () => {
      if (recurring && !isEdit && onSaveRecurring) {
        const start = new Date(fromLocalInput(startsLocal));
        const hh = String(start.getHours()).padStart(2, "0");
        const mm = String(start.getMinutes()).padStart(2, "0");
        if (weekdays.length === 0) return;
        const result = await onSaveRecurring({
          teacherId,
          studentIds: ids,
          weekdays,
          startTime: `${hh}:${mm}`,
          durationMin: duration,
          subject: subject.trim() || undefined,
          activeFrom: new Date().toISOString(),
        });
        if (result.ok) onClose();
        return;
      }
      const startsAt = fromLocalInput(startsLocal);
      const endsAt = new Date(
        new Date(startsAt).getTime() + duration * 60_000
      ).toISOString();
      const result = await onSave({
        id: initial?.id,
        teacherId,
        studentIds: ids,
        subject: subject.trim() || undefined,
        startsAt,
        endsAt,
        status,
        topicId: status === "done" ? initial?.topicId : undefined,
      });
      if (result.ok) onClose();
    })();
  }

  return (
    <>
      <div className="grid gap-3 py-1">
        <div className="space-y-1.5">
          <Label>Ученики</Label>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет активных учеников у этого преподавателя.
            </p>
          ) : (
            <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border/80 p-2">
              {students.map((s) => {
                const checked = studentIds.includes(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2 px-1 py-0.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleStudent(s.id, v === true)}
                      id={`lesson-student-${s.id}`}
                    />
                    <label
                      htmlFor={`lesson-student-${s.id}`}
                      className="cursor-pointer text-sm leading-snug"
                    >
                      {s.fullName}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Предмет / тема</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{recurring ? "Время (день — образец)" : "Начало"}</Label>
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

        {!isEdit && onSaveRecurring ? (
          <div className="space-y-2 rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={recurring}
                onCheckedChange={(v) => setRecurring(v === true)}
                id="lesson-recurring"
              />
              <label htmlFor="lesson-recurring" className="text-sm font-medium">
                Повторять каждую неделю
              </label>
            </div>
            {recurring ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTS.map((d) => (
                    <label
                      key={d.v}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <Checkbox
                        checked={weekdays.includes(d.v)}
                        onCheckedChange={(v) =>
                          toggleWeekday(d.v, v === true)
                        }
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Занятия создаются только в будущем. Если день на этой неделе
                  уже прошёл — первое занятие на следующей неделе.
                  {preview
                    ? ` Ближайшее: ${preview.startsAt.toLocaleString("ru-RU")}.`
                    : " Нет подходящих слотов в ближайшие дни."}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {!recurring ? (
          <div className="space-y-1.5">
            <Label>Статус</Label>
            <Select
              value={status}
              onValueChange={(v) => v && setStatus(v as LessonStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => lessonStatusLabel[v as LessonStatus] ?? "Статус"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">
                  {lessonStatusLabel.planned}
                </SelectItem>
                <SelectItem value="done">{lessonStatusLabel.done}</SelectItem>
                <SelectItem value="cancelled">
                  {lessonStatusLabel.cancelled}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
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
          <Button
            type="button"
            onClick={save}
            disabled={
              studentIds.length === 0 || (recurring && weekdays.length === 0)
            }
          >
            Сохранить
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
