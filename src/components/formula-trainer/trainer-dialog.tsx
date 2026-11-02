"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Atom,
  BookOpen,
  Check,
  Gauge,
  ListChecks,
  SunMedium,
  Target,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { FormulaAnswerResult } from "@/components/formula-trainer/answer-result";
import { FormulaMath } from "@/components/formula-trainer/formula-math";
import { FORMULA_OPTION_BUTTON_CLASS } from "@/components/formula-trainer/formula-option-styles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formulasInSubsections,
  listSubsections,
  TRAINER_GROUPS,
} from "@/lib/formula-trainer/catalog";
import {
  availableFormulaCount,
  listWeakTopics,
  setupFromSettings,
  subsectionIdsForGroups,
  toggleTrainerGroup,
  TRAINER_QUESTION_COUNTS,
  trainerSessionStartCheck,
  type TrainerQuestionCount,
  type TrainerSetupTab,
} from "@/lib/formula-trainer/display";
import type {
  AnswerFeedback,
  FormulaProgressRow,
  FormulaSubsectionId,
  TrainerGroupId,
  TrainerQuestionPublic,
  TrainerSessionPublic,
  TrainerSettings,
} from "@/lib/formula-trainer/types";
import {
  apiFormulaTrainer,
  apiFormulaTrainerGet,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type StatePayload = {
  settings: TrainerSettings;
  progress: FormulaProgressRow[];
};

type Session = {
  total: number;
  index: number;
  correct: number;
  answered: number;
  stoppedReason: string | null;
};

const GROUP_ICON = {
  mechanics: Gauge,
  mkt_thermo: Atom,
  electricity: Zap,
  optics_quantum: SunMedium,
} as const;

const SETUP_SUBTITLE =
  "Сформируйте тренировку и проверьте, насколько хорошо знаете формулы.";

export function FormulaTrainerDialog({
  open,
  onOpenChange,
  entry,
  resume,
  onAnswerRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: "setup" | "continue";
  resume: TrainerSessionPublic | null;
  onAnswerRecorded?: () => void;
}) {
  const [screen, setScreen] = useState<"setup" | "practice" | "done">("setup");
  const [progress, setProgress] = useState<FormulaProgressRow[]>([]);
  const [tab, setTab] = useState<TrainerSetupTab>("section");
  const [groupIds, setGroupIds] = useState<TrainerGroupId[]>([]);
  const [customIds, setCustomIds] = useState<FormulaSubsectionId[]>([]);
  const [weakIds, setWeakIds] = useState<FormulaSubsectionId[]>([]);
  const [count, setCount] = useState<TrainerQuestionCount>(10);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState<TrainerQuestionPublic | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wasOpen = useRef(false);
  const answering = useRef(false);

  const applyState = useCallback((state: StatePayload) => {
    const next = setupFromSettings(state.settings);
    setProgress(state.progress ?? []);
    setTab(next.tab);
    setGroupIds(next.groupIds);
    setCustomIds(next.customIds);
    setWeakIds(next.weakIds);
  }, []);

  const reloadState = useCallback(async () => {
    const state = await apiFormulaTrainerGet<StatePayload>("state");
    applyState(state);
    return state;
  }, [applyState]);

  useLayoutEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setFeedback(null);
    setSelected(null);
    setPlanMessage(null);
    setLoadError(null);
    setSession(null);
    if (entry === "continue" && resume?.question) {
      setQuestion(resume.question);
      setSession({
        total: resume.questionCount,
        index: resume.index,
        correct: resume.correct,
        answered: resume.answered,
        stoppedReason: null,
      });
      setScreen("practice");
      return;
    }
    setQuestion(null);
    setScreen("setup");
    void reloadState().catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : "Ошибка загрузки");
    });
  }, [open, entry, resume, reloadState]);

  async function saveSettings(patch: {
    selectedGroupId?: TrainerGroupId | "all";
    selectedSubsectionIds?: FormulaSubsectionId[];
    weakSpotsOnly?: boolean;
  }) {
    setBusy(true);
    try {
      const state = await apiFormulaTrainer<StatePayload>("settings", patch);
      setProgress(state.progress ?? []);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startTraining() {
    if (tab === "section" && groupIds.length === 0) {
      setPlanMessage("Выберите хотя бы один раздел");
      return;
    }
    const subsectionIds =
      tab === "custom"
        ? customIds
        : tab === "weak"
          ? weakIds
          : subsectionIdsForGroups(groupIds);
    const available = availableFormulaCount({
      tab,
      groupIds,
      subsectionIds,
      progress,
    });
    const check = trainerSessionStartCheck(available, count);
    if (!check.ok) {
      setPlanMessage(check.message);
      return;
    }
    setPlanMessage(null);
    const patch =
      tab === "section"
        ? {
            selectedSubsectionIds: subsectionIds,
            weakSpotsOnly: false,
          }
        : tab === "weak"
          ? weakIds.length > 0
            ? { selectedSubsectionIds: weakIds, weakSpotsOnly: true }
            : { selectedGroupId: "all" as const, weakSpotsOnly: true }
          : { selectedSubsectionIds: customIds, weakSpotsOnly: false };
    const saved = await saveSettings(patch);
    if (!saved) return;
    setBusy(true);
    try {
      const res = await apiFormulaTrainer<{
        resumed: boolean;
        session: TrainerSessionPublic;
      }>("start", { questionCount: count });
      if (!res.session.question) {
        setPlanMessage("Не удалось открыть вопрос тренировки");
        return;
      }
      setQuestion(res.session.question);
      setFeedback(null);
      setSelected(null);
      setSession({
        total: res.session.questionCount,
        index: res.session.index,
        correct: res.session.correct,
        answered: res.session.answered,
        stoppedReason: null,
      });
      setScreen("practice");
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : "Не удалось начать тренировку");
    } finally {
      setBusy(false);
    }
  }

  async function chooseOption(optionId: string) {
    if (!question || feedback || busy || answering.current) return;
    answering.current = true;
    setBusy(true);
    setSelected(optionId);
    try {
      const res = await apiFormulaTrainer<{
        feedback: AnswerFeedback;
        question: TrainerQuestionPublic;
      }>("answer", {
        questionId: question.questionId,
        selectedOptionId: optionId,
      });
      setFeedback(res.feedback);
      onAnswerRecorded?.();
      setSession((current) =>
        current
          ? {
              ...current,
              correct: current.correct + (res.feedback.correct ? 1 : 0),
              answered: current.answered + 1,
            }
          : current
      );
    } catch (err) {
      setSelected(null);
      toast.error(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      answering.current = false;
      setBusy(false);
    }
  }

  async function goNext() {
    if (!session) {
      onOpenChange(false);
      return;
    }
    if (session.index >= session.total) {
      setScreen("done");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFormulaTrainer<{
        ok: boolean;
        reason?: string;
        session?: TrainerSessionPublic;
      }>("current");
      if (!res.ok || !res.session?.question) {
        setSession((current) =>
          current
            ? {
                ...current,
                stoppedReason: res.reason ?? null,
              }
            : current
        );
        setScreen("done");
        return;
      }
      setQuestion(res.session.question);
      setFeedback(null);
      setSelected(null);
      setSession({
        total: res.session.questionCount,
        index: res.session.index,
        correct: res.session.correct,
        answered: res.session.answered,
        stoppedReason: null,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Ошибка загрузки";
      setSession((current) =>
        current ? { ...current, stoppedReason: reason } : current
      );
      setScreen("done");
    } finally {
      setBusy(false);
    }
  }

  const weakTopics = listWeakTopics(progress);
  const subsections = listSubsections();
  const selectedFormulaCount =
    customIds.length === 0 ? 0 : formulasInSubsections(customIds).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-3xl border border-black/10 bg-auditoria-surface p-0 shadow-xl ring-0 motion-reduce:animate-none sm:max-w-5xl"
        showCloseButton
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full text-[#ddd4ee]"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            opacity="0.55"
            d="M0 46c90-18 170-18 260 0s170 18 260 0 170-18 260 0 170 18 260 0 170-18 160 0v34H0Z"
          />
          <path
            fill="currentColor"
            opacity="0.35"
            d="M0 60c110-12 190-4 300 0s190 12 300 0 190-12 300 0 190 12 300 0v20H0Z"
          />
        </svg>

        <DialogHeader className="shrink-0 px-5 pt-5 pr-12 pb-0 text-left">
          <DialogTitle className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Тренажёр формул
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground sm:text-base">
            {screen === "setup"
              ? SETUP_SUBTITLE
              : "Выберите правильную формулу."}
          </DialogDescription>
        </DialogHeader>

        {screen === "setup" ? (
          <div
            key="setup"
            className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div
                role="tablist"
                aria-label="Режим тренировки"
                className="flex gap-1 overflow-x-auto rounded-full border border-black/10 bg-auditoria-surface p-1"
              >
                <SetupTab
                  active={tab === "section"}
                  icon={BookOpen}
                  label="Выбор раздела"
                  onClick={() => setTab("section")}
                />
                <SetupTab
                  active={tab === "weak"}
                  icon={Target}
                  label="Слабые темы"
                  count={weakTopics.length}
                  onClick={() => setTab("weak")}
                />
                <SetupTab
                  active={tab === "custom"}
                  icon={ListChecks}
                  label="Свой набор"
                  onClick={() => setTab("custom")}
                />
              </div>

              {tab === "section" ? (
                <div
                  key="section"
                  className="grid gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 lg:grid-cols-[minmax(0,1fr)_17rem]"
                >
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      Выберите раздел
                    </h3>
                    <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                      {TRAINER_GROUPS.map((group) => {
                        const Icon = GROUP_ICON[group.id];
                        const active = groupIds.includes(group.id);
                        return (
                          <button
                            key={group.id}
                            type="button"
                            aria-pressed={active}
                            disabled={busy}
                            onClick={() =>
                              setGroupIds((current) =>
                                toggleTrainerGroup(current, group.id)
                              )
                            }
                            className={cn(
                              "relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center transition-colors motion-safe:duration-150",
                              active
                                ? "border-[#d3e6f4] bg-pastel-blue"
                                : "border-black/10 bg-auditoria-surface hover:bg-pastel-blue/40"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-2 right-2 inline-flex size-5 items-center justify-center rounded-full border bg-auditoria-surface",
                                active
                                  ? "border-[#b7d4e8] text-foreground"
                                  : "border-black/15 text-transparent"
                              )}
                            >
                              <Check className="size-3.5" />
                            </span>
                            <Icon className="size-5 text-foreground/70" />
                            <span className="text-sm leading-snug font-medium">
                              {group.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {groupIds.length === 0
                        ? "Выберите хотя бы один раздел."
                        : "Вопросы берутся из всех выбранных разделов."}
                    </p>
                  </div>
                  <WeakTopicPanel
                    topics={weakTopics}
                    selectedIds={weakIds}
                    onPick={(id) => {
                      setTab("weak");
                      setWeakIds([id]);
                    }}
                  />
                </div>
              ) : null}

              {tab === "weak" ? (
                <div
                  key="weak"
                  className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                >
                  <WeakTopicPanel
                    topics={weakTopics}
                    selectedIds={weakIds}
                    expanded
                    onPick={(id) =>
                      setWeakIds((current) =>
                        current.includes(id)
                          ? current.filter((item) => item !== id)
                          : [...current, id]
                      )
                    }
                  />
                </div>
              ) : null}

              {tab === "custom" ? (
                <div
                  key="custom"
                  className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-semibold">
                      Свой набор
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Выбрано формул: {selectedFormulaCount}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Отметьте разделы. В тренировку входят все формулы отмеченного раздела.
                  </p>
                  <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {subsections.map((section) => {
                      const formulas = formulasInSubsections([section.subsectionId]);
                      const active = customIds.includes(section.subsectionId);
                      return (
                        <li key={section.subsectionId}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setCustomIds((current) =>
                                current.includes(section.subsectionId)
                                  ? current.filter((id) => id !== section.subsectionId)
                                  : [...current, section.subsectionId]
                              )
                            }
                            className={cn(
                              "w-full rounded-2xl border px-3 py-3 text-left transition-colors motion-safe:duration-150",
                              active
                                ? "border-[#d3e6f4] bg-pastel-blue"
                                : "border-black/10 bg-auditoria-surface hover:bg-pastel-blue/40"
                            )}
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">{section.subsectionTitle}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {section.count}
                              </span>
                            </span>
                            <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                              {formulas.map((formula) => formula.title).join(" · ")}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {loadError ? (
                <p className="text-sm text-muted-foreground">{loadError}</p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-black/10 bg-auditoria-surface px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Количество вопросов</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {TRAINER_QUESTION_COUNTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={count === value}
                        onClick={() => {
                          setCount(value);
                          setPlanMessage(null);
                        }}
                        className={cn(
                          "inline-flex size-10 items-center justify-center rounded-full border text-sm transition-colors motion-safe:duration-150",
                          count === value
                            ? "border-transparent bg-pastel-blue text-foreground"
                            : "border-black/10 bg-auditoria-surface text-foreground/80 hover:bg-pastel-blue/40"
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startTraining()}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#e7dff6] px-5 text-sm text-foreground transition-colors hover:bg-[#ddd3f1] disabled:opacity-60"
                >
                  Начать тренировку →
                </button>
              </div>
              {planMessage ? (
                <p className="mt-3 text-sm text-foreground/80">{planMessage}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {screen === "practice" && question ? (
          <div
            key={question.questionId}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            <p className="text-sm text-muted-foreground">
              {session
                ? `Вопрос ${session.index} из ${session.total}`
                : "Текущий вопрос"}
              {question.groupTitle ? ` · ${question.groupTitle}` : ""}
              {question.subsectionTitle ? ` · ${question.subsectionTitle}` : ""}
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {question.title}
            </h2>
            <ul className="mt-2 grid min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
              {(question.options ?? []).map((opt) => {
                const isSelected = selected === opt.id;
                const isCorrect = Boolean(feedback?.correct && isSelected);
                const isWrong = Boolean(feedback && !feedback.correct && isSelected);
                return (
                  <li key={opt.id} className="min-w-0">
                    <button
                      type="button"
                      disabled={Boolean(feedback) || busy}
                      onClick={() => void chooseOption(opt.id)}
                      className={cn(
                        FORMULA_OPTION_BUTTON_CLASS,
                        "border-black/10 bg-auditoria-surface transition-colors motion-safe:duration-150",
                        isSelected && !feedback && "border-[#b7d4e8] bg-pastel-blue",
                        isCorrect && "border-emerald-400/50 bg-pastel-mint",
                        isWrong && "border-[#e8b6ba] bg-pastel-rose",
                        !isSelected && !feedback && "hover:bg-pastel-blue/40"
                      )}
                    >
                      <FormulaMath expression={opt.expression} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {feedback?.correct ? (
              <FormulaAnswerResult
                feedback={feedback}
                action={
                  <AdvanceButton busy={busy} session={session} onClick={() => void goNext()} />
                }
              />
            ) : feedback ? (
              <>
                <FormulaAnswerResult feedback={feedback} />
                <AdvanceButton busy={busy} session={session} onClick={() => void goNext()} />
              </>
            ) : null}
          </div>
        ) : null}

        {screen === "done" && session ? (
          <div className="space-y-3 px-5 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <p className="font-display text-xl font-semibold">
              {session.stoppedReason ? "Тренировка остановлена" : "Тренировка завершена"}
            </p>
            <p className="text-sm text-muted-foreground">
              Верных ответов: {session.correct} из {session.answered}.
            </p>
            {session.stoppedReason ? (
              <p className="text-sm text-foreground/80">{session.stoppedReason}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setScreen("setup");
                setSession(null);
                setQuestion(null);
                setFeedback(null);
                void reloadState();
              }}
              className="inline-flex h-10 items-center justify-center rounded-full bg-pastel-blue px-4 text-sm text-foreground"
            >
              К настройкам
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AdvanceButton({
  busy,
  session,
  onClick,
}: {
  busy: boolean;
  session: Session | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center rounded-full bg-auditoria-surface px-4 text-sm text-foreground disabled:opacity-60"
    >
      {session && session.index < session.total
        ? "Следующий вопрос →"
        : session
          ? "Завершить тренировку"
          : "Закрыть"}
    </button>
  );
}

function SetupTab({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof BookOpen;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors motion-safe:duration-150",
        active ? "bg-pastel-blue text-foreground" : "text-foreground/75 hover:bg-pastel-blue/40"
      )}
    >
      <Icon className="size-4" />
      {label}
      {count && count > 0 ? (
        <span className="rounded-full bg-pastel-beige px-1.5 text-xs">{count}</span>
      ) : null}
    </button>
  );
}

function WeakTopicPanel({
  topics,
  selectedIds,
  expanded,
  onPick,
}: {
  topics: { subsectionId: FormulaSubsectionId; title: string }[];
  selectedIds: FormulaSubsectionId[];
  expanded?: boolean;
  onPick: (id: FormulaSubsectionId) => void;
}) {
  return (
    <aside
      className={cn(
        "rounded-2xl border border-black/10 bg-[#f6f3fa] p-4",
        expanded && "min-h-40"
      )}
    >
      <p className="flex items-center gap-2 font-display text-base font-semibold">
        <Target className="size-4 text-foreground/70" />
        Ваши слабые темы
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Рекомендуем потренировать эти темы.
      </p>
      {topics.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/80">
          Пока нет тем, требующих дополнительной практики.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {topics.map((topic) => {
            const active = selectedIds.includes(topic.subsectionId);
            return (
              <li key={topic.subsectionId}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPick(topic.subsectionId)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors motion-safe:duration-150",
                    active
                      ? "border-[#e3d3b6] bg-pastel-beige"
                      : "border-transparent bg-pastel-beige/80 hover:bg-pastel-beige"
                  )}
                >
                  {topic.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
