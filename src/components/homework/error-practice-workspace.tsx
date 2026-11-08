"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target } from "lucide-react";
import { toast } from "sonner";

import type {
  ErrorBankSummary,
  ErrorPracticeSessionPublic,
} from "@/lib/error-practice/types";
import { formatKimNumber } from "@/lib/math/rich-text-math";
import { formatInAppZone } from "@/lib/app-time";
import {
  apiErrorPractice,
  apiErrorPracticeGet,
  HttpStatusError,
} from "@/lib/store/api-client";
import { cn } from "@/lib/utils";

type HistoryRow = {
  id: string;
  mode: "random" | "kim";
  kimNumber: number | null;
  questionCount: number;
  correctCount: number;
  incorrectCount: number;
  percent: number | null;
  completedAt: string | null;
  startedAt: string;
};

export function ErrorPracticeWorkspace() {
  const router = useRouter();
  const [summary, setSummary] = useState<ErrorBankSummary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [active, setActive] = useState<ErrorPracticeSessionPublic | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, hist, sess] = await Promise.all([
        apiErrorPracticeGet<ErrorBankSummary>("summary"),
        apiErrorPracticeGet<{ sessions: HistoryRow[] }>("history"),
        apiErrorPracticeGet<{ session: ErrorPracticeSessionPublic | null }>(
          "session"
        ),
      ]);
      setSummary(sum);
      setHistory(hist.sessions ?? []);
      setActive(sess.session);
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError
          ? err.message
          : "Не удалось загрузить банк ошибок"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(mode: "random" | "kim", kimNumber?: number) {
    setBusy(true);
    try {
      const res = await apiErrorPractice<{
        resumed: boolean;
        session: ErrorPracticeSessionPublic;
      }>("start", { mode, kimNumber });
      router.push(`/auditoria/homework/errors/${res.session.id}`);
    } catch (err) {
      toast.error(
        err instanceof HttpStatusError ? err.message : "Не удалось начать"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/auditoria/homework"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          К домашним заданиям
        </Link>
      </div>

      <section className="auditoria-home-card">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-pastel-beige text-foreground/80">
            <Target className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              Отработка ошибок
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Через 7 дней после ошибки задание станет доступно для отдельного
              теста из 10 вопросов.
            </p>
          </div>
        </div>

        {loading || !summary ? (
          <p className="mt-5 text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Активных ошибок" value={String(summary.activeCount)} />
              <Stat label="Доступно" value={String(summary.availableCount)} />
              <Stat label="Ожидает" value={String(summary.waitingCount)} />
              <Stat
                label="Отработано"
                value={String(summary.masteredCount)}
              />
            </dl>

            {active ? (
              <div className="mt-5 rounded-2xl border border-black/10 bg-pastel-blue/50 px-4 py-3">
                <p className="text-sm">
                  Есть незавершённая отработка ({active.correctCount + active.incorrectCount} из{" "}
                  {active.questionCount}).
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 inline-flex h-10 items-center rounded-full bg-pastel-blue px-4 text-sm"
                  onClick={() =>
                    router.push(`/auditoria/homework/errors/${active.id}`)
                  }
                >
                  Продолжить
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-beige px-5 text-sm text-foreground"
                  onClick={() => void start("random")}
                >
                  Начать случайную отработку
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {summary && summary.byKim.length > 0 ? (
        <section className="auditoria-home-card">
          <h2 className="font-display text-lg font-semibold">По номерам КИМ</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 font-medium">Номер</th>
                  <th className="pb-2 font-medium">Активных</th>
                  <th className="pb-2 font-medium">Доступно</th>
                  <th className="pb-2 font-medium">Ожидает</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {summary.byKim.map((row) => (
                  <tr key={row.label} className="border-t border-black/5">
                    <td className="py-2.5">{row.label}</td>
                    <td className="py-2.5 tabular-nums">{row.active}</td>
                    <td className="py-2.5 tabular-nums">{row.available}</td>
                    <td className="py-2.5 tabular-nums">{row.waiting}</td>
                    <td className="py-2.5 text-right">
                      {row.kimNumber != null && row.available > 0 && !active ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-full bg-pastel-blue/70 px-3 py-1 text-xs"
                          onClick={() => void start("kim", row.kimNumber!)}
                        >
                          Отработать
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="auditoria-home-card">
        <h2 className="font-display text-lg font-semibold">История отработок</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Завершённых сессий пока нет.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/auditoria/homework/errors/${row.id}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-auditoria-surface px-4 py-3 text-sm transition-colors hover:bg-pastel-blue/30"
                  )}
                >
                  <span>
                    {row.completedAt
                      ? formatInAppZone(row.completedAt, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                    {" · "}
                    {row.mode === "kim"
                      ? formatKimNumber(row.kimNumber)
                      : "Случайная"}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.correctCount}/{row.questionCount}
                    {row.percent != null ? ` · ${row.percent}%` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
