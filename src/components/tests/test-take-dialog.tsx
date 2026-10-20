"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { QuestionFields } from "@/components/tests/question-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDueAt } from "@/lib/format";
import {
  emptyAnswersForQuestions,
  getAssignmentQuestions,
  getAssignmentTitle,
} from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment, StudentAnswer } from "@/lib/types";

export function TestTakeDialog({
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {assignment ? (
          <TestTakeForm
            key={`${assignment.id}-${assignment.status}`}
            assignment={assignment}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TestTakeForm({
  assignment,
  onClose,
}: {
  assignment: HomeworkAssignment;
  onClose: () => void;
}) {
  const {
    data,
    saveHomeworkDraft,
    submitHomeworkAssignment,
  } = useDemoStore();

  const hw = data.homeworks.find((h) => h.id === assignment.homeworkId);
  const topic = data.topics.find((t) => t.id === assignment.topicId);
  const questions = useMemo(
    () => getAssignmentQuestions(assignment, hw),
    [assignment, hw]
  );
  const title = getAssignmentTitle(assignment, hw);

  const canEdit =
    assignment.status === "assigned" ||
    assignment.status === "in_progress" ||
    assignment.status === "overdue";
  const isReviewed = assignment.status === "reviewed";
  const isSubmitted =
    assignment.status === "completed" || assignment.status === "reviewed";
  const revealKey = isReviewed;

  const [answers, setAnswers] = useState<StudentAnswer[]>(() => {
    if (assignment.answers?.length) {
      const byId = new Map(assignment.answers.map((a) => [a.questionId, a]));
      return questions.map((q) => {
        const existing = byId.get(q.id);
        if (existing) return { ...existing };
        return emptyAnswersForQuestions([q])[0]!;
      });
    }
    return emptyAnswersForQuestions(questions);
  });

  function setAnswer(questionId: string, next: StudentAnswer) {
    setAnswers((prev) =>
      prev.map((a) => (a.questionId === questionId ? next : a))
    );
  }

  function handleSaveDraft() {
    void (async () => {
      const result = await saveHomeworkDraft(assignment.id, answers);
      if (!result.ok) toast.error(result.error || "Не удалось сохранить");
    })();
  }

  function handleSubmit() {
    void (async () => {
      const result = await submitHomeworkAssignment(assignment.id, answers);
      if (!result.ok) {
        toast.error(result.error || "Не удалось отправить");
        return;
      }
      onClose();
    })();
  }

  const pendingManual =
    isSubmitted &&
    !isReviewed &&
    (assignment.answers ?? []).some(
      (a) => a.needsManualReview && a.manualScore == null
    );

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4">
        <DialogTitle>{title}</DialogTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <HomeworkAssignmentStatusBadge
            status={assignment.status}
            perspective="student"
          />
          <span>Срок: {formatDueAt(assignment.dueAt)}</span>
          {topic ? <span>· {topic.title}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {questions.length} вопр. · макс.{" "}
          {assignment.maxScore ??
            assignment.testSnapshot?.maxScore ??
            "—"}{" "}
          б.
        </p>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {assignment.testSnapshot?.description || hw?.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {assignment.testSnapshot?.description || hw?.description}
          </p>
        ) : null}

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В этом тесте пока нет заданий.
          </p>
        ) : (
          questions.map((q, index) => {
            const answer = answers.find((a) => a.questionId === q.id);
            return (
              <QuestionFields
                key={q.id}
                question={q}
                index={index}
                mode={canEdit ? "take" : "review"}
                answer={answer}
                onAnswerChange={
                  canEdit ? (a) => setAnswer(q.id, a) : undefined
                }
                revealKey={revealKey}
              />
            );
          })
        )}

        {isReviewed ? (
          <div className="space-y-2 rounded-xl border border-border/80 surface-mint px-3.5 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Итог
            </p>
            {assignment.score != null ? (
              <p className="font-display text-lg font-semibold tabular-nums">
                {assignment.score}
                {assignment.maxScore != null
                  ? ` / ${assignment.maxScore}`
                  : ""}
                {assignment.maxScore
                  ? ` · ${Math.round(
                      (assignment.score / assignment.maxScore) * 100
                    )}%`
                  : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Балл не выставлен</p>
            )}
            {assignment.feedback ? (
              <p className="text-sm leading-relaxed">{assignment.feedback}</p>
            ) : null}
          </div>
        ) : null}

        {pendingManual ? (
          <p className="text-sm text-muted-foreground">
            Работа отправлена. Итоговый балл появится после проверки
            развёрнутых ответов преподавателем.
          </p>
        ) : null}
      </div>

      <DialogFooter className="shrink-0 border-t border-border/70 px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Закрыть
        </Button>
        {canEdit ? (
          <>
            <Button type="button" variant="outline" onClick={handleSaveDraft}>
              Сохранить черновик
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={questions.length === 0}
            >
              Отправить
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}
