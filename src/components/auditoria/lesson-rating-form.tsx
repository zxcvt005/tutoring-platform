"use client";

import { Calendar, Check, Clock, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTime } from "@/lib/format";
import {
  isPositiveLessonRating,
  ratingOffersComment,
  studentCanRateLesson,
} from "@/lib/lesson-ratings";
import { apiLessonRatings } from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

export type StudentLessonRating = {
  lessonId: string;
  score: number;
  comment: string;
  submittedAt: string;
};

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ScorePad({
  selected,
  savedTone,
  disabled,
  onPick,
}: {
  selected: number | null;
  savedTone: "positive" | "negative" | null;
  disabled: boolean;
  onPick: (score: number) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
      {SCORES.map((score) => {
        const picked = selected === score;
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onPick(score)}
            className={cn(
              "flex h-11 min-w-0 items-center justify-center rounded-xl border border-black/10 bg-auditoria-surface text-sm font-semibold text-foreground tabular-nums transition-colors duration-200 motion-reduce:transition-none hover:bg-auditoria-surface disabled:cursor-default",
              picked &&
                savedTone === "positive" &&
                "border-[#c5e4d2] bg-[#E5F3EA] hover:bg-[#E5F3EA]",
              picked &&
                savedTone === "negative" &&
                "border-[#f3d0d3] bg-[#FCEBEC] hover:bg-[#FCEBEC]",
              picked &&
                !savedTone &&
                "border-slate-300 bg-[#F8FAFC]"
            )}
            aria-label={`Оценка ${score} из 10`}
            aria-pressed={picked}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}

function RatingWaves({ tone }: { tone: "idle" | "positive" | "negative" }) {
  const fill =
    tone === "positive" ? "#E5F3EA" : tone === "negative" ? "#FCEBEC" : "#E6E3F2";
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 72"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full"
    >
      <path
        d="M0 42C70 18 120 58 200 36C280 14 330 48 400 28V72H0Z"
        fill={fill}
        opacity="0.95"
      />
    </svg>
  );
}

export function LessonRatingFields({
  lessonId,
  title,
  meta,
  rating,
  onSaved,
  onFinished,
  waves = false,
}: {
  lessonId: string;
  title?: string;
  meta?: string;
  rating: StudentLessonRating | null;
  onSaved: (rating: StudentLessonRating) => void;
  onFinished?: () => void;
  waves?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState(rating?.comment ?? "");
  const [saved, setSaved] = useState<StudentLessonRating | null>(rating);
  const [successFlash, setSuccessFlash] = useState(false);

  const selected = saved?.score ?? null;
  const savedTone = saved
    ? isPositiveLessonRating(saved.score)
      ? "positive"
      : "negative"
    : null;
  const showComment = Boolean(saved && ratingOffersComment(saved.score));

  async function saveScore(score: number) {
    if (busy || saved) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiLessonRatings<{ rating: StudentLessonRating }>(
        "submit",
        { lessonId, score, comment: "" }
      );
      setSaved(data.rating);
      onSaved(data.rating);
      setSuccessFlash(true);
      if (!ratingOffersComment(score)) {
        toast.success("Спасибо, оценка сохранена");
        window.setTimeout(() => onFinished?.(), 700);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось сохранить оценку";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveComment() {
    if (!saved || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiLessonRatings<{ rating: StudentLessonRating }>(
        "comment",
        { lessonId, comment }
      );
      setSaved(data.rating);
      onSaved(data.rating);
      toast.success("Комментарий сохранён");
      onFinished?.();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось сохранить комментарий";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const positiveSaved = Boolean(
    saved && successFlash && isPositiveLessonRating(saved.score)
  );

  return (
    <div>
      {title ? (
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
      ) : null}
      {meta ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{meta}</p>
      ) : null}
      <p className="font-display text-base font-semibold tracking-tight">
        Насколько вам понравилось занятие?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Нажмите на оценку от 1 до 10. Оценки 7–10 сохраняются сразу.
      </p>
      <ScorePad
        selected={selected}
        savedTone={savedTone}
        disabled={Boolean(saved) || busy}
        onPick={(score) => void saveScore(score)}
      />
      {saved && !positiveSaved && !showComment ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Оценка {saved.score}/10
          {saved.comment ? `. ${saved.comment}` : ""}
        </p>
      ) : null}
      {positiveSaved ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#d3eadc] bg-pastel-mint/80 px-4 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-auditoria-surface text-foreground">
            <Check className="size-4" aria-hidden />
          </span>
          <div>
            <p className="font-display text-sm font-semibold">Оценка сохранена!</p>
            <p className="text-sm text-foreground/80">Спасибо за обратную связь!</p>
          </div>
        </div>
      ) : null}
      {showComment ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#f3d4d7] bg-pastel-rose/80 px-4 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <p className="font-display text-sm font-semibold">
            Что можно улучшить на занятии?
          </p>
          <Textarea
            className="min-h-28 rounded-xl border-white/80 bg-auditoria-surface text-sm shadow-none"
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Напишите, что не понравилось или что можно сделать лучше..."
          />
          <Button
            type="button"
            className="rounded-full bg-[#E5F2FB] text-foreground shadow-none hover:bg-[#d7ebf8] disabled:opacity-60"
            disabled={busy || !comment.trim()}
            onClick={() => void saveComment()}
          >
            {busy ? "Отправка…" : "Отправить комментарий →"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {waves ? (
        <RatingWaves
          tone={
            savedTone === "positive"
              ? "positive"
              : savedTone === "negative"
                ? "negative"
                : "idle"
          }
        />
      ) : null}
    </div>
  );
}

export function LessonRatingForm({
  lessonId,
  lessonStatus,
  startsAt,
  attendanceStatus,
  rating,
  onSaved,
  title,
  teacherName,
}: {
  lessonId: string;
  lessonStatus: string;
  startsAt: string;
  attendanceStatus?: string | null;
  rating: StudentLessonRating | null;
  onSaved: (rating: StudentLessonRating) => void;
  title?: string;
  teacherName?: string;
}) {
  const canRate = studentCanRateLesson({
    lessonStatus,
    startsAt,
    attendanceStatus,
  });
  if (!canRate && !rating) return null;

  const meta = [formatDate(startsAt), teacherName].filter(Boolean).join(" · ");

  return (
    <section className="auditoria-home-card min-w-0">
      <LessonRatingFields
        key={`${lessonId}:${rating?.submittedAt ?? "open"}`}
        lessonId={lessonId}
        title={title ?? "Оцените качество занятия"}
        meta={meta || undefined}
        rating={rating}
        onSaved={onSaved}
      />
    </section>
  );
}

export type PendingLessonRating = {
  lessonId: string;
  startsAt: string;
  endsAt: string;
  subject: string | null;
  teacherId: string;
  teacherName: string;
};

export function LessonRatingHomePrompt({
  lessons,
  onRated,
}: {
  lessons: PendingLessonRating[];
  onRated: (lessonId: string, rating: StudentLessonRating) => void;
}) {
  const [queue, setQueue] = useState(lessons);
  const [open, setOpen] = useState(lessons.length > 0);

  const current = queue[0] ?? null;

  function advance() {
    setQueue((prev) => {
      const next = prev.slice(1);
      setOpen(next.length > 0);
      return next;
    });
  }

  if (!current) return null;

  const subject = current.subject?.trim() || "Занятие";
  const when = `${formatDate(current.startsAt)}, ${formatTime(current.startsAt)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else advance();
      }}
    >
      <DialogContent
        className="max-h-[min(92dvh,42rem)] overflow-y-auto rounded-[1.75rem] border border-white/70 bg-auditoria-surface p-0 text-foreground shadow-xl sm:max-w-[36rem] motion-safe:duration-200"
      >
        <div className="relative px-5 pt-6 pb-14 sm:px-7">
          <DialogTitle className="pr-8 font-display text-[1.35rem] font-semibold tracking-tight text-foreground">
            Оцените качество занятия
          </DialogTitle>
          <DialogDescription className="sr-only">
            Оценка занятия по шкале от 1 до 10. Можно закрыть без оценки.
          </DialogDescription>
          <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
            <li className="flex items-center gap-2">
              <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>{subject}</span>
            </li>
            <li className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-2">
                <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {when}
              </span>
              <span className="inline-flex items-center gap-2">
                <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {current.teacherName}
              </span>
            </li>
          </ul>
          <div className="my-4 h-px bg-border/70" />
          <LessonRatingFields
            key={current.lessonId}
            lessonId={current.lessonId}
            rating={null}
            onSaved={(rating) => {
              onRated(current.lessonId, rating);
            }}
            onFinished={advance}
            waves
          />
          <div className="relative z-10 mt-3 flex justify-end">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setOpen(false)}
            >
              Позже
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
