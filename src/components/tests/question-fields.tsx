"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/format";
import type { StudentAnswer, TestQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Режим: edit (учитель правит), take (ученик отвечает), review (просмотр с ключами) */
export type QuestionViewMode = "edit" | "take" | "review" | "preview";

type Props = {
  question: TestQuestion;
  index: number;
  mode: QuestionViewMode;
  answer?: StudentAnswer;
  onAnswerChange?: (answer: StudentAnswer) => void;
  onQuestionChange?: (question: TestQuestion) => void;
  /** В review: показывать правильные ответы и пояснения */
  revealKey?: boolean;
  /** Ручная оценка essay */
  manualScore?: string;
  onManualScoreChange?: (value: string) => void;
  teacherComment?: string;
  onTeacherCommentChange?: (value: string) => void;
};

export function QuestionFields({
  question,
  index,
  mode,
  answer,
  onAnswerChange,
  onQuestionChange,
  revealKey = false,
  manualScore,
  onManualScoreChange,
  teacherComment,
  onTeacherCommentChange,
}: Props) {
  const editable = mode === "edit";
  const taking = mode === "take";
  const showKey = revealKey || mode === "preview";

  function patchQ(partial: Partial<TestQuestion>) {
    onQuestionChange?.({ ...question, ...partial });
  }

  function patchA(partial: Partial<StudentAnswer>) {
    onAnswerChange?.({
      questionId: question.id,
      selectedOptionIds: answer?.selectedOptionIds ?? [],
      textAnswer: answer?.textAnswer ?? "",
      matching: answer?.matching ?? {},
      order: answer?.order ?? [],
      ...partial,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Задание {index + 1}
          {question.maxScore != null ? ` · ${question.maxScore} б.` : ""}
        </p>
        {mode === "review" && answer?.isCorrect != null ? (
          <span
            className={cn(
              "text-xs font-medium",
              answer.isCorrect ? "text-success" : "text-destructive"
            )}
          >
            {answer.isCorrect ? "Верно" : "Ошибка"}
            {answer.autoScore != null
              ? ` · ${answer.autoScore}/${question.maxScore}`
              : ""}
          </span>
        ) : null}
        {mode === "review" && answer?.needsManualReview && answer.manualScore == null ? (
          <span className="text-xs font-medium text-[oklch(0.45_0.08_55)]">
            Ждёт проверки
          </span>
        ) : null}
      </div>

      {editable ? (
        <div className="space-y-1.5">
          <Label>Текст задания</Label>
          <Textarea
            value={question.prompt}
            onChange={(e) => patchQ({ prompt: e.target.value })}
            rows={2}
            placeholder="Вопрос или условие"
          />
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {question.prompt || "Без текста"}
        </p>
      )}

      {(question.type === "single_choice" ||
        question.type === "multiple_choice") && (
        <ChoiceBlock
          question={question}
          editable={editable}
          taking={taking}
          showKey={showKey}
          answer={answer}
          patchQ={patchQ}
          patchA={patchA}
        />
      )}

      {(question.type === "short_answer" || question.type === "numeric") && (
        <ShortAnswerBlock
          question={question}
          editable={editable}
          taking={taking}
          showKey={showKey}
          answer={answer}
          patchQ={patchQ}
          patchA={patchA}
        />
      )}

      {question.type === "essay" && (
        <EssayBlock
          editable={editable}
          taking={taking}
          answer={answer}
          patchA={patchA}
          reviewMode={mode === "review"}
          manualScore={manualScore}
          onManualScoreChange={onManualScoreChange}
          teacherComment={teacherComment}
          onTeacherCommentChange={onTeacherCommentChange}
          maxScore={question.maxScore}
        />
      )}

      {question.type === "matching" && (
        <MatchingBlock
          question={question}
          editable={editable}
          taking={taking}
          showKey={showKey}
          answer={answer}
          patchQ={patchQ}
          patchA={patchA}
        />
      )}

      {question.type === "ordering" && (
        <OrderingBlock
          question={question}
          editable={editable}
          taking={taking}
          showKey={showKey}
          answer={answer}
          patchQ={patchQ}
          patchA={patchA}
        />
      )}

      {editable ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Макс. балл</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={question.maxScore}
              onChange={(e) =>
                patchQ({ maxScore: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Пояснение к решению</Label>
            <Textarea
              value={question.explanation ?? ""}
              onChange={(e) =>
                patchQ({ explanation: e.target.value || undefined })
              }
              rows={2}
              placeholder="Покажется ученику после проверки"
            />
          </div>
        </div>
      ) : null}

      {showKey && question.explanation ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Пояснение: </span>
          {question.explanation}
        </div>
      ) : null}

      {mode === "review" && answer?.teacherComment ? (
        <div className="rounded-lg border border-border/60 px-3 py-2 text-xs leading-relaxed">
          <span className="font-medium">Комментарий: </span>
          {answer.teacherComment}
        </div>
      ) : null}
    </div>
  );
}

function ChoiceBlock({
  question,
  editable,
  taking,
  showKey,
  answer,
  patchQ,
  patchA,
}: {
  question: TestQuestion;
  editable: boolean;
  taking: boolean;
  showKey: boolean;
  answer?: StudentAnswer;
  patchQ: (p: Partial<TestQuestion>) => void;
  patchA: (p: Partial<StudentAnswer>) => void;
}) {
  const options = question.options ?? [];
  const multi = question.type === "multiple_choice";
  const selected = answer?.selectedOptionIds ?? [];
  const correct = new Set(question.correctOptionIds ?? []);

  function toggleOption(optId: string) {
    if (!taking) return;
    if (multi) {
      const next = selected.includes(optId)
        ? selected.filter((id) => id !== optId)
        : [...selected, optId];
      patchA({ selectedOptionIds: next });
    } else {
      patchA({ selectedOptionIds: [optId] });
    }
  }

  return (
    <ul className="space-y-2">
      {options.map((opt, i) => {
        const isSelected = selected.includes(opt.id);
        const isCorrect = correct.has(opt.id);
        return (
          <li key={opt.id} className="flex items-start gap-2">
            {editable ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "mt-2 size-4 shrink-0 rounded-full border",
                    multi ? "rounded-sm" : "rounded-full",
                    isCorrect
                      ? "border-success bg-success/20"
                      : "border-border"
                  )}
                  title={multi ? "Верный вариант" : "Правильный ответ"}
                  onClick={() => {
                    if (multi) {
                      const ids = question.correctOptionIds ?? [];
                      patchQ({
                        correctOptionIds: ids.includes(opt.id)
                          ? ids.filter((id) => id !== opt.id)
                          : [...ids, opt.id],
                      });
                    } else {
                      patchQ({ correctOptionIds: [opt.id] });
                    }
                  }}
                />
                <Input
                  value={opt.text}
                  onChange={(e) => {
                    const next = options.map((o) =>
                      o.id === opt.id ? { ...o, text: e.target.value } : o
                    );
                    patchQ({ options: next });
                  }}
                  placeholder={`Вариант ${i + 1}`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={options.length <= 2}
                  onClick={() => {
                    const next = options.filter((o) => o.id !== opt.id);
                    patchQ({
                      options: next,
                      correctOptionIds: (question.correctOptionIds ?? []).filter(
                        (id) => id !== opt.id
                      ),
                    });
                  }}
                >
                  ×
                </Button>
              </>
            ) : (
              <label
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm",
                  taking && "hover:bg-muted/40",
                  isSelected && "border-foreground/30 bg-muted/30",
                  showKey && isCorrect && "border-success/40 bg-success/8",
                  showKey && isSelected && !isCorrect && "border-destructive/40"
                )}
              >
                {multi ? (
                  <Checkbox
                    checked={isSelected}
                    disabled={!taking}
                    onCheckedChange={() => toggleOption(opt.id)}
                    className="mt-0.5"
                  />
                ) : (
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    checked={isSelected}
                    disabled={!taking}
                    onChange={() => toggleOption(opt.id)}
                    className="mt-1"
                  />
                )}
                <span className="leading-relaxed">{opt.text || `Вариант ${i + 1}`}</span>
              </label>
            )}
          </li>
        );
      })}
      {editable ? (
        <li>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              patchQ({
                options: [...options, { id: newId("opt"), text: "" }],
              })
            }
          >
            + Вариант
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

function ShortAnswerBlock({
  question,
  editable,
  taking,
  showKey,
  answer,
  patchQ,
  patchA,
}: {
  question: TestQuestion;
  editable: boolean;
  taking: boolean;
  showKey: boolean;
  answer?: StudentAnswer;
  patchQ: (p: Partial<TestQuestion>) => void;
  patchA: (p: Partial<StudentAnswer>) => void;
}) {
  const isNumeric =
    question.type === "numeric" || question.answerKind === "number";
  return (
    <div className="space-y-2">
      {editable ? (
        <>
          {question.type !== "numeric" ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={question.answerKind !== "number"}
                onChange={() => patchQ({ answerKind: "text" })}
              />
              Текст
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={question.answerKind === "number"}
                onChange={() => patchQ({ answerKind: "number" })}
              />
              Число
            </label>
          </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Правильные ответы (через ; )</Label>
            <Input
              value={(question.correctAnswers ?? []).join("; ")}
              onChange={(e) =>
                patchQ({
                  correctAnswers: e.target.value
                    .split(";")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="например: 12; 12.0"
            />
          </div>
          {isNumeric ? (
            <div className="space-y-1.5">
              <Label>Допустимая погрешность</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={question.numericTolerance ?? 0}
                onChange={(e) =>
                  patchQ({ numericTolerance: Number(e.target.value) || 0 })
                }
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {taking || answer?.textAnswer != null ? (
            <Input
              value={answer?.textAnswer ?? ""}
              onChange={(e) => patchA({ textAnswer: e.target.value })}
              readOnly={!taking}
              placeholder={
                isNumeric ? "Число" : "Краткий ответ"
              }
            />
          ) : null}
          {showKey ? (
            <p className="text-xs text-muted-foreground">
              Верно: {(question.correctAnswers ?? []).join(" / ") || "—"}
              {isNumeric && question.numericTolerance
                ? ` (±${question.numericTolerance})`
                : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function EssayBlock({
  editable,
  taking,
  answer,
  patchA,
  reviewMode,
  manualScore,
  onManualScoreChange,
  teacherComment,
  onTeacherCommentChange,
  maxScore,
}: {
  editable: boolean;
  taking: boolean;
  answer?: StudentAnswer;
  patchA: (p: Partial<StudentAnswer>) => void;
  reviewMode: boolean;
  manualScore?: string;
  onManualScoreChange?: (v: string) => void;
  teacherComment?: string;
  onTeacherCommentChange?: (v: string) => void;
  maxScore: number;
}) {
  if (editable) {
    return (
      <p className="text-xs text-muted-foreground">
        Развёрнутый ответ проверяется вручную (до {maxScore} б.).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea
        rows={4}
        value={answer?.textAnswer ?? ""}
        onChange={(e) => patchA({ textAnswer: e.target.value })}
        readOnly={!taking}
        placeholder={taking ? "Ваш развёрнутый ответ…" : "Ответ не дан"}
        className={!taking ? "bg-muted/40" : undefined}
      />
      {reviewMode ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Балл (0–{maxScore})</Label>
            <Input
              type="number"
              min={0}
              max={maxScore}
              step={0.5}
              value={manualScore ?? ""}
              onChange={(e) => onManualScoreChange?.(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Комментарий к ответу</Label>
            <Textarea
              rows={2}
              value={teacherComment ?? ""}
              onChange={(e) => onTeacherCommentChange?.(e.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchingBlock({
  question,
  editable,
  taking,
  showKey,
  answer,
  patchQ,
  patchA,
}: {
  question: TestQuestion;
  editable: boolean;
  taking: boolean;
  showKey: boolean;
  answer?: StudentAnswer;
  patchQ: (p: Partial<TestQuestion>) => void;
  patchA: (p: Partial<StudentAnswer>) => void;
}) {
  const pairs = question.matchingPairs ?? [];
  const matching = answer?.matching ?? {};
  // Для ученика правые части в стабильном «перемешанном» порядке по id
  const rights = [...pairs].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="space-y-2">
      {editable ? (
        <>
          {pairs.map((p, i) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[8rem] flex-1"
                value={p.left}
                placeholder={`Слева ${i + 1}`}
                onChange={(e) => {
                  const next = pairs.map((x) =>
                    x.id === p.id ? { ...x, left: e.target.value } : x
                  );
                  patchQ({ matchingPairs: next });
                }}
              />
              <span className="text-muted-foreground">→</span>
              <Input
                className="min-w-[8rem] flex-1"
                value={p.right}
                placeholder={`Справа ${i + 1}`}
                onChange={(e) => {
                  const next = pairs.map((x) =>
                    x.id === p.id ? { ...x, right: e.target.value } : x
                  );
                  patchQ({ matchingPairs: next });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pairs.length <= 2}
                onClick={() =>
                  patchQ({
                    matchingPairs: pairs.filter((x) => x.id !== p.id),
                  })
                }
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              patchQ({
                matchingPairs: [
                  ...pairs,
                  { id: newId("mp"), left: "", right: "" },
                ],
              })
            }
          >
            + Пара
          </Button>
        </>
      ) : (
        <ul className="space-y-2">
          {pairs.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1.5 sm:flex-row sm:items-center"
            >
              <span className="min-w-[8rem] text-sm font-medium">{p.left}</span>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm sm:max-w-xs"
                disabled={!taking}
                value={matching[p.id] ?? ""}
                onChange={(e) =>
                  patchA({
                    matching: { ...matching, [p.id]: e.target.value },
                  })
                }
              >
                <option value="">— выберите —</option>
                {rights.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.right}
                  </option>
                ))}
              </select>
              {showKey ? (
                <span className="text-xs text-success">→ {p.right}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderingBlock({
  question,
  editable,
  taking,
  showKey,
  answer,
  patchQ,
  patchA,
}: {
  question: TestQuestion;
  editable: boolean;
  taking: boolean;
  showKey: boolean;
  answer?: StudentAnswer;
  patchQ: (p: Partial<TestQuestion>) => void;
  patchA: (p: Partial<StudentAnswer>) => void;
}) {
  const items = question.orderItems ?? [];
  const order =
    answer?.order && answer.order.length
      ? answer.order
      : items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));

  function move(idx: number, dir: -1 | 1) {
    if (!taking) return;
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    patchA({ order: next });
  }

  return (
    <div className="space-y-2">
      {editable ? (
        <>
          <p className="text-xs text-muted-foreground">
            Порядок в списке = правильный ответ.
          </p>
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
              <Input
                value={item.text}
                onChange={(e) => {
                  const next = items.map((x) =>
                    x.id === item.id ? { ...x, text: e.target.value } : x
                  );
                  patchQ({ orderItems: next });
                }}
                placeholder={`Элемент ${i + 1}`}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={items.length <= 2}
                onClick={() =>
                  patchQ({
                    orderItems: items.filter((x) => x.id !== item.id),
                  })
                }
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() =>
              patchQ({
                orderItems: [...items, { id: newId("ord"), text: "" }],
              })
            }
          >
            + Элемент
          </Button>
        </>
      ) : (
        <ul className="space-y-1.5">
          {order.map((id, i) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5"
              >
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 text-sm">{item.text}</span>
                {taking ? (
                  <div className="flex gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {showKey ? (
            <li className="pt-1 text-xs text-muted-foreground">
              Верный порядок:{" "}
              {items.map((i) => i.text).join(" → ")}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
