"use client";

import { useMemo, useState } from "react";
import { Sigma } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudentTourExtras } from "@/lib/student-tour/extras";
import {
  filterTourProblems,
  TOUR_PROBLEM_SECTIONS,
  type TourProblem,
  type TourProblemDifficulty,
} from "@/lib/student-tour/problems";
import { cn } from "@/lib/utils";

const COUNTS = [5, 8, 10] as const;

type Phase = "setup" | "run" | "result";

export function StudentTourProblemTrainerCard() {
  const { extras } = useStudentTourExtras();
  const [open, setOpen] = useState(false);
  const last = extras.trainerHistory[0];

  return (
    <>
      <section className="auditoria-home-card min-w-0">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-pastel-blue text-foreground/80">
            <Sigma className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              Тренажёр задач
            </h2>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Выберите раздел физики и решите демонстрационные задачи с
              проверкой и разбором. Результаты хранятся только в демо.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Тренировок"
            value={String(extras.trainerHistory.length)}
          />
          <Stat
            label="Последний результат"
            value={
              last
                ? `${last.correct}/${last.total} · ${Math.round(
                    (100 * last.correct) / last.total
                  )}%`
                : "—"
            }
          />
          <Stat
            label="Разделов"
            value={String(TOUR_PROBLEM_SECTIONS.length)}
          />
        </dl>
        <div className="mt-5">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-blue px-5 text-sm text-foreground"
            onClick={() => setOpen(true)}
          >
            Открыть тренажёр
          </button>
        </div>
      </section>
      <StudentTourProblemTrainerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold tracking-tight">
        {value}
      </dd>
    </div>
  );
}

