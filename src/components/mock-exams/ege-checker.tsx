"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmptyEgeDraft,
  emitEgeDraft,
  getEgeDraftServerSnapshot,
  getEgeDraftSnapshot,
  parseEgeDraft,
  subscribeEgeDraft,
  writeEgeDraft,
  type EgeDraft,
} from "@/lib/mock-exams/draft";
import { nextPart1AnswerIndex } from "@/lib/mock-exams/answer-navigation";
import {
  formatEgeSummary,
  PART1_TASKS,
  PART2_TASKS,
  partScoreLabel,
  summarizeEge,
  taskScoreLabel,
} from "@/lib/mock-exams/ege";
import { cn } from "@/lib/utils";

function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

export function EgeChecker() {
  const rawDraft = useSyncExternalStore(
    subscribeEgeDraft,
    getEgeDraftSnapshot,
    getEgeDraftServerSnapshot
  );
  const draft = useMemo(() => parseEgeDraft(rawDraft || null), [rawDraft]);
  const [compact, setCompact] = useState(false);
  const [clearTarget, setClearTarget] = useState<"references" | "work" | null>(
    null
  );

  function updateDraft(recipe: (current: EgeDraft) => EgeDraft) {
    writeEgeDraft(window.localStorage, recipe(draft));
    emitEgeDraft();
  }

  const summary = useMemo(
    () =>
      summarizeEge({
        references: draft.references,
        answers: draft.answers,
        part2: draft.part2,
      }),
    [draft]
  );

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(formatEgeSummary(summary));
      toast.success("Результат скопирован");
    } catch {
      toast.error("Не удалось скопировать результат");
    }
  }

  const checking = draft.mode === "check";

  return (
    <aside className="panel min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Проверка ЕГЭ
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {checking
                ? "Эталоны зафиксированы. Итог сам в таблицу пробников не попадает."
                : "Эталоны хранятся только в этом браузере."}
            </p>
          </div>
          <div className="flex rounded-full border border-border p-0.5">
            <button
              type="button"
              aria-pressed={!checking}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                !checking ? "bg-secondary font-medium" : "text-muted-foreground"
              )}
              onClick={() =>
                updateDraft((current) => ({ ...current, mode: "references" }))
              }
            >
              Эталоны
            </button>
            <button
              type="button"
              aria-pressed={checking}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                checking ? "bg-secondary font-medium" : "text-muted-foreground"
              )}
              onClick={() =>
                updateDraft((current) => ({ ...current, mode: "check" }))
              }
            >
              Проверка
            </button>
          </div>
        </div>

        {compact ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCompact(false)}
            >
              К проверке
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copySummary}>
              Скопировать результат
            </Button>
          </div>
        ) : (
          <>
            {checking ? (
              <section className="space-y-2" data-ege-answers="">
                <div className="grid grid-cols-[1.4rem_minmax(0,1fr)_minmax(0,1fr)_1.6rem_1.6rem] gap-1.5 px-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                  <span>№</span>
                  <span>Эталон</span>
                  <span>Ответ</span>
                  <span className="text-center">Макс</span>
                  <span className="text-center">Балл</span>
                </div>
                {PART1_TASKS.map((task, index) => {
                  const score = summary.tasks[index]?.score ?? null;
                  const reference = draft.references[index] ?? "";
                  return (
                    <div
                      key={task.number}
                      className="grid grid-cols-[1.4rem_minmax(0,1fr)_minmax(0,1fr)_1.6rem_1.6rem] items-center gap-1.5"
                    >
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {task.number}
                      </span>
                      <span
                        className={cn(
                          "truncate rounded-md bg-muted/50 px-2 py-1 text-sm",
                          reference ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {reference || "нет"}
                      </span>
                      <div
                        data-ege-answer={index}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const nextIndex = nextPart1AnswerIndex(index);
                          if (nextIndex == null) return;
                          const next = event.currentTarget
                            .closest("[data-ege-answers]")
                            ?.querySelector<HTMLElement>(
                              `[data-ege-answer="${nextIndex}"]`
                            )
                            ?.querySelector("input");
                          next?.focus();
                        }}
                      >
                      <Input
                        value={draft.answers[index] ?? ""}
                        aria-label={`Ответ ученика, задание ${task.number}`}
                        maxLength={80}
                        className="h-8 px-2"
                        onChange={(event) => {
                          const value = event.target.value;
                          updateDraft((current) => ({
                            ...current,
                            answers: replaceAt(current.answers, index, value),
                          }));
                        }}
                      />
                      </div>
                      <span className="text-center text-xs text-muted-foreground tabular-nums">
                        {task.maxScore}
                      </span>
                      <span
                        className={cn(
                          "text-center text-sm tabular-nums",
                          score == null && "text-muted-foreground"
                        )}
                      >
                        {taskScoreLabel(score)}
                      </span>
                    </div>
                  );
                })}
              </section>
            ) : (
              <section className="space-y-2">
                <div className="grid grid-cols-[1.4rem_minmax(0,1fr)_1.6rem] gap-1.5 px-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                  <span>№</span>
                  <span>Эталон</span>
                  <span className="text-center">Макс</span>
                </div>
                {PART1_TASKS.map((task, index) => (
                  <div
                    key={task.number}
                    className="grid grid-cols-[1.4rem_minmax(0,1fr)_1.6rem] items-center gap-1.5"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {task.number}
                    </span>
                    <Input
                      value={draft.references[index] ?? ""}
                      aria-label={`Эталон, задание ${task.number}`}
                      maxLength={80}
                      className="h-8 px-2"
                      onChange={(event) => {
                        const value = event.target.value;
                        updateDraft((current) => ({
                          ...current,
                          references: replaceAt(current.references, index, value),
                        }));
                      }}
                    />
                    <span className="text-center text-xs text-muted-foreground tabular-nums">
                      {task.maxScore}
                    </span>
                  </div>
                ))}
              </section>
            )}

            {checking ? (
              <section className="space-y-3 border-t border-border/80 pt-3">
                <h3 className="text-sm font-medium">Вторая часть</h3>
                {PART2_TASKS.map((task, index) => {
                  const selected = draft.part2[index] ?? null;
                  return (
                    <div key={task.number} className="flex items-center gap-2">
                      <span className="w-8 text-sm text-muted-foreground tabular-nums">
                        {task.number}
                      </span>
                      <div
                        className="flex flex-wrap gap-1"
                        role="radiogroup"
                        aria-label={`Задание ${task.number}, максимум ${task.maxScore}`}
                      >
                        {Array.from({ length: task.maxScore + 1 }, (_, score) => {
                          const active = selected === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              className={cn(
                                "h-7 min-w-7 rounded-md border px-2 text-sm tabular-nums",
                                active
                                  ? "border-transparent bg-secondary font-medium"
                                  : "border-border text-muted-foreground"
                              )}
                              onClick={() =>
                                updateDraft((current) => ({
                                  ...current,
                                  part2: replaceAt(
                                    current.part2,
                                    index,
                                    active ? null : score
                                  ),
                                }))
                              }
                            >
                              {score}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setClearTarget(checking ? "work" : "references")
                }
              >
                {checking ? "Очистить работу" : "Очистить эталоны"}
              </Button>
              {checking ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCompact(true)}
                  >
                    Компактный вид
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copySummary}
                  >
                    Скопировать результат
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}

        {checking || compact ? <SummaryCard summary={summary} /> : null}
      </div>

      <ConfirmDialog
        open={clearTarget != null}
        title={
          clearTarget === "references" ? "Очистить эталоны?" : "Очистить работу?"
        }
        description={
          clearTarget === "references"
            ? "Эталонные ответы заданий 1–20 будут стёрты в этом браузере."
            : "Ответы ученика и баллы второй части будут стёрты. Эталоны останутся."
        }
        confirmLabel="Очистить"
        onOpenChange={(open) => {
          if (!open) setClearTarget(null);
        }}
        onConfirm={() => {
          updateDraft((current) => {
            if (clearTarget === "references") {
              return {
                ...current,
                references: createEmptyEgeDraft().references,
              };
            }
            return {
              ...current,
              answers: createEmptyEgeDraft().answers,
              part2: createEmptyEgeDraft().part2,
            };
          });
          setClearTarget(null);
        }}
      />
    </aside>
  );
}

function SummaryCard({
  summary,
}: {
  summary: ReturnType<typeof summarizeEge>;
}) {
  const part1 = summary.tasks.slice(0, PART1_TASKS.length);
  const part2 = summary.tasks.slice(PART1_TASKS.length);
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4",
        summary.complete ? "border-border" : "border-dashed border-border"
      )}
    >
      <p className="font-display text-base font-semibold">Результат пробного ЕГЭ</p>
      {summary.complete ? null : (
        <p className="mt-1 text-xs text-muted-foreground">
          Проверка не завершена. Прочерк — задание ещё не проверено.
        </p>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <p>
          Первая часть:{" "}
          {partScoreLabel(
            summary.part1Score,
            summary.part1Max,
            summary.part1Checked
          )}
        </p>
        <p>
          Вторая часть:{" "}
          {partScoreLabel(
            summary.part2Score,
            summary.part2Max,
            summary.part2Checked
          )}
        </p>
        <p className="font-display text-base font-semibold">
          Первичный балл:{" "}
          {partScoreLabel(
            summary.primaryScore,
            summary.primaryMax,
            summary.checkedCount
          )}
        </p>
        <p className="font-display text-base font-semibold">
          Вторичный балл: {summary.testScore == null ? "—" : summary.testScore}
        </p>
      </div>
      <div className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground tabular-nums">
        <p>{part1.map((task) => `${task.number}: ${taskScoreLabel(task.score)}`).join(" | ")}</p>
        <p>{part2.map((task) => `${task.number}: ${taskScoreLabel(task.score)}`).join(" | ")}</p>
      </div>
    </div>
  );
}
