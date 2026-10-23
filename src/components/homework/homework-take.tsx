"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { QuestionFields } from "@/components/tests/question-fields";
import { Button } from "@/components/ui/button";
import {
  allowEarlySubmitWithUnanswered,
  firstAttemptStats,
  lastQuestionNavAction,
  resolveHomeworkTakePhase,
  unansweredBeforeSubmit,
  type FirstAttemptStats,
} from "@/lib/homework-take-flow";
import {
  applyDontKnow,
  canRevealKeys,
  DONT_KNOW_TEXT,
  isQuestionAnswered,
  summarizeAttempts,
} from "@/lib/tests/attempts";
import {
  emptyAnswersForQuestions,
  getAssignmentQuestions,
  getAssignmentTitle,
} from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { QuestionOutcomeStatus, StudentAnswer, TestQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

const outcomeLabel: Record<QuestionOutcomeStatus, string> = {
  correct_first: "Верно с первой попытки",
  corrected_second: "Исправлено со второй попытки",
  incorrect: "Неверно",
  pending_review: "Ожидает проверки",
  unanswered: "Не завершено",
};

export function HomeworkTake({
  assignmentId,
  backHref = "/auditoria/homework",
  backLabel = "Домашние задания",
  takeBasePath,
}: {
  assignmentId: string;
  backHref?: string;
  backLabel?: string;
  takeBasePath?: string;
}) {
  const { data, saveHomeworkDraft, submitHomeworkAssignment } = useDemoStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignment = data.homeworkAssignments.find((a) => a.id === assignmentId);
  const hw = assignment
    ? data.homeworks.find((h) => h.id === assignment.homeworkId)
    : undefined;

  if (!assignment || assignment.studentId !== data.currentStudentId) {
    return (
      <div className="space-y-3">
        <p className="text-sm">Задание не найдено или принадлежит другому ученику.</p>
        <Link
          href={backHref}
          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm"
        >
          К списку
        </Link>
      </div>
    );
  }

  const questions = getAssignmentQuestions(assignment, hw);
  const title = getAssignmentTitle(assignment, hw);
  const attempt1Submitted = Boolean(assignment.attempt1Submitted);
  const attempt2Submitted = Boolean(assignment.attempt2Submitted);
  const retryIds = assignment.retryQuestionIds ?? [];
  const unansweredIds = assignment.unansweredQuestionIds ?? [];
  const reveal = Boolean(assignment.revealKeys);
  const startAttempt2 = searchParams.get("attempt") === "2";
  const phase = resolveHomeworkTakePhase({
    status: assignment.status,
    attempt1Submitted,
    attempt2Submitted,
    retryCount: retryIds.length,
    unansweredCount: unansweredIds.length,
    startAttempt2,
  });

  const activeAttempt: 1 | 2 | null =
    phase === "attempt2" ? 2 : phase === "attempt1" ? 1 : null;

  const visibleQuestions: TestQuestion[] =
    activeAttempt === 2
      ? questions.filter((q) => retryIds.includes(q.id))
      : activeAttempt === 1 && attempt1Submitted
        ? questions.filter((q) => unansweredIds.includes(q.id))
        : questions;

  const seedAnswers =
    activeAttempt === 2
      ? assignment.attempt2Answers
      : assignment.attempt1Answers ?? assignment.answers;

  const missed =
    Boolean(assignment.missedNextLesson) &&
    assignment.status !== "completed" &&
    assignment.status !== "reviewed";

  const stats = firstAttemptStats(
    questions,
    assignment.attempt1Answers ?? []
  );
  const showResults =
    phase === "results" ||
    phase === "no_retry" ||
    reveal ||
    (attempt1Submitted && retryIds.length === 0 && canRevealKeys({
      attempt1Submitted,
      attempt2Submitted,
      retryCount: retryIds.length,
    }));

  const basePath = takeBasePath ?? `/auditoria/homework/${assignmentId}`;

  function openAttempt2() {
    router.replace(`${basePath}?attempt=2`);
  }

  return (
    <div className="space-y-3">
      {missed ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm">
          Не выполнено к следующему занятию. Можно продолжить — сохранённые ответы
          и попытки не сбрасываются.
        </p>
      ) : null}

      {phase === "first_attempt_summary" ? (
        <FirstAttemptSummary
          title={title}
          stats={stats}
          onStartAttempt2={openAttempt2}
          backHref={backHref}
          backLabel={backLabel}
        />
      ) : null}

      {phase === "no_retry" ? (
        <section className="panel space-y-3 p-4">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm">
            Первая попытка завершена. Повторно решать нечего — вторая попытка
            не открывается.
          </p>
          {stats.pendingReview > 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Есть ответы на проверке преподавателя. Это ещё не окончательный
              результат.
            </p>
          ) : null}
        </section>
      ) : null}

      {activeAttempt != null ? (
        <TakeForm
          key={`${assignment.id}-${assignment.status}-${activeAttempt}`}
          assignmentId={assignment.id}
          title={title}
          questions={questions}
          visibleQuestions={visibleQuestions}
          seedAnswers={seedAnswers ?? []}
          attemptNumber={activeAttempt}
          canEdit
          reveal={false}
          attempt1Submitted={attempt1Submitted}
          attempt2Submitted={attempt2Submitted}
          retryIds={retryIds}
          outcomes={assignment.questionOutcomes ?? []}
          attempt1Percent={assignment.attempt1Percent ?? null}
          attempt2Percent={assignment.attempt2Percent ?? null}
          attempt1Answers={assignment.attempt1Answers ?? []}
          attempt2Answers={assignment.attempt2Answers ?? []}
          saveHomeworkDraft={saveHomeworkDraft}
          submitHomeworkAssignment={submitHomeworkAssignment}
          backHref={backHref}
          backLabel={backLabel}
        />
      ) : null}

      {showResults && phase !== "first_attempt_summary" && activeAttempt == null ? (
        <TakeForm
          key={`${assignment.id}-results`}
          assignmentId={assignment.id}
          title={title}
          questions={questions}
          visibleQuestions={[]}
          seedAnswers={[]}
          attemptNumber={1}
          canEdit={false}
          reveal={reveal}
          attempt1Submitted={attempt1Submitted}
          attempt2Submitted={attempt2Submitted}
          retryIds={retryIds}
          outcomes={assignment.questionOutcomes ?? []}
          attempt1Percent={assignment.attempt1Percent ?? null}
          attempt2Percent={assignment.attempt2Percent ?? null}
          attempt1Answers={assignment.attempt1Answers ?? []}
          attempt2Answers={assignment.attempt2Answers ?? []}
          saveHomeworkDraft={saveHomeworkDraft}
          submitHomeworkAssignment={submitHomeworkAssignment}
          backHref={backHref}
          backLabel={backLabel}
        />
      ) : null}
    </div>
  );
}

