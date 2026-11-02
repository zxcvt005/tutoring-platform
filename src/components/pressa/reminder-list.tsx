"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/format";
import {
  pressReminderFrequencyLabel,
  pressReminderKindLabel,
  pressReminderStatusLabel,
  type PressReminderFrequency,
  type PressReminderKind,
  type PressReminderStatus,
} from "@/lib/press-reminders";
import { apiPress } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

import type { ReminderDraft } from "@/components/pressa/reminder-dialog";

export type ReminderRow = {
  id: string;
  title: string;
  description: string;
  kind: PressReminderKind;
  frequency: PressReminderFrequency | null;
  startAt: string;
  currentDueAt: string;
  occurrenceAt: string;
  completedAt: string | null;
  status: PressReminderStatus;
};

export function ReminderList({
  items,
  onEdit,
  onChanged,
  allowComplete = true,
}: {
  items: ReminderRow[];
  onEdit?: (item: ReminderDraft) => void;
  onChanged: () => void;
  allowComplete?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disableId, setDisableId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);

  async function complete(item: ReminderRow) {
    if (item.completedAt || item.status !== "active") return;
    const busyKey = `${item.id}:${item.occurrenceAt}`;
    setBusyId(busyKey);
    try {
      await apiPress("completeReminder", {
        id: item.id,
        occurrenceAt: item.occurrenceAt,
      });
      toast.success("Напоминание выполнено");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отметить");
    } finally {
      setBusyId(null);
    }
  }

  async function uncomplete(item: ReminderRow) {
    if (!item.completedAt || item.status !== "active") return;
    const busyKey = `${item.id}:${item.occurrenceAt}`;
    setBusyId(busyKey);
    try {
      await apiPress("uncompleteReminder", {
        id: item.id,
        occurrenceAt: item.occurrenceAt,
      });
      toast.success("Отметка снята");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось снять отметку");
    } finally {
      setBusyId(null);
    }
  }

  async function disable() {
    if (!disableId) return;
    setBusyId(disableId);
    try {
      await apiPress("disableReminder", { id: disableId });
      toast.success("Серия отключена");
      setDisableId(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отключить");
    } finally {
      setBusyId(null);
    }
  }

  async function archive() {
    if (!archiveId) return;
    setBusyId(archiveId);
    try {
      await apiPress("archiveReminder", { id: archiveId });
      toast.success("Напоминание архивировано");
      setArchiveId(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось архивировать");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const done = Boolean(item.completedAt);
          return (
            <li
              key={`${item.id}:${item.occurrenceAt}`}
              className={cn(
                "panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                done && "opacity-80"
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                {allowComplete && item.status === "active" ? (
                  <Checkbox
                    checked={done}
                    disabled={busyId === `${item.id}:${item.occurrenceAt}`}
                    onCheckedChange={(checked) => {
                      if (checked === true) void complete(item);
                      else if (checked === false) void uncomplete(item);
                    }}
                    aria-label={done ? "Снять отметку выполнения" : "Отметить выполненным"}
                  />
                ) : done ? (
                  <Check className="mt-0.5 text-success" />
                ) : null}
                <span className="min-w-0">
                  <span className="block font-medium">{item.title}</span>
                  {item.description ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDateTime(item.occurrenceAt)}
                    {" · "}
                    {pressReminderKindLabel[item.kind]}
                    {item.frequency
                      ? ` · ${pressReminderFrequencyLabel[item.frequency]}`
                      : ""}
                    {done
                      ? " · Выполнено"
                      : ` · ${pressReminderStatusLabel[item.status]}`}
                    {done && item.completedAt
                      ? ` · ${formatDateTime(item.completedAt)}`
                      : ""}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {onEdit && item.status !== "archived" && !done ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onEdit({
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        kind: item.kind,
                        frequency: item.frequency,
                        startAt: item.startAt,
                      })
                    }
                  >
                    Изменить
                  </Button>
                ) : null}
                {item.kind === "recurring" && item.status === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDisableId(item.id)}
                  >
                    Отключить серию
                  </Button>
                ) : null}
                {item.status !== "archived" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setArchiveId(item.id)}
                  >
                    В архив
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={Boolean(disableId)}
        title="Отключить регулярную серию?"
        description="Будущие повторения больше не будут активными. Выполненные записи останутся в истории."
        confirmLabel="Отключить"
        busy={busyId === disableId || busyId?.startsWith(`${disableId}:`) === true}
        onOpenChange={(open) => {
          if (!open) setDisableId(null);
        }}
        onConfirm={() => void disable()}
      />
      <ConfirmDialog
        open={Boolean(archiveId)}
        title="Архивировать напоминание?"
        description="Оно исчезнет из активных списков. История выполнений сохранится."
        confirmLabel="В архив"
        busy={busyId === archiveId}
        onOpenChange={(open) => {
          if (!open) setArchiveId(null);
        }}
        onConfirm={() => void archive()}
      />
    </>
  );
}
