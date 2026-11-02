"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import {
  ReminderDialog,
  type ReminderDraft,
} from "@/components/pressa/reminder-dialog";
import {
  ReminderList,
  type ReminderRow,
} from "@/components/pressa/reminder-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  reminderCompletionProgress,
  type PressReminderView,
} from "@/lib/press-reminders";
import { apiPressGet } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

export function PressRemindersWorkspace({
  embeddedToday = false,
}: {
  embeddedToday?: boolean;
}) {
  const [view, setView] = useState<PressReminderView>(
    embeddedToday ? "today" : "today"
  );
  const [kind, setKind] = useState<"all" | "once" | "recurring">("all");
  const [status, setStatus] = useState<"all" | "active" | "disabled" | "archived">(
    "all"
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiPressGet<{ reminders: ReminderRow[] }>("reminders", {
        view: embeddedToday ? "today" : view,
        kind: kind === "all" ? undefined : kind,
        status: view === "all" && status !== "all" ? status : undefined,
        from: view === "all" || view === "completed" ? from || undefined : undefined,
        to: view === "all" || view === "completed" ? to || undefined : undefined,
      });
      setRows(data.reminders);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить напоминания");
    } finally {
      setLoading(false);
    }
  }, [embeddedToday, view, kind, status, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const todayView = embeddedToday || view === "today";
  const progress = reminderCompletionProgress(rows);

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing(null);
        setDialogOpen(true);
      }}
    >
      Добавить напоминание
    </Button>
  );

  return (
    <div>
      {embeddedToday ? null : (
        <PageHeader
          title="Напоминания"
          description="Личные напоминания только текущего сотрудника «Прессы». Они не создаются из учеников, пробных уроков или расписания."
          actions={addButton}
        />
      )}
      {embeddedToday ? (
        <div className="mb-4 flex justify-end">{addButton}</div>
      ) : (
        <FilterBar>
          <Select
            value={view}
            onValueChange={(v) => v && setView(v as PressReminderView)}
          >
            <SelectTrigger className="w-[200px] rounded-full">
              <SelectValue>
                {(v) =>
                  v === "upcoming"
                    ? "Предстоящие"
                    : v === "completed"
                      ? "Выполненные"
                      : v === "all"
                        ? "Все"
                        : "Сегодня"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Сегодня</SelectItem>
              <SelectItem value="upcoming">Предстоящие</SelectItem>
              <SelectItem value="completed">Выполненные</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={kind}
            onValueChange={(v) =>
              v && setKind(v as "all" | "once" | "recurring")
            }
          >
            <SelectTrigger className="w-[180px] rounded-full">
              <SelectValue>
                {(v) =>
                  v === "once"
                    ? "Разовые"
                    : v === "recurring"
                      ? "Регулярные"
                      : "Любой тип"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Любой тип</SelectItem>
              <SelectItem value="once">Разовые</SelectItem>
              <SelectItem value="recurring">Регулярные</SelectItem>
            </SelectContent>
          </Select>
          {view === "all" ? (
            <Select
              value={status}
              onValueChange={(v) =>
                v &&
                setStatus(v as "all" | "active" | "disabled" | "archived")
              }
            >
              <SelectTrigger className="w-[180px] rounded-full">
                <SelectValue>
                  {(v) =>
                    v === "active"
                      ? "Активные"
                      : v === "disabled"
                        ? "Отключённые"
                        : v === "archived"
                          ? "Архив"
                          : "Любой статус"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любой статус</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="disabled">Отключённые</SelectItem>
                <SelectItem value="archived">Архив</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {view === "all" || view === "completed" ? (
            <>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
              />
            </>
          ) : null}
        </FilterBar>
      )}

      {todayView && !loading ? (
        rows.length === 0 ? null : (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Выполнено {progress.completed} из {progress.total}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.completed}
              aria-label="Прогресс напоминаний на сегодня"
            >
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                )}
                style={{
                  width: progress.total === 0 ? "0%" : `${progress.percent}%`,
                }}
              />
            </div>
          </div>
        )
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            embeddedToday || view === "today"
              ? "На сегодня напоминаний нет"
              : "Напоминаний нет"
          }
          description="Создайте личное напоминание кнопкой «Добавить напоминание»."
        />
      ) : (
        <ReminderList
          items={rows}
          allowComplete={view !== "completed"}
          onEdit={(item) => {
            setEditing(item);
            setDialogOpen(true);
          }}
          onChanged={() => void load()}
        />
      )}

      <ReminderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reminder={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