function FirstAttemptSummary({
  title,
  stats,
  onStartAttempt2,
  backHref,
  backLabel,
}: {
  title: string;
  stats: FirstAttemptStats;
  onStartAttempt2: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <section className="panel space-y-4 p-5">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href={backHref} className="hover:underline">
            {backLabel}
          </Link>
        </p>
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Первая попытка завершена. Правильные ответы пока скрыты.
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Отвечено вопросов</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">
            {stats.answered} из {stats.total}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Верных ответов</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">
            {stats.correct}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Решить повторно</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">
            {stats.retryCount}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Незавершённых</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">
            {stats.unanswered}
          </dd>
        </div>
      </dl>
      {stats.percent != null ? (
        <p className="text-sm">
          Результат первой попытки:{" "}
          <span className="font-semibold tabular-nums">{stats.percent}%</span>
          {stats.percentIsPreliminary ? " (предварительно)" : ""}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Процент первой попытки пока нельзя посчитать.
        </p>
      )}
      {stats.pendingReview > 0 ? (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {stats.pendingReview}{" "}
          {stats.pendingReview === 1 ? "вопрос ждёт" : "вопросов ждут"} проверки
          преподавателя. Это не окончательный результат.
        </p>
      ) : null}
      <Button type="button" className="w-full sm:w-auto" onClick={onStartAttempt2}>
        Перейти ко второй попытке
      </Button>
    </section>
  );
}

