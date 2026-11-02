"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { appDateKey, appTimeHm, fromAppDateTime } from "@/lib/app-time";
import {
  pressReminderFrequencyLabel,
  type PressReminderFrequency,
  type PressReminderKind,
} from "@/lib/press-reminders";
import { apiPress } from "@/lib/store/api-client";

export type ReminderDraft = {
  id: string;
  title: string;
  description: string;
  kind: PressReminderKind;
  frequency: PressReminderFrequency | null;
  startAt: string;
};

export function ReminderDialog({
  open,
  onOpenChange,
  reminder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: ReminderDraft | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ReminderDialogForm
          key={reminder?.id ?? "new"}
          reminder={reminder}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function ReminderDialogForm({
  reminder,
  onOpenChange,
  onSaved,
}: {
  reminder?: ReminderDraft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [description, setDescription] = useState(reminder?.description ?? "");
  const [kind, setKind] = useState<PressReminderKind>(reminder?.kind ?? "once");
  const [frequency, setFrequency] = useState<PressReminderFrequency>(
    reminder?.frequency ?? "daily"
  );
  const [date, setDate] = useState(
    reminder?.startAt ? appDateKey(reminder.startAt) : appDateKey(new Date())
  );
  const [time, setTime] = useState(
    reminder?.startAt ? appTimeHm(reminder.startAt) : "09:00"
  );
  const [busy, setBusy] = useState(false);

  const startAtIso = useMemo(() => {
    try {
      return fromAppDateTime(date, time).toISOString();
    } catch {
      return "";
    }
  }, [date, time]);

  async function save() {
    if (!title.trim()) {
      toast.error("Укажите название");
      return;
    }
    if (!startAtIso) {
      toast.error("Укажите дату и время");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title,
        description,
        kind,
        frequency: kind === "recurring" ? frequency : null,
        startAt: startAtIso,
      };
      if (reminder) {
        await apiPress("updateReminder", { id: reminder.id, ...payload });
        toast.success("Напоминание обновлено");
      } else {
        await apiPress("createReminder", payload);
        toast.success("Напоминание создано");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {reminder ? "Редактировать напоминание" : "Новое напоминание"}
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Название</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Перезвонить родителю"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Описание</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Необязательно"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Тип</Label>
          <Select
            value={kind}
            onValueChange={(v) => v && setKind(v as PressReminderKind)}
          >
            <SelectTrigger>
              <SelectValue>
                {(v) => (v === "recurring" ? "Регулярное" : "Разовое")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Разовое</SelectItem>
              <SelectItem value="recurring">Регулярное</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {kind === "recurring" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Частота</Label>
            <Select
              value={frequency}
              onValueChange={(v) =>
                v && setFrequency(v as PressReminderFrequency)
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {(v) =>
                    pressReminderFrequencyLabel[v as PressReminderFrequency]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Ежедневно</SelectItem>
                <SelectItem value="weekly">
                  Еженедельно — в день недели даты начала
                </SelectItem>
                <SelectItem value="monthly">
                  Ежемесячно — в день месяца даты начала
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Дата начала</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Время</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Сохранение…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
