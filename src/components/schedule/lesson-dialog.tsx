"use client";

import { useMemo, useState } from "react";

import { StudentSearchSelect } from "@/components/schedule/student-search-select";
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
import {
  appZonedParts,
  formatInAppZone,
  fromAppDateOnly,
  parseAppInstant,
} from "@/lib/app-time";
import { firstUpcomingOccurrence } from "@/lib/recurring-schedule";
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
  activeUntil?: string;
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

function buildDefaults(initial: Initial | undefined) {
  if (initial?.id && initial.startsAt && initial.endsAt) {
    const ids = uniqueStudentIds(initial.studentIds ?? []);
    return {
      studentId: ids[0] ?? "",
      startsLocal: toLocalInputValue(initial.startsAt),
      duration: durationMinutes(initial.startsAt, initial.endsAt),
      defaultWeekday: appZonedParts(initial.startsAt).weekday,
      fromSlot: false,
    };
  }
  const day = initial?.day ?? new Date();
  const hour = initial?.hour ?? 10;
  const minute = initial?.minute ?? 0;
  const start = combineDateAndTime(day, hour, minute);
  const preset = uniqueStudentIds(initial?.studentIds ?? []);
  return {
    studentId: preset[0] ?? "",
    startsLocal: toLocalInputValue(start.toISOString()),
    duration: 60,
    defaultWeekday: appZonedParts(day).weekday,
    fromSlot: Boolean(initial?.day != null),
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
            {initial?.id ? "Запись расписания" : "Новая запись расписания"}
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
  const defaults = buildDefaults(initial);
  const isEdit = Boolean(initial?.id);
  const fromSlot = defaults.fromSlot;
  const [studentId, setStudentId] = useState(defaults.studentId);
  const [startsLocal, setStartsLocal] = useState(defaults.startsLocal);
  const [duration, setDuration] = useState(defaults.duration);
  const [repeat, setRepeat] = useState(
    () => !isEdit && Boolean(onSaveRecurring)
  );
  const [weekdays, setWeekdays] = useState<number[]>([defaults.defaultWeekday]);
  const [activeFrom, setActiveFrom] = useState(() =>
    defaults.startsLocal.slice(0, 10)
  );
  const [activeUntil, setActiveUntil] = useState("");
  const [startTime, setStartTime] = useState(() => {
    const m = defaults.startsLocal.match(/T(\d{2}:\d{2})/);
    return m?.[1] ?? "10:00";
  });
  const [showSeriesExtras, setShowSeriesExtras] = useState(false);

  const preview = useMemo(() => {
    if (!repeat || !startTime) return null;
    const from = activeFrom ? fromAppDateOnly(activeFrom) : new Date();
    const until = activeUntil
      ? parseAppInstant(activeUntil, true)
      : null;
    return firstUpcomingOccurrence(
      {
        weekdays,
        startTime,
        durationMin: duration,
        activeFrom: from,
        activeUntil: until,
      },
      new Date()
    );
  }, [repeat, startTime, weekdays, duration, activeFrom, activeUntil]);

  function toggleWeekday(v: number, checked: boolean) {
    setWeekdays((prev) => {
      if (checked) return [...new Set([...prev, v])].sort();
      return prev.filter((x) => x !== v);
    });
  }

  function save() {
    if (!studentId) return;
    void (async () => {
      if (repeat && !isEdit && onSaveRecurring) {
        const days = fromSlot ? [defaults.defaultWeekday] : weekdays;
        if (days.length === 0 || !startTime) return;
        const result = await onSaveRecurring({
          teacherId,
          studentIds: [studentId],
          weekdays: days,
          startTime,
          durationMin: duration,
          activeFrom: activeFrom || undefined,
          activeUntil:
            !fromSlot || showSeriesExtras
              ? activeUntil || undefined
              : undefined,
        });
        if (result.ok) onClose();
        return;
      }
      const startsAt = fromLocalInput(
        repeat
          ? `${activeFrom}T${startTime}`
          : startsLocal
      );
      const endsAt = new Date(
        new Date(startsAt).getTime() + duration * 60_000
      ).toISOString();
      const result = await onSave({
        id: initial?.id,
        teacherId,
        studentIds: [studentId],
        startsAt,
        endsAt,
        status: initial?.status ?? "planned",
        topicId: initial?.topicId,
        subject: initial?.subject,
      });
      if (result.ok) onClose();
    })();
  }

  const slotSummary = formatInAppZone(fromLocalInput(startsLocal), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div className="grid gap-3 py-1">
        <p className="text-xs text-muted-foreground">
          Расписание задаёт только слот: ученик, дата и время. Тема, посещаемость
          и домашнее задание отмечаются после занятия.
        </p>
        <div className="space-y-1.5">
          <Label>Ученик</Label>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет активных учеников у этого преподавателя.
            </p>
          ) : isEdit ? (
            <p className="text-sm font-medium">
              {students.find((s) => s.id === studentId)?.fullName ?? "Ученик"}
            </p>
          ) : (
            <StudentSearchSelect
              students={students}
              value={studentId}
              onChange={setStudentId}
            />
          )}
        </div>

        {!isEdit && onSaveRecurring ? (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={repeat}
              onCheckedChange={(v) => setRepeat(v === true)}
              id="lesson-repeat"
            />
            <label htmlFor="lesson-repeat" className="text-sm font-medium">
              Повторять каждую неделю
            </label>
          </div>
        ) : null}

        {fromSlot && !isEdit ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Дата и время слота</p>
            <p className="font-medium capitalize">{slotSummary}</p>
            {repeat ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Повторение с этого дня недели, без срока окончания — до удаления
                или изменения преподавателем.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Будет создано одно занятие на выбранную дату.
              </p>
            )}
          </div>
        ) : null}

        {repeat && !isEdit ? (
          <>
            {fromSlot ? (
              <>
                <div className="space-y-1.5">
                  <Label>Время</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="text-left text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowSeriesExtras((v) => !v)}
                >
                  {showSeriesExtras
                    ? "Скрыть дополнительные параметры серии"
                    : "Дополнительные параметры серии…"}
                </button>
                {showSeriesExtras ? (
                  <div className="space-y-1.5">
                    <Label>Дата окончания (необязательно)</Label>
                    <Input
                      type="date"
                      value={activeUntil}
                      onChange={(e) => setActiveUntil(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Время</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Дата начала</Label>
                    <Input
                      type="date"
                      value={activeFrom}
                      onChange={(e) => setActiveFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Дата окончания</Label>
                    <Input
                      type="date"
                      value={activeUntil}
                      onChange={(e) => setActiveUntil(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Дни недели</Label>
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
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              На каждую выбранную дату создаётся отдельный слот этого ученика.
              {preview
                ? ` Ближайший: ${formatInAppZone(preview.startsAt, {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}.`
                : " Нет подходящих слотов в ближайшие дни."}
            </p>
          </>
        ) : !fromSlot || isEdit ? (
          <div className="space-y-1.5">
            <Label>Дата и время</Label>
            <Input
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </div>
        ) : !repeat ? (
          <div className="space-y-1.5">
            <Label>Дата и время</Label>
            <Input
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </div>
        ) : null}

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
            Удалить слот
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
              !studentId ||
              (repeat &&
                !fromSlot &&
                weekdays.length === 0)
            }
          >
            Сохранить
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
