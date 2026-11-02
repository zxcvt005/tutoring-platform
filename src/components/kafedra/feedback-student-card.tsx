"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FeedbackMetricsPanel } from "@/components/feedback/metrics-panel";
import { FeedbackMonthSwitcher } from "@/components/feedback/month-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackFillStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  currentFeedbackPeriod,
  parseFeedbackPeriod,
  type FeedbackFillStatus,
  type MonthlyFeedbackMetrics,
} from "@/lib/monthly-feedback";
import { apiFeedback, apiFeedbackGet } from "@/lib/store/api-client";

type Report = {
  id: string;
  studentName: string;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  teacherComment: string;
  metrics: MonthlyFeedbackMetrics | null;
  metricsLive: boolean;
  fillStatus: FeedbackFillStatus;
  submittedAt: string | null;
};

const HINT =
  "Что получается хорошо, какие темы вызывают затруднения, как ученик работает на занятиях и на чём сосредоточиться в следующем месяце.";

export function KafedraFeedbackStudentCard({
  studentId,
  year: yearParam,
  month: monthParam,
}: {
  studentId: string;
  year?: string;
  month?: string;
}) {
  const initial = (() => {
    try {
      if (yearParam && monthParam) {
        return parseFeedbackPeriod({ year: yearParam, month: monthParam });
      }
    } catch {
      /* текущий месяц */
    }
    return currentFeedbackPeriod();
  })();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [report, setReport] = useState<Report | null>(null);
  const [comment, setComment] = useState("");
  const [savedComment, setSavedComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFeedbackGet<{ report: Report }>("teacherReport", {
        studentId,
        year: String(year),
        month: String(month),
      });
      setReport(data.report);
      setComment(data.report.teacherComment);
      setSavedComment(data.report.teacherComment);
      submittedRef.current = Boolean(data.report.submittedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить отчёт");
    }
  }, [studentId, year, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!report || report.submittedAt || comment === savedComment) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        const data = await apiFeedback<{ report: Report }>("saveDraft", {
          studentId,
          year,
          month,
          teacherComment: comment,
        });
        setReport(data.report);
        setSavedComment(data.report.teacherComment);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Не удалось сохранить черновик"
        );
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [comment, savedComment, report, studentId, year, month]);

  async function saveDraft() {
    setSaving(true);
    try {
      const data = await apiFeedback<{ report: Report }>("saveDraft", {
        studentId,
        year,
        month,
        teacherComment: comment,
      });
      setReport(data.report);
      setSavedComment(data.report.teacherComment);
      toast.success("Черновик сохранён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить черновик");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (submitting || submittedRef.current) return;
    if (!comment.trim()) {
      toast.error("Напишите комментарий, прежде чем отправить обратную связь в Прессу");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFeedback<{ report: Report }>("submit", {
        studentId,
        year,
        month,
        teacherComment: comment,
      });
      submittedRef.current = true;
      setReport(data.report);
      setComment(data.report.teacherComment);
      setSavedComment(data.report.teacherComment);
      toast.success("Обратная связь отправлена в Прессу");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Обратная связь" />
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/kafedra/feedback" className="mt-3 inline-block text-sm underline">
          К списку
        </Link>
      </div>
    );
  }

  if (!report) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  const locked = Boolean(report.submittedAt);

  return (
    <div>
      <PageHeader
        title={report.studentName}
        description={`Обратная связь за ${report.periodLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FeedbackMonthSwitcher
              year={year}
              month={month}
              onChange={(next) => {
                setYear(next.year);
                setMonth(next.month);
              }}
            />
            <FeedbackFillStatusBadge status={report.fillStatus} />
          </div>
        }
      />
      <p className="mb-4">
        <Link href="/kafedra/feedback" className="text-sm text-muted-foreground hover:underline">
          ← К списку учеников
        </Link>
      </p>
      <FeedbackMetricsPanel metrics={report.metrics} live={report.metricsLive} />
      <div className="mt-5">
        <label htmlFor="feedback-comment" className="text-sm font-medium">
          Комментарий преподавателя
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{HINT}</p>
        <Textarea
          id="feedback-comment"
          className="mt-2 min-h-40"
          value={comment}
          disabled={locked}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Кратко опишите работу ученика за месяц"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {locked
            ? "Отправленный комментарий нельзя изменить незаметно. Для правок свяжитесь с «Прессой»."
            : saving
              ? "Сохраняем черновик…"
              : comment !== savedComment
                ? "Есть несохранённые изменения"
                : "Черновик сохранён в базе"}
        </p>
      </div>
      {locked ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Отправлено в Прессу. Показатели зафиксированы и больше не изменятся при
          правках занятий.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving || submitting}
            onClick={() => void saveDraft()}
          >
            Сохранить черновик
          </Button>
          <Button
            type="button"
            disabled={saving || submitting}
            onClick={() => void submit()}
          >
            Отправить в Прессу
          </Button>
        </div>
      )}
    </div>
  );
}
