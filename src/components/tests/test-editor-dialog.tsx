"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { newId } from "@/lib/format";
import {
  computeMaxScore,
  createEmptyQuestion,
  questionHasBody,
  questionTypeLabel,
} from "@/lib/tests/helpers";
import { normalizeOptionalDescription } from "@/lib/tests/optional-description";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, QuestionType, TestQuestion } from "@/lib/types";

const QUESTION_TYPES: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "short_answer",
  "numeric",
  "essay",
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
  folderId,
  teacherId,
  libraryScope = "teacher",
  homework,
  open,
  onOpenChange,
  purpose = "homework",
  onSaved,
}: {
  topicId?: string | null;
  /** Папка, из которой открыли создание или редактирование. */
  folderId?: string | null;
  teacherId: string;
  libraryScope?: "school" | "teacher";
  homework: Homework | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose?: Homework["purpose"];
  onSaved?: (hw: { id: string }) => void;
}) {
  const placementFolderId =
    purpose === "homework"
      ? (folderId ?? homework?.folderId ?? homework?.sectionId ?? null)
      : null;
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, eventDetails) => {
        if (!next) {
          const reason = eventDetails.reason;
          if (
            reason === "outside-press" ||
            reason === "escape-key" ||
            reason === "close-press" ||
            reason === "focus-out"
          ) {
            eventDetails.cancel();
            return;
          }
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {open ? (
          <TestEditorForm
            key={homework?.id ?? "new"}
            topicId={topicId ?? homework?.topicId ?? null}
            folderId={placementFolderId}
            teacherId={teacherId}
            libraryScope={libraryScope}
            homework={homework}
            purpose={purpose}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TestEditorForm({
  topicId,
  folderId,
  teacherId,
  libraryScope = "teacher",
  homework,
  purpose = "homework",
  onClose,
  onSaved,
}: {
  topicId?: string | null;
  folderId: string | null;
  teacherId: string;
  libraryScope?: "school" | "teacher";
  homework: Homework | null;
  purpose?: Homework["purpose"];
  onClose: () => void;
  onSaved?: (hw: { id: string }) => void;
}) {
  const { upsertHomework, publishHomework } = useDemoStore();
  const [form, setFormState] = useState<FormState>(() => {
    const next = toForm(homework ?? undefined);
    if (!next.id) next.id = newId("hw");
    return next;
  });
  const formRef = useRef(form);
  /** Синхронно зеркалим form в ref — иначе ensureTestReady может прочитать
   *  устаревший questions до useEffect после addQuestion / смены типа. */
  const setForm = useCallback(
    (updater: FormState | ((prev: FormState) => FormState)) => {
      setFormState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        formRef.current = next;
        return next;
      });
    },
    []
  );
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const [preview, setPreview] = useState(false);
  const [addType, setAddType] = useState<QuestionType>("single_choice");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageOpsRef = useRef(0);
  /** Цепочка ensureTestReady: параллельные upload не гоняют upsert со stale snapshot. */
  const ensureChainRef = useRef(Promise.resolve<void>(undefined));

  const noteImageBusy = useCallback((delta: 1 | -1) => {
    imageOpsRef.current = Math.max(0, imageOpsRef.current + delta);
    setImageBusy(imageOpsRef.current > 0);
  }, []);

  const maxScore = useMemo(
    () => computeMaxScore(form.questions),
    [form.questions]
  );

  /**
   * Загрузка картинки идёт в API по testId из БД. Редактор сразу выдаёт
   * клиентский id, но строка в `tests` появляется только после upsert —
   * иначе POST image отвечает «Тест не найден».
   * requiredQuestionId — вопрос, к которому сейчас грузят картинку; должен
   * попасть в сохранённый questionsPublic.
   */
  const ensureTestReady = useCallback(
    async (requiredQuestionId?: string) => {
      const run = async (): Promise<string> => {
        const current = formRef.current;
        if (
          requiredQuestionId &&
          !current.questions.some((q) => q.id === requiredQuestionId)
        ) {
          throw new Error(
            "Вопрос ещё не в черновике. Обновите задание и повторите загрузку."
          );
        }
        const title = current.title.trim() || "Черновик теста";
        const questions = current.questions;
        const saved = await upsertHomework({
          id: current.id,
          topicId: topicId || null,
          ...(purpose === "homework" ? { folderId } : {}),
          teacherId,
          libraryScope,
          title,
          description: normalizeOptionalDescription(current.description),
          status: current.status === "published" ? "published" : "draft",
          purpose,
          questions,
          maxScore: computeMaxScore(questions),
        });
        if (!saved.ok || !saved.id) {
          throw new Error(
            "Не удалось сохранить черновик теста перед загрузкой изображения"
          );
        }
        setForm((prev) => ({
          ...prev,
          id: saved.id,
          title: prev.title.trim() ? prev.title : title,
        }));
        return saved.id;
      };

      const queued = ensureChainRef.current.then(run, run);
      ensureChainRef.current = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    },
    [upsertHomework, topicId, purpose, teacherId, libraryScope, folderId, setForm]
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

  async function save(andPublish: boolean) {
    if (busy || busyRef.current || imageOpsRef.current > 0) {
      if (imageOpsRef.current > 0) {
        toast.message("Дождитесь окончания загрузки изображения");
      }
      return;
    }
    if (!form.title.trim()) {
      toast.error("Укажите название теста");
      return;
    }
    if (andPublish) {
      if (!form.questions.length) {
        toast.error("Добавьте хотя бы одно задание");
        return;
      }
      if (form.questions.some((q) => !questionHasBody(q))) {
        toast.error("У каждого задания должен быть текст или изображение");
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    try {
      // Дождаться ensureTestReady от upload, затем брать свежий formRef
      // (с imageObjectKey), иначе save затрёт ключ только что залитой картинки.
      await ensureChainRef.current;
      const current = formRef.current;
      const saved = await upsertHomework({
        id: current.id,
        topicId: topicId || null,
        ...(purpose === "homework" ? { folderId } : {}),
        teacherId,
        libraryScope,
        title: current.title.trim(),
        description: normalizeOptionalDescription(current.description),
        status: andPublish
          ? "published"
          : current.status === "published"
            ? "published"
            : "draft",
        purpose,
        questions: current.questions,
        maxScore: computeMaxScore(current.questions),
      });
      if (!saved.ok || !saved.id) return;
      setForm((prev) => ({ ...prev, id: saved.id }));
      if (andPublish) {
        const result = await publishHomework(saved.id);
        if (!result.ok) return;
        onSaved?.({ id: saved.id });
        onClose();
        return;
      }
      toast.success("Тест сохранён");
      onSaved?.({ id: saved.id });
      onClose();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
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
                  placeholder="Необязательно"
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
                        // Сохраняем id: иначе картинка/ответ ключуются на старый id,
                        // а upload после смены типа получает «Вопрос не найден».
                        const next = createEmptyQuestion(v as QuestionType);
                        next.id = q.id;
                        next.prompt = q.prompt;
                        next.maxScore = q.maxScore;
                        next.explanation = q.explanation;
                        next.kimNumber = q.kimNumber;
                        next.imageObjectKey = q.imageObjectKey;
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
                    testId={form.id}
                    question={q}
                    index={index}
                    mode="edit"
                    ensureTestReady={ensureTestReady}
                    onImageBusyChange={noteImageBusy}
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
                testId={form.id}
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
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy || imageBusy}
        >
          Отмена
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || imageBusy}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "К редактированию" : "Предпросмотр"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || imageBusy}
          onClick={() => void save(false)}
        >
          {busy ? "Сохранение…" : imageBusy ? "Загрузка фото…" : "Сохранить черновик"}
        </Button>
        <Button
          type="button"
          disabled={busy || imageBusy}
          onClick={() => void save(true)}
        >
          {busy ? "Публикация…" : imageBusy ? "Загрузка фото…" : "Сохранить и опубликовать"}
        </Button>
      </DialogFooter>
    </>
  );
}
