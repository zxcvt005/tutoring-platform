"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { QuestionFields } from "@/components/tests/question-fields";
import type {
  ErrorPracticeItemPublic,
  ErrorPracticeSessionPublic,
} from "@/lib/error-practice/types";
import { formatKimNumber } from "@/lib/math/rich-text-math";
import type { StudentAnswer } from "@/lib/types";
import {
  apiErrorPractice,
  apiErrorPracticeGet,
  HttpStatusError,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

export function ErrorPracticeTake({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ErrorPracticeSessionPublic | null>(
    null
  );
  const [draft, setDraft] = useState<StudentAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiErrorPracticeGet<{
        session: ErrorPracticeSessionPublic | null;
      }>("session", { sessionId });
      setSession(res.session);
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError ? err.message : "Не удалось загрузить"
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => {
    if (!session) return null;
    return (
      session.items.find((item) => !item.answered) ??
      session.items[session.items.length - 1] ??
      null
    );
  }, [session]);

  const done = session?.status === "completed";

  async function submitCurrent() {
    if (!session || !current || current.answered || !draft || busy) return;
    setBusy(true);
    try {
      const res = await apiErrorPractice<{
        item: ErrorPracticeItemPublic;
        session: ErrorPracticeSessionPublic;
      }>("answer", {
        sessionId: session.id,
        itemId: current.id,
        answer: draft,
      });
      setSession(res.session);
      setDraft(null);
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError ? err.message : "Ошибка проверки"
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Сессия не найдена.</p>
        <Link href="/auditoria/homework/errors" className="text-sm underline">
          К отработке ошибок
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5">
        <section className="auditoria-home-card">
          <h1 className="font-display text-xl font-semibold">Результаты отработки</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.mode === "kim"
              ? formatKimNumber(session.kimNumber)
              : "Случайная отработка"}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Заданий" value={String(session.questionCount)} />
            <Stat label="Верно" value={String(session.correctCount)} />
            <Stat label="Ошибки" value={String(session.incorrectCount)} />
            <Stat
              label="Процент"
              value={session.percent != null ? `${session.percent}%` : "—"}
            />
          </dl>
          <Link
            href="/auditoria/homework/errors"
            className="mt-5 inline-flex h-10 items-center rounded-full bg-pastel-beige px-4 text-sm"
          >
            К банку ошибок
          </Link>
        </section>
        <ul className="space-y-3">
          {session.items.map((item, index) => (
            <li key={item.id} className="auditoria-home-card space-y-3">
              <p className="text-xs text-muted-foreground">
                {item.sourceKind === "bank" ? "Из банка ошибок" : "Дополнительное"}
                {item.kimNumber != null
                  ? ` · ${formatKimNumber(item.kimNumber)}`
                  : ""}
                {item.isCorrect
                  ? " · Верно"
                  : item.isCorrect === false
                    ? " · Ошибка"
                    : ""}
              </p>
              <QuestionFields
                testId={item.sourceTestId ?? undefined}
                question={item.question}
                index={index}
                mode="review"
                revealKey
                showExplanation
                answer={item.answer ?? undefined}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!current) {
    return <p className="text-sm text-muted-foreground">Нет вопросов.</p>;
  }

  const index = current.position;
  const answered = current.answered;

  return (
    <div className="space-y-5">
      <section className="auditoria-home-card">
        <p className="text-sm text-muted-foreground">
          Вопрос {index + 1} из {session.questionCount}
          {session.mode === "kim"
            ? ` · ${formatKimNumber(session.kimNumber)}`
            : ""}
        </p>
        <QuestionFields
          testId={current.sourceTestId ?? undefined}
          question={
            answered && current.explanation
              ? { ...current.question, explanation: current.explanation }
              : current.question
          }
          index={index}
          mode={answered ? "review" : "take"}
          revealKey={answered}
          showExplanation={answered}
          answer={
            answered
              ? current.answer ?? undefined
              : draft ?? { questionId: current.question.id }
          }
          onAnswerChange={answered ? undefined : setDraft}
        />
        {answered ? (
          <div className="mt-4 space-y-3">
            <p
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-sm",
                current.isCorrect
                  ? "bg-pastel-mint"
                  : "bg-pastel-rose"
              )}
            >
              {current.isCorrect ? "Верно!" : "Ошибка"}
            </p>
            {current.sourceKind === "bank" ? (
              <p className="text-sm text-muted-foreground">
                {current.isCorrect
                  ? "Ошибка успешно отработана и убрана из активного банка."
                  : "Задание снова уйдёт в ожидание на 7 дней."}
              </p>
            ) : null}
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-full bg-pastel-blue px-4 text-sm"
              onClick={() => {
                if (session.items.every((i) => i.answered)) void load();
                else {
                  setDraft(null);
                }
              }}
            >
              {session.items.every((i) => i.answered)
                ? "К результатам"
                : "Следующий вопрос →"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || !draft}
            className="mt-4 inline-flex h-10 items-center rounded-full bg-pastel-beige px-4 text-sm disabled:opacity-50"
            onClick={() => void submitCurrent()}
          >
            {busy ? "Проверка…" : "Отправить ответ"}
          </button>
        )}
      </section>
      <Link
        href="/auditoria/homework/errors"
        className="text-sm text-muted-foreground underline"
      >
        Закрыть и продолжить позже
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold">{value}</dd>
    </div>
  );
}
