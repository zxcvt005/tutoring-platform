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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDueAt } from "@/lib/format";
import { computeFinalScore } from "@/lib/tests/grading";
import {
  getAssignmentQuestions,
  getAssignmentTitle,
} from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

export function AssignmentReviewDialog({
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
          <ReviewForm
            key={assignment.id}
            assignment={assignment}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({
  assignment,
  onClose,
}: {
  assignment: HomeworkAssignment;
  onClose: () => void;
}) {
  const { data, reviewHomeworkAssignment } = useDemoStore();
  const hw = data.homeworks.find((h) => h.id === assignment.homeworkId);
  const student = data.students.find((s) => s.id === assignment.studentId);
  const topic = data.topics.find((t) => t.id === assignment.topicId);
  const questions = useMemo(
    () => getAssignmentQuestions(assignment, hw),
    [assignment, hw]
  );
  const title = getAssignmentTitle(assignment, hw);
  const answers = useMemo(
    () => assignment.answers ?? [],
    [assignment.answers]
  );

  const essayIds = useMemo(
    () => questions.filter((q) => q.type === "essay").map((q) => q.id),
    [questions]
  );

  const [manual, setManual] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const id of essayIds) {
      const a = (assignment.answers ?? []).find((x) => x.questionId === id);
      init[id] =
        a?.manualScore != null ? String(a.manualScore) : "";
    }
    return init;
  });
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const id of essayIds) {
      const a = (assignment.answers ?? []).find((x) => x.questionId === id);
      init[id] = a?.teacherComment ?? "";
    }
    return init;
  });
  const [feedback, setFeedback] = useState(assignment.feedback ?? "");

  const autoPart = useMemo(() => {
    return answers.reduce((sum, a) => {
      const q = questions.find((x) => x.id === a.questionId);
      if (q?.type === "essay") return sum;
      return sum + (a.autoScore ?? 0);
    }, 0);
  }, [answers, questions]);

  const preview = useMemo(() => {
    const merged = answers.map((a) => {
      if (!essayIds.includes(a.questionId)) return a;
      const raw = manual[a.questionId];
      if (raw === "" || raw == null) return a;
      return { ...a, manualScore: Number(raw) };
    });
    return computeFinalScore(questions, merged);
  }, [answers, essayIds, manual, questions]);

  const canReview =
    assignment.status === "completed" ||
    assignment.status === "reviewed" ||
    (answers.length > 0 && assignment.status !== "assigned");

  function save() {
    const updates = essayIds
      .filter((id) => manual[id] !== "" && manual[id] != null)
      .map((id) => ({
        questionId: id,
        manualScore: Number(manual[id]),
        teacherComment: comments[id]?.trim() || undefined,
      }));

    if (essayIds.length > 0 && updates.length < essayIds.length) {
      toast.error("Выставьте балл по всем развёрнутым ответам");
      return;
    }

    void (async () => {
      const result = await reviewHomeworkAssignment(
        assignment.id,
        updates,
        feedback.trim() || undefined
      );
      if (!result.ok) {
        toast.error(result.error || "Не удалось сохранить");
        return;
      }
      onClose();
    })();
  }

  const pct =
    preview.score != null && (assignment.maxScore ?? 0) > 0
      ? Math.round((preview.score / (assignment.maxScore ?? 1)) * 100)
      : null;

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4">
        <DialogTitle>{title}</DialogTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {student?.fullName ?? "Ученик"}
          </span>
          {topic ? <span>· {topic.title}</span> : null}
          <HomeworkAssignmentStatusBadge status={assignment.status} />
          <span>· {formatDueAt(assignment.dueAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Автобаллы: {autoPart}
          {preview.pendingManual > 0
            ? ` · ждёт ручной проверки: ${preview.pendingManual}`
            : ""}
          {preview.score != null
            ? ` · итог: ${preview.score}/${assignment.maxScore ?? "—"}${
                pct != null ? ` (${pct}%)` : ""
              }`
            : " · итоговый балл после проверки развёрнутых ответов"}
        </p>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет заданий в снимке.</p>
        ) : (
          questions.map((q, index) => {
            const answer = answers.find((a) => a.questionId === q.id);
            const a1 = assignment.attempt1Answers?.find(
              (x) => x.questionId === q.id
            );
            const a2 = assignment.attempt2Answers?.find(
              (x) => x.questionId === q.id
            );
            const isEssay = q.type === "essay";
            return (
              <div key={q.id} className="space-y-1">
                {a1 || a2 ? (
                  <p className="text-xs text-muted-foreground">
                    1-я попытка: {a1?.textAnswer || a1?.selectedOptionIds?.join(", ") || "—"}
                    {a2
                      ? ` · 2-я: ${a2.textAnswer || a2.selectedOptionIds?.join(", ") || "—"}`
                      : ""}
                  </p>
                ) : null}
                <QuestionFields
                  question={q}
                  index={index}
                  mode="review"
                  answer={answer}
                  revealKey
                  manualScore={isEssay ? manual[q.id] : undefined}
                  onManualScoreChange={
                    isEssay
                      ? (v) => setManual((m) => ({ ...m, [q.id]: v }))
                      : undefined
                  }
                  teacherComment={isEssay ? comments[q.id] : undefined}
                  onTeacherCommentChange={
                    isEssay
                      ? (v) => setComments((c) => ({ ...c, [q.id]: v }))
                      : undefined
                  }
                />
              </div>
            );
          })
        )}

        <div className="space-y-1.5">
          <Label>Общий комментарий ученику</Label>
          <Textarea
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Необязательно"
          />
        </div>
      </div>

      <DialogFooter className="shrink-0 border-t border-border/70 px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Закрыть
        </Button>
        {canReview ? (
          <Button type="button" onClick={save}>
            Сохранить проверку
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ученик ещё не отправил работу.
          </p>
        )}
      </DialogFooter>
    </>
  );
}
