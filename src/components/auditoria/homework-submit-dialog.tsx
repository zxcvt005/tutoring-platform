"use client";

import { useState } from "react";
import { toast } from "sonner";

import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

function HomeworkSubmitForm({
  assignment,
  onClose,
}: {
  assignment: HomeworkAssignment;
  onClose: () => void;
}) {
  const { data, submitHomeworkAssignment } = useDemoStore();
  const [answer, setAnswer] = useState(assignment.answerText ?? "");

  const hw = data.homeworks.find((h) => h.id === assignment.homeworkId);
  const topic = data.topics.find((t) => t.id === assignment.topicId);
  const canSubmit =
    assignment.status === "assigned" || assignment.status === "overdue";
  const isReviewed = assignment.status === "reviewed";

  function handleSubmit() {
    const result = submitHomeworkAssignment(assignment.id, answer);
    if (!result.ok) {
      toast.error(result.error || "Не удалось отправить");
      return;
    }
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{hw?.title ?? "Домашнее задание"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <HomeworkAssignmentStatusBadge
            status={assignment.status}
            perspective="student"
          />
          <span className="text-muted-foreground">
            Срок: {formatDateTime(assignment.dueAt)}
          </span>
        </div>

        {topic ? (
          <p className="text-muted-foreground">
            Тема: <span className="text-foreground">{topic.title}</span>
          </p>
        ) : null}

        {hw?.description ? (
          <div className="rounded-xl border border-border/80 bg-muted/40 px-3.5 py-3">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Условие
            </p>
            <p className="leading-relaxed whitespace-pre-wrap">
              {hw.description}
            </p>
          </div>
        ) : null}

        {isReviewed ? (
          <div className="space-y-2 rounded-xl border border-border/80 surface-mint px-3.5 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Результат проверки
            </p>
            {assignment.score != null ? (
              <p className="font-display text-lg font-semibold tabular-nums">
                {assignment.score}
                {assignment.maxScore != null ? ` / ${assignment.maxScore}` : ""}
              </p>
            ) : (
              <p className="text-muted-foreground">Балл не выставлен</p>
            )}
            {assignment.feedback ? (
              <p className="leading-relaxed">{assignment.feedback}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="hw-answer">
            {canSubmit ? "Ваш ответ" : "Отправленный ответ"}
          </Label>
          <Textarea
            id="hw-answer"
            rows={6}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            readOnly={!canSubmit}
            placeholder={
              canSubmit
                ? "Кратко опишите решение или вставьте текст ответа…"
                : "Ответ ещё не отправлен"
            }
            className={!canSubmit ? "bg-muted/50" : undefined}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Закрыть
        </Button>
        {canSubmit ? (
          <Button type="button" onClick={handleSubmit}>
            Отправить на проверку
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function HomeworkSubmitDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: HomeworkAssignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {assignment ? (
          <HomeworkSubmitForm
            key={assignment.id}
            assignment={assignment}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