export function StudentTourProblemTrainerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { recordTrainerResult, extras } = useStudentTourExtras();
  const [phase, setPhase] = useState<Phase>("setup");
  const [sectionId, setSectionId] = useState(TOUR_PROBLEM_SECTIONS[0]!.id);
  const [topicId, setTopicId] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<TourProblemDifficulty | "any">(
    "any"
  );
  const [count, setCount] = useState<(typeof COUNTS)[number]>(8);
  const [queue, setQueue] = useState<TourProblem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const section = TOUR_PROBLEM_SECTIONS.find((s) => s.id === sectionId);
  const current = queue[index] ?? null;

  const available = useMemo(
    () =>
      filterTourProblems({
        sectionId,
        topicId,
        difficulty,
        limit: 50,
      }).length,
    [sectionId, topicId, difficulty]
  );

  function resetRun() {
    setPhase("setup");
    setQueue([]);
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrect(0);
    setWrong(0);
    setDurationSec(0);
  }

  function start() {
    const items = filterTourProblems({
      sectionId,
      topicId,
      difficulty,
      limit: count,
    });
    if (items.length === 0) {
      toast.message("В выбранном разделе пока нет задач для этих фильтров");
      return;
    }
    setQueue(items);
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrect(0);
    setWrong(0);
    setStartedAt(Date.now());
    setPhase("run");
  }

  function submitAnswer() {
    if (!current || !selected || checked) return;
    const ok = selected === current.correctOptionId;
    setChecked(true);
    if (ok) setCorrect((n) => n + 1);
    else setWrong((n) => n + 1);
  }

  function next() {
    if (!current) return;
    if (index + 1 >= queue.length) {
      const elapsed = Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      );
      setDurationSec(elapsed);
      recordTrainerResult({
        id: `tour_tr_${Date.now().toString(36)}`,
        finishedAt: new Date().toISOString(),
        sectionId,
        sectionTitle: section?.title ?? sectionId,
        topicId,
        topicTitle:
          topicId === "all"
            ? "Все темы"
            : section?.topics.find((t) => t.id === topicId)?.title ?? topicId,
        difficulty: difficulty === "any" ? "medium" : difficulty,
        total: queue.length,
        correct,
        durationSec: elapsed,
      });
      setPhase("result");
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setChecked(false);
  }

  const percent =
    queue.length > 0 ? Math.round((100 * correct) / queue.length) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetRun();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Тренажёр задач · демо</DialogTitle>
          <DialogDescription>
            Без сохранения в школьную систему. Персональная аналитика слабых тем
            отключена.
          </DialogDescription>
        </DialogHeader>

        {phase === "setup" ? (
          <div className="space-y-4">
            <Field label="Раздел физики">
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setTopicId("all");
                }}
              >
                {TOUR_PROBLEM_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тема">
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
              >
                <option value="all">Все темы раздела</option>
                {section?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сложность">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["any", "Любая"],
                    ["easy", "Лёгкая"],
                    ["medium", "Средняя"],
                    ["hard", "Сложная"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      difficulty === id
                        ? "border-transparent bg-pastel-blue"
                        : "border-border"
                    )}
                    onClick={() => setDifficulty(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Количество заданий">
              <div className="flex flex-wrap gap-2">
                {COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      count === n
                        ? "border-transparent bg-pastel-blue"
                        : "border-border"
                    )}
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Доступно по фильтрам: {available}
              </p>
            </Field>
            {extras.trainerHistory.length > 0 ? (
              <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3">
                <p className="text-sm font-medium">Недавние тренировки</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {extras.trainerHistory.slice(0, 3).map((row) => (
                    <li key={row.id}>
                      {row.sectionTitle}: {row.correct}/{row.total} (
                      {Math.round((100 * row.correct) / row.total)}%)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button type="button" className="w-full rounded-xl" onClick={start}>
              Начать тренировку
            </Button>
          </div>
        ) : null}

        {phase === "run" && current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                Задание {index + 1} из {queue.length}
              </span>
              <span>
                Верно {correct} · ошибки {wrong}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-pastel-mint"
                style={{ width: `${((index + (checked ? 1 : 0)) / queue.length) * 100}%` }}
              />
            </div>
            <p className="font-display text-lg font-semibold tracking-tight">
              {current.prompt}
            </p>
            <ul className="space-y-2">
              {current.options.map((opt) => {
                const isSelected = selected === opt.id;
                const showCorrect =
                  checked && opt.id === current.correctOptionId;
                const showWrong =
                  checked && isSelected && opt.id !== current.correctOptionId;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      disabled={checked}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
                        showCorrect && "border-[#8fbfa0] bg-pastel-mint/80",
                        showWrong && "border-[#e3a4aa] bg-pastel-rose/80",
                        !checked &&
                          isSelected &&
                          "border-transparent bg-pastel-blue",
                        !checked &&
                          !isSelected &&
                          "border-black/10 bg-auditoria-surface hover:bg-pastel-blue/40"
                      )}
                      onClick={() => setSelected(opt.id)}
                    >
                      {opt.text}
                    </button>
                  </li>
                );
              })}
            </ul>
            {checked ? (
              <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3 text-sm leading-relaxed">
                <p className="font-medium">
                  {selected === current.correctOptionId
                    ? "Верно"
                    : "Пока неверно"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {current.explanation}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!checked ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={!selected}
                  onClick={submitAnswer}
                >
                  Проверить
                </Button>
              ) : (
                <Button type="button" className="rounded-xl" onClick={next}>
                  {index + 1 >= queue.length
                    ? "Завершить тренировку"
                    : "Следующее задание"}
                </Button>
              )}
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "rounded-xl"
                )}
                onClick={() => {
                  resetRun();
                }}
              >
                К настройкам
              </button>
            </div>
          </div>
        ) : null}

        {phase === "result" ? (
          <div className="space-y-4">
            <p className="font-display text-2xl font-semibold tracking-tight">
              Тренировка завершена
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Решено" value={String(queue.length)} />
              <Stat label="Верно" value={String(correct)} />
              <Stat label="Результат" value={`${percent}%`} />
              <Stat label="Время" value={`${durationSec} с`} />
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-xl" onClick={start}>
                Ещё раз
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={resetRun}
              >
                Новые настройки
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
