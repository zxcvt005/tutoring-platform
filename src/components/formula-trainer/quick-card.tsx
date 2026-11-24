"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sigma } from "lucide-react";

import { FormulaTrainerDialog } from "@/components/formula-trainer/trainer-dialog";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { trainerHomeSummary } from "@/lib/formula-trainer/display";
import { studentLearningLock } from "@/lib/learning-lock";
import type {
  FormulaProgressRow,
  TrainerSessionPublic,
} from "@/lib/formula-trainer/types";
import {
  apiFormulaTrainerGet,
  HttpStatusError,
} from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";

export function FormulaTrainerQuickCard() {
  const { data } = useDemoStore();
  const learning = studentLearningLock(data, data.currentStudentId);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReturnType<typeof trainerHomeSummary> | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<"setup" | "continue">("setup");
  const [activeSession, setActiveSession] = useState<TrainerSessionPublic | null>(
    null
  );
  const answersSaved = useRef(false);

  const load = useCallback(async () => {
    if (learning.locked) {
      setLoading(false);
      setSummary(null);
      setActiveSession(null);
      setMessage(null);
      return;
    }
    setLoading(true);
    try {
      const state = await apiFormulaTrainerGet<{
        progress: FormulaProgressRow[];
        activeSession: TrainerSessionPublic | null;
      }>("state");
      setSummary(trainerHomeSummary(state.progress ?? []));
      setActiveSession(state.activeSession ?? null);
      setMessage(null);
    } catch (err) {
      setSummary(null);
      setActiveSession(null);
      if (err instanceof HttpStatusError && err.status === 403) {
        setMessage(
          err.message ||
            "Тренажёр закрыт: пополните баланс занятий."
        );
        return;
      }
      setMessage(
        err instanceof HttpStatusError
          ? err.message
          : "Не удалось загрузить тренажёр формул"
      );
    } finally {
      setLoading(false);
    }
  }, [learning.locked]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <section className="auditoria-home-card min-w-0">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-pastel-blue text-foreground/80">
            <Sigma className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              Тренажёр формул
            </h2>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Сформируйте тренировку и проверьте, насколько хорошо знаете формулы.
            </p>
          </div>
        </div>

        {learning.locked ? (
          <div className="mt-4">
            <LearningLockedBanner message={learning.message} />
          </div>
        ) : loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Загрузка тренажёра…</p>
        ) : !summary ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {message ?? "Каталог формул пока недоступен."}
          </p>
        ) : (
          <>
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Формул" value={String(summary.formulaCount)} />
              <Stat label="Прогресс" value={summary.progressLabel} />
              <Stat label="Слабые темы" value={String(summary.weakTopics.length)} />
            </dl>
            {message ? (
              <p className="mt-3 text-sm text-muted-foreground">{message}</p>
            ) : null}
            <div className="mt-5">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-blue px-5 text-sm text-foreground"
                onClick={() => {
                  setEntry(activeSession ? "continue" : "setup");
                  setOpen(true);
                }}
              >
                {activeSession ? "Продолжить тренировку" : "Открыть тренажёр"}
              </button>
            </div>
          </>
        )}
      </section>

      {!learning.locked ? (
        <FormulaTrainerDialog
          open={open}
          entry={entry}
          resume={entry === "continue" ? activeSession : null}
          onAnswerRecorded={() => {
            answersSaved.current = true;
          }}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              answersSaved.current = false;
              void load();
            }
          }}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
