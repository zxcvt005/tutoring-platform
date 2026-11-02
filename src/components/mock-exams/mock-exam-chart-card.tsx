"use client";

import { useMemo } from "react";

import {
  formatExamDate,
  formatScoreDelta,
  MOCK_EXAM_EMPTY_TEXT,
  MOCK_EXAM_EMPTY_TITLE,
  studentMockExamSeries,
  TEST_SCORE_MAX,
} from "@/lib/mock-exams/records";
import type { MockExam, MockExamResult } from "@/lib/types";

export function MockExamChartCard({
  exams,
  results,
  studentId,
}: {
  exams: MockExam[];
  results: MockExamResult[];
  studentId: string;
}) {
  const series = useMemo(
    () => studentMockExamSeries(exams, results, studentId),
    [exams, results, studentId]
  );

  return (
    <section className="auditoria-home-card flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Пробники
        </h2>
        {series.latestTestScore != null ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            Последний {series.latestTestScore}
            {series.delta != null
              ? ` · ${formatScoreDelta(series.delta)} к предыдущему`
              : ""}
          </p>
        ) : null}
      </div>

      {series.points.length === 0 ? (
        <div className="py-4">
          <p className="font-display text-base font-semibold">
            {MOCK_EXAM_EMPTY_TITLE}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {MOCK_EXAM_EMPTY_TEXT}
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div
            className="flex min-w-full items-end gap-1"
            style={{ minWidth: Math.max(series.points.length * 52, 220) }}
          >
            <div className="flex h-44 w-7 shrink-0 flex-col justify-between pb-5 text-[10px] text-muted-foreground tabular-nums">
              <span>{TEST_SCORE_MAX}</span>
              <span>50</span>
              <span>0</span>
            </div>
            <div className="flex min-w-0 flex-1 items-end gap-2 border-b border-border/80">
              {series.points.map((point) => (
                <div
                  key={point.examId}
                  className="group flex w-12 shrink-0 flex-col items-center"
                  title={`${point.title}, ${formatExamDate(point.date)}: ${point.testScore}`}
                  aria-label={`${point.title}, вторичный балл ${point.testScore} из ${TEST_SCORE_MAX}`}
                >
                  <span className="text-xs font-medium tabular-nums">
                    {point.testScore}
                  </span>
                  <div className="relative mt-1 flex h-44 w-full items-end justify-center">
                    <div
                      className="w-5 rounded-t-md bg-chart-1"
                      style={{
                        height: `${point.testScore}%`,
                        minHeight: point.testScore === 0 ? 2 : undefined,
                      }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-6 hidden w-36 -translate-x-1/2 rounded-xl border border-border bg-card px-2.5 py-2 text-center text-xs shadow-sm group-hover:block">
                      <p className="font-medium">{point.title}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {formatExamDate(point.date)}
                      </p>
                      <p className="mt-1 tabular-nums">
                        {point.testScore} / {TEST_SCORE_MAX}
                      </p>
                    </div>
                  </div>
                  <span className="mt-1 max-w-full truncate text-center text-[10px] text-muted-foreground">
                    {point.axisLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
