"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  normalizeQuestionImageFileName,
  testQuestionImageUrl,
  QUESTION_IMAGE_EXTENSIONS,
} from "@/lib/tests/question-image";
import {
  apiTestQuestionImageDelete,
  apiTestQuestionImageUpload,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

/** File из буфера часто без имени — задаём clipboard.{ext} до upload. */
function withClipboardFileName(file: File): File {
  const name = normalizeQuestionImageFileName(file.name, file.type);
  if (name === file.name) return file;
  return new File([file], name, {
    type: file.type || "application/octet-stream",
  });
}

export function QuestionImagePreview({
  testId,
  questionId,
  imageObjectKey,
  editable,
  onImageChange,
  ensureTestReady,
  onBusyChange,
  className,
}: {
  testId: string;
  questionId: string;
  imageObjectKey?: string;
  editable?: boolean;
  onImageChange?: (key: string | undefined) => void;
  /**
   * Перед upload/delete сохраняет черновик теста в БД и возвращает актуальный testId.
   * Нужен, когда редактор ещё не делал upsert (клиентский id без строки в tests).
   * Аргумент — id вопроса, который обязан оказаться в сохранённом черновике.
   */
  ensureTestReady?: (requiredQuestionId?: string) => Promise<string>;
  onBusyChange?: (delta: 1 | -1) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [resolvedTestId, setResolvedTestId] = useState(testId);
  const uploadGenRef = useRef(0);
  const busyHoldRef = useRef(false);
  useEffect(() => {
    setResolvedTestId(testId);
  }, [testId]);
  useEffect(() => {
    // Смена вопроса / размонтирование — не применять результат чужого upload.
    uploadGenRef.current += 1;
    if (busyHoldRef.current) {
      busyHoldRef.current = false;
      onBusyChange?.(-1);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on question switch
  }, [questionId]);
  useEffect(() => {
    return () => {
      if (busyHoldRef.current) {
        busyHoldRef.current = false;
        onBusyChange?.(-1);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);
  const src = imageObjectKey
    ? testQuestionImageUrl(resolvedTestId, questionId, imageObjectKey)
    : undefined;

  function beginBusy() {
    if (busyHoldRef.current) return;
    busyHoldRef.current = true;
    setBusy(true);
    onBusyChange?.(1);
  }

  function endBusy(gen: number) {
    if (gen !== uploadGenRef.current) return;
    if (!busyHoldRef.current) return;
    busyHoldRef.current = false;
    setBusy(false);
    onBusyChange?.(-1);
  }

  async function resolveTestId(forQuestionId: string): Promise<string> {
    if (!ensureTestReady) return testId;
    const readyId = await ensureTestReady(forQuestionId);
    setResolvedTestId(readyId);
    return readyId;
  }

  async function attachFile(file: File) {
    if (!editable || !onImageChange) return;
    const targetQuestionId = questionId;
    const gen = ++uploadGenRef.current;
    beginBusy();
    try {
      const readyTestId = await resolveTestId(targetQuestionId);
      if (gen !== uploadGenRef.current) return;
      const result = await apiTestQuestionImageUpload(
        readyTestId,
        targetQuestionId,
        withClipboardFileName(file)
      );
      if (gen !== uploadGenRef.current) return;
      onImageChange(result.imageObjectKey);
      toast.success("Изображение прикреплено");
    } catch (err) {
      if (gen !== uploadGenRef.current) return;
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      endBusy(gen);
    }
  }

  async function pasteFromClipboard() {
    if (!editable || !onImageChange) return;
    if (!navigator.clipboard?.read) {
      toast.message("Используйте Ctrl+V или загрузку файла");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const name = normalizeQuestionImageFileName("", type);
        const file = new File([blob], name, { type });
        await attachFile(file);
        return;
      }
      toast.message("В буфере нет изображения");
    } catch {
      toast.message("Нет доступа к буферу — используйте Ctrl+V");
    }
  }

  async function removeImage() {
    if (!editable || !onImageChange || !imageObjectKey) return;
    const targetQuestionId = questionId;
    const gen = ++uploadGenRef.current;
    beginBusy();
    try {
      const readyTestId = await resolveTestId(targetQuestionId);
      if (gen !== uploadGenRef.current) return;
      await apiTestQuestionImageDelete(readyTestId, targetQuestionId);
      if (gen !== uploadGenRef.current) return;
      onImageChange(undefined);
      toast.success("Изображение удалено");
    } catch (err) {
      if (gen !== uploadGenRef.current) return;
      toast.error(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      endBusy(gen);
    }
  }

  function onPasteCapture(e: React.ClipboardEvent) {
    if (!editable || !onImageChange) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      void attachFile(withClipboardFileName(file));
      return;
    }
  }

  const accept = QUESTION_IMAGE_EXTENSIONS.map((e) =>
    e === ".jpg" || e === ".jpeg" ? "image/jpeg" : `image/${e.slice(1)}`
  ).join(",");

  return (
    <div className={cn("space-y-2", className)} onPaste={onPasteCapture}>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void attachFile(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Загрузить изображение
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void pasteFromClipboard()}
          >
            Вставить из буфера
          </Button>
          {imageObjectKey ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Заменить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void removeImage()}
              >
                Удалить
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {src ? (
        <button
          type="button"
          className="block max-w-full text-left"
          onClick={() => setZoomOpen(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="max-h-48 w-auto max-w-full rounded-lg border border-border/70 object-contain"
          />
        </button>
      ) : editable ? (
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP до 10 МБ. Можно вставить скриншот через Ctrl+V в поле
          вопроса или здесь.
        </p>
      ) : null}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[min(96vw,900px)] p-2 sm:p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Изображение к заданию</DialogTitle>
          </DialogHeader>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              className="mx-auto max-h-[80vh] w-auto max-w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
