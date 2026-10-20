"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QuestionFields } from "@/components/tests/question-fields";
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
import {
  computeMaxScore,
  createEmptyQuestion,
  questionTypeLabel,
} from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, QuestionType, TestQuestion } from "@/lib/types";

const QUESTION_TYPES: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "short_answer",
  "essay",
  "matching",
  "ordering",
];

type FormState = {
  id?: string;
  title: string;
  description: string;
  status: Homework["status"];
  questions: TestQuestion[];
};

function toForm(hw?: Homework): FormState {
  if (!hw) {
    return {
      title: "",
      description: "",
      status: "draft",
      questions: [createEmptyQuestion("single_choice")],
    };
  }
  return {
    id: hw.id,
    title: hw.title,
    description: hw.description ?? "",
    status: hw.status === "archived" ? "draft" : hw.status,
    questions:
      hw.questions?.length > 0
        ? structuredClone(hw.questions)
        : [createEmptyQuestion("single_choice")],
  };
}

export function TestEditorDialog({
  topicId,
  teacherId,
  homework,
  open,
  onOpenChange,
}: {
  topicId: string;
  teacherId: string;
  homework: Homework | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {open ? (
          <TestEditorForm
            key={homework?.id ?? "new"}
            topicId={topicId}
            teacherId={teacherId}
            homework={homework}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TestEditorForm({
  topicId,
  teacherId,
  homework,
  onClose,
}: {
  topicId: string;
  teacherId: string;
  homework: Homework | null;
  onClose: () => void;
}) {
  const { upsertHomework, publishHomework } = useDemoStore();
  const [form, setForm] = useState<FormState>(() => toForm(homework ?? undefined));
  const [preview, setPreview] = useState(false);
  const [addType, setAddType] = useState<QuestionType>("single_choice");

  const maxScore = useMemo(
    () => computeMaxScore(form.questions),
    [form.questions]
  );

  function updateQuestion(index: number, q: TestQuestion) {
    setForm((prev) => {
      const questions = [...prev.questions];
      questions[index] = q;
      return { ...prev, questions };
    });
  }

  function removeQuestion(index: number) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setForm((prev) => {
      const questions = [...prev.questions];
      const j = index + dir;
      if (j < 0 || j >= questions.length) return prev;
      [questions[index], questions[j]] = [questions[j]!, questions[index]!];
      return { ...prev, questions };
    });
  }

  function addQuestion() {
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, createEmptyQuestion(addType)],
    }));
  }

  function save(andPublish: boolean) {
    if (!form.title.trim()) {
      toast.error("Укажите название теста");
      return;
    }
    if (andPublish) {
      if (!form.questions.length) {
        toast.error("Добавьте хотя бы одно задание");
        return;
      }
      if (form.questions.some((q) => !q.prompt.trim())) {
        toast.error("У всех заданий должен быть текст вопроса");
        return;
      }
    }
    const id = upsertHomework({
      id: form.id,
      topicId,
      teacherId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      status: andPublish
        ? "published"
        : form.status === "published"
          ? "published"
          : "draft",
      questions: form.questions,
      maxScore,
    });
    if (andPublish) {
      void (async () => {
        const result = await publishHomework(form.id ?? id);
        if (!result.ok) return;
        onClose();
      })();
      return;
    }
    toast.success("Тест сохранён");
    onClose();
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4">
        <DialogTitle>
          {form.id ? "Редактор теста" : "Новый тест"}
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          {preview
            ? "Предпросмотр глазами ученика (без правильных ответов)."
            : `Заданий: ${form.questions.length} · макс. ${maxScore} б.`}
        </p>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {!preview ? (
          <>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                  placeholder="Например: Производная — базовый тест"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Описание</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={2}
                  placeholder="Кратко, что проверяет тест"
                />
              </div>
            </div>

            <div className="space-y-3">
              {form.questions.map((q, index) => (
                <div key={q.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Select
                      value={q.type}
                      onValueChange={(v) => {
                        if (!v) return;
                        const next = createEmptyQuestion(v as QuestionType);
                        next.prompt = q.prompt;
                        next.maxScore = q.maxScore;
                        next.explanation = q.explanation;
                        updateQuestion(index, next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[200px] rounded-full text-xs">
                        <SelectValue>
                          {() => questionTypeLabel[q.type]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {questionTypeLabel[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={index === form.questions.length - 1}
                        onClick={() => moveQuestion(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={form.questions.length <= 1}
                        onClick={() => removeQuestion(index)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                  <QuestionFields
                    question={q}
                    index={index}
                    mode="edit"
                    onQuestionChange={(nq) => updateQuestion(index, nq)}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border/80 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Тип нового задания</Label>
                <Select
                  value={addType}
                  onValueChange={(v) => v && setAddType(v as QuestionType)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue>
                      {() => questionTypeLabel[addType]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {questionTypeLabel[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={addQuestion}
              >
                Добавить задание
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">
                {form.title || "Без названия"}
              </h3>
              {form.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {form.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {form.questions.length} вопр. · макс. {maxScore} б.
              </p>
            </div>
            {form.questions.map((q, index) => (
              <QuestionFields
                key={q.id}
                question={q}
                index={index}
                mode="preview"
                revealKey={false}
              />
            ))}
          </div>
        )}
      </div>

      <DialogFooter className="shrink-0 border-t border-border/70 px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "К редактированию" : "Предпросмотр"}
        </Button>
        <Button type="button" variant="outline" onClick={() => save(false)}>
          Сохранить черновик
        </Button>
        <Button type="button" onClick={() => save(true)}>
          Сохранить и опубликовать
        </Button>
      </DialogFooter>
    </>
  );
}
