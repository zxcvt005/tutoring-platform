"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TestStatRow } from "@/lib/tests/test-stats";

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

function score(n: number | null | undefined, max: number) {
  if (n == null) return "—";
  return max > 0 ? `${n} / ${max}` : String(n);
}

export function TestGradesPanel() {
  const { data, auth } = useDemoStore();
  const teacherId =
    auth?.role === "teacher" ? auth.teacherId ?? data.currentTeacherId : data.currentTeacherId;
  const [rows, setRows] = useState<TestStatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void apiPlatform<{ tests: TestStatRow[] }>("getTestGradesStats", {
      teacherId,
    })
      .then((result) => {
        if (!cancelled) setRows(result.tests ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить оценки");
          setRows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  if (rows == null) {
    return <p className="text-sm text-muted-foreground">Загрузка оценок по тестам…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Результатов тестов пока нет"
        description="Когда ученики сдадут тесты, здесь появятся средние баллы за попытки и задания."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const open = expanded[row.testId];
        return (
          <li key={row.testId} className="panel space-y-2 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  Учеников: {row.studentCount}
                </p>
              </div>
              <div className="text-right text-sm tabular-nums">
                <p>1-я попытка: {pct(row.attempt1Average)}</p>
                <p>2-я попытка: {pct(row.attempt2Average)}</p>
              </div>
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [row.testId]: !open }))
              }
            >
              {open ? "Свернуть задания" : "Задания"}
            </Button>
            {open ? (
              row.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  По заданиям пока нет подтверждённых результатов.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {row.questions.map((q) => (
                    <li
                      key={`${q.questionId}:${q.prompt}`}
                      className="rounded-lg bg-muted/40 px-2 py-1.5"
                    >
                      <p className="font-medium">
                        {q.index}. {q.prompt || "Задание"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        1-я: {score(q.attempt1Average, q.maxScore)} · учтено{" "}
                        {q.attempt1Count}
                        {q.attempt1CorrectPercent != null
                          ? ` · верно ${q.attempt1CorrectPercent}%`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        2-я: {score(q.attempt2Average, q.maxScore)} · учтено{" "}
                        {q.attempt2Count}
                        {q.attempt2CorrectPercent != null
                          ? ` · верно ${q.attempt2CorrectPercent}%`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