function TakeForm({
  assignmentId,
  title,
  questions,
  visibleQuestions,
  seedAnswers,
  attemptNumber,
  canEdit,
  reveal,
  attempt1Submitted,
  attempt2Submitted,
  retryIds,
  outcomes,
  attempt1Percent,
  attempt2Percent,
  attempt1Answers,
  attempt2Answers,
  saveHomeworkDraft,
  submitHomeworkAssignment,
  backHref = "/auditoria/homework",
  backLabel = "Домашние задания",
}: {
  assignmentId: string;
  title: string;
  questions: TestQuestion[];
  visibleQuestions: TestQuestion[];
  seedAnswers: StudentAnswer[];
  attemptNumber: 1 | 2;
  canEdit: boolean;
  reveal: boolean;
  attempt1Submitted: boolean;
  attempt2Submitted: boolean;
  retryIds: string[];
  outcomes: { questionId: string; status: QuestionOutcomeStatus }[];
  attempt1Percent: number | null;
  attempt2Percent: number | null;
  attempt1Answers: StudentAnswer[];
  attempt2Answers: StudentAnswer[];
  saveHomeworkDraft: (
    id: string,
    answers: StudentAnswer[],
    attemptNumber?: 1 | 2
  ) => Promise<{ ok: boolean; error?: string }>;
  submitHomeworkAssignment: (
    id: string,
    answers: StudentAnswer[],
    attemptNumber?: 1 | 2
  ) => Promise<{ ok: boolean; error?: string }>;
  backHref?: string;
  backLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [answers, setAnswers] = useState<StudentAnswer[]>(() => {
    const empty = emptyAnswersForQuestions(visibleQuestions);
    return empty.map((e) => {
      const found = seedAnswers.find((a) => a.questionId === e.questionId);
      return found ? { ...e, ...found } : e;
    });
  });

  const current = visibleQuestions[index];
  const filled = visibleQuestions.filter((q) =>
    isQuestionAnswered(q, answers.find((a) => a.questionId === q.id))
  );
  const navAction = lastQuestionNavAction(index, visibleQuestions.length);

  function patchAnswer(next: StudentAnswer) {
    setAnswers((prev) => {
      const i = prev.findIndex((a) => a.questionId === next.questionId);
      if (i < 0) return [...prev, next];
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  async function save() {
    const result = await saveHomeworkDraft(assignmentId, answers, attemptNumber);
    if (!result.ok) toast.error(result.error || "Не удалось сохранить");
  }

  async function submit() {
    if (submittingRef.current || busy) return;
    const unanswered = unansweredBeforeSubmit(visibleQuestions, answers);
    if (unanswered > 0) {
      if (!allowEarlySubmitWithUnanswered(unanswered)) return;
      const ok = window.confirm(
        `Есть незаполненные вопросы (${unanswered}). Сдать попытку досрочно?`
      );
      if (!ok) return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      const result = await submitHomeworkAssignment(
        assignmentId,
        answers,
        attemptNumber
      );
      if (!result.ok) toast.error(result.error || "Не удалось отправить");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  const summary = useMemo(
    () =>
      summarizeAttempts(
        questions,
        attempt1Answers,
        attempt2Answers,
        attempt2Submitted
      ),
    [questions, attempt1Answers, attempt2Answers, attempt2Submitted]
  );

  const showResults =
    reveal || attempt2Submitted || (attempt1Submitted && retryIds.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href={backHref} className="hover:underline">
              {backLabel}
            </Link>
          </p>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? attemptNumber === 2
                ? "Вторая попытка: только задания с ошибками. Правильные ответы скрыты."
                : attempt1Submitted
                  ? "Дорешивание: только вопросы, на которые ещё не ответили."
                  : "Первая попытка. Можно сохранить черновик и завершить досрочно."
              : "Результат"}
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void save()}>
              Сохранить
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              Завершить попытку
            </Button>
          </div>
        ) : null}
      </div>

      {canEdit && visibleQuestions.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1">
            {visibleQuestions.map((q, i) => {
              const done = isQuestionAnswered(
                q,
                answers.find((a) => a.questionId === q.id)
              );
              return (
                <button
                  key={q.id}
                  type="button"
                  className={cn(
                    "h-7 w-7 rounded-full text-xs font-medium",
                    i === index
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-muted"
                        : "border border-border"
                  )}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Заполнено {filled.length} из {visibleQuestions.length}
          </p>
          {current ? (
            <div className="space-y-2">
              <QuestionFields
                question={current}
                index={index}
                mode="take"
                revealKey={false}
                answer={answers.find((a) => a.questionId === current.id)}
                onAnswerChange={patchAnswer}
              />
              {attemptNumber === 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const cur = answers.find((a) => a.questionId === current.id) ?? {
                      questionId: current.id,
                    };
                    patchAnswer(applyDontKnow(cur));
                    toast.message(`Ответ: ${DONT_KNOW_TEXT}`);
                  }}
                >
                  Не знаю
                </Button>
              ) : null}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={index === 0 || busy}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (navAction === "submit") void submit();
                    else setIndex((i) => i + 1);
                  }}
                >
                  {navAction === "submit" ? "Завершить попытку" : "Далее"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showResults && !canEdit ? (
        <div className="space-y-3">
          <div className="panel grid gap-2 p-3 sm:grid-cols-2">
            <p className="text-sm">
              Верных с 1-й попытки:{" "}
              <span className="font-semibold tabular-nums">
                {summary.correctFirst}
              </span>
              {attempt1Percent != null ? ` (${attempt1Percent}%)` : ""}
            </p>
            <p className="text-sm">
              Исправлено со 2-й:{" "}
              <span className="font-semibold tabular-nums">
                {summary.correctedSecond}
              </span>
              {attempt2Percent != null ? ` (${attempt2Percent}%)` : ""}
            </p>
            <p className="text-sm">
              Неверно или на проверке:{" "}
              <span className="font-semibold tabular-nums">
                {summary.incorrectOrPending}
              </span>
            </p>
            <p className="text-sm">
              Не завершено:{" "}
              <span className="font-semibold tabular-nums">
                {summary.unanswered}
              </span>
            </p>
          </div>
          <ul className="space-y-2">
            {questions.map((q, i) => {
              const st =
                outcomes.find((o) => o.questionId === q.id)?.status ??
                "unanswered";
              const a1 = attempt1Answers.find((a) => a.questionId === q.id);
              const a2 = attempt2Answers.find((a) => a.questionId === q.id);
              return (
                <li key={q.id} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {outcomeLabel[st]}
                  </p>
                  <QuestionFields
                    question={q}
                    index={i}
                    mode="review"
                    revealKey={reveal && st !== "pending_review"}
                    answer={a2 ?? a1}
                  />
                  {a1 && a2 ? (
                    <p className="text-xs text-muted-foreground">
                      1-я попытка: {formatAnswerPreview(a1)} · 2-я:{" "}
                      {formatAnswerPreview(a2)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!canEdit && !showResults ? (
        <p className="text-sm text-muted-foreground">
          Правильные ответы откроются после второй попытки.
        </p>
      ) : null}
    </div>
  );
}

function formatAnswerPreview(a: StudentAnswer) {
  if (a.textAnswer) return a.textAnswer;
  if (a.selectedOptionIds?.length) return a.selectedOptionIds.join(", ");
  return "—";
}
