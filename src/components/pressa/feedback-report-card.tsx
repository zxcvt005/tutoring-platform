"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FeedbackMetricsPanel } from "@/components/feedback/metrics-panel";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackPressStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import type {
  FeedbackPressStatus,
  MonthlyFeedbackMetrics,
} from "@/lib/monthly-feedback";
import { apiFeedback, apiFeedbackGet } from "@/lib/store/api-client";

type Report = {
  id: string;
  studentName: string;
  teacherName: string;
  periodLabel: string;
  teacherComment: string;
  metrics: MonthlyFeedbackMetrics | null;
  metricsLive: boolean;
  submittedAt: string | null;
  pressStatus: FeedbackPressStatus | null;
  parentMessageText: string;
  parentSentAt: string | null;
  prompt: string;
};

async function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Копирование в буфер обмена недоступно в этом браузере");
  }
  await navigator.clipboard.writeText(text);
}

export function PressFeedbackReportCard({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parentText, setParentText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFeedbackGet<{ report: Report }>("pressReport", {
        id: reportId,
      });
      setReport(data.report);
      setParentText(data.report.parentMessageText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить отчёт");
    }
  }, [reportId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function run(action: string, payload: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const data = await apiFeedback<{ report: Report }>(action, payload);
      setReport(data.report);
      setParentText(data.report.parentMessageText);
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!report) return;
    try {
      await copyText(report.prompt);
      toast.success("Промпт скопирован");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось скопировать промпт"
      );
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Обратная связь" />
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/pressa/feedback" className="mt-3 inline-block text-sm underline">
          К списку
        </Link>
      </div>
    );
  }

  if (!report) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div>
      <PageHeader
        title={report.studentName}
        description={`${report.periodLabel} · ${report.teacherName}${
          report.submittedAt ? ` · отправлено ${formatDateTime(report.submittedAt)}` : ""
        }`}
        actions={
          report.pressStatus ? (
            <FeedbackPressStatusBadge status={report.pressStatus} />
          ) : null
        }
      />
      <p className="mb-4">
        <Link href="/pressa/feedback" className="text-sm text-muted-foreground hover:underline">
          ← К списку отчётов
        </Link>
      </p>

      <section className="panel mb-4 p-4">
        <h2 className="text-sm font-semibold">Комментарий преподавателя</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
          {report.teacherComment || "Комментарий не передан."}
        </p>
      </section>

      <FeedbackMetricsPanel metrics={report.metrics} live={false} />

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copyPrompt()}>
          Скопировать промпт для ChatGPT
        </Button>
        {report.pressStatus === "pending" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run("pressStart", { id: report.id }, "Отчёт взят в работу")
            }
          >
            Взять в работу
          </Button>
        ) : null}
        {report.pressStatus !== "processed" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                "pressMarkProcessed",
                { id: report.id },
                "Отчёт отмечен обработанным"
              )
            }
          >
            Отметить обработанным
          </Button>
        ) : null}
      </div>

      <div className="mt-5">
        <label htmlFor="parent-text" className="text-sm font-medium">
          Итоговый текст для родителя
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Это отдельное поле. Оно не изменяет комментарий преподавателя и снимок
          показателей.
        </p>
        <Textarea
          id="parent-text"
          className="mt-2 min-h-40"
          value={parentText}
          onChange={(e) => setParentText(e.target.value)}
          placeholder="Вставьте или отредактируйте текст, который отправите родителю"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                "pressSaveText",
                { id: report.id, parentMessageText: parentText },
                "Текст для родителя сохранён"
              )
            }
          >
            Сохранить текст
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(report.parentSentAt)}
              disabled={busy}
              onCheckedChange={(checked) => {
                void run(
                  "pressMarkParentSent",
                  { id: report.id, sent: checked === true },
                  checked === true
                    ? "Отмечено: сообщение родителю отправлено"
                    : "Отметка об отправке снята"
                );
              }}
            />
            Сообщение родителю отправлено
          </label>
        </div>
      </div>
    </div>
  );
}
