"use client";

import { TrialLessonStatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, formatTime } from "@/lib/format";
import type { TrialLessonPublic } from "@/lib/trial-lessons";

export function TrialPreviewDialog({
  trial,
  open,
  onOpenChange,
}: {
  trial: TrialLessonPublic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Пробный урок</DialogTitle>
        </DialogHeader>
        {trial ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Потенциальный ученик</span>
              <span className="font-medium">{trial.prospectName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Время</span>
              <span className="tabular-nums">
                {formatDateTime(trial.startsAt)}–{formatTime(trial.endsAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Статус</span>
              <TrialLessonStatusBadge status={trial.lessonStatus} />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Заметки для преподавателя</p>
              <p className="rounded-lg bg-muted/50 px-3 py-2">
                {trial.teacherNotes || "Нет заметок"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Пробный урок нельзя изменить из этого кабинета. Его организует
              сотрудник «Прессы».
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
