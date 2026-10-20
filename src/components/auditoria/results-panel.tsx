"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { TestTakeDialog } from "@/components/tests/test-take-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { getAssignmentTitle } from "@/lib/tests/helpers";
import { useDemoStore } from "@/lib/store/demo-store";
import type { HomeworkAssignment } from "@/lib/types";

export function AuditoriaResultsPanel() {
  const { data, assignmentsForStudent } = useDemoStore();
  const studentId = data.currentStudentId;
  const student = data.students.find((s) => s.id === studentId);
  const [openHw, setOpenHw] = useState<HomeworkAssignment | null>(null);

  const rows = useMemo(() => {
    return assignmentsForStudent(studentId)
      .filter((a) => a.status === "reviewed" || a.status === "completed")
      .sort((a, b) => {
        const ta = new Date(
          a.reviewedAt ?? a.completedAt ?? a.dueAt ?? 0
        ).getTime();
        const tb = new Date(
          b.reviewedAt ?? b.completedAt ?? b.dueAt ?? 0
        ).getTime();
        return tb - ta;
      });
  }, [assignmentsForStudent, studentId]);

  const dynamics = useMemo(() => {
    const reviewed = rows
      .filter((a) => a.status === "reviewed" && a.score != null)
      .slice()
      .reverse();
    return reviewed.map((a) => {
      const max = a.maxScore && a.maxScore > 0 ? a.maxScore : 1;
      const hw = data.homeworks.find((h) => h.id === a.homeworkId);
      return {
        id: a.id,
        pct: Math.round((a.score! / max) * 100),
        score: a.score!,
        maxScore: a.maxScore,
        at: a.reviewedAt ?? a.completedAt ?? a.dueAt,
        title: getAssignmentTitle(a, hw),
      };
    });
  }, [rows, data.homeworks]);

  if (!student) {
    return (
      <EmptyState
        title="Ученик не выбран"
        description="Выберите demo-ученика в боковой панели."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Результаты"
        description="История сданных и проверенных работ. Динамика строится только из ваших баллов."
      />

      {dynamics.length >= 2 ? (
        <section className="mb-8 space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Динамика баллов
          </h2>
          <ol className="flex flex-wrap items-end gap-3">
            {dynamics.map((d, i) => (
              <li key={d.id} className="min-w-[4.5rem] text-center">
                <div
                  className="mx-auto w-8 rounded-t-md bg-primary/80"
                  style={{ height: `${Math.max(12, d.pct * 0.72)}px` }}
                  title={`${d.title}: ${d.score}${d.maxScore != null ? `/${d.maxScore}` : ""}`}
                />
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {d.pct}%
                </p>
                <p className="text-[10px] text-muted-foreground">#{i + 1}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Столбики — процент от максимума по каждой проверенной работе (от
            ранних к поздним).
          </p>
        </section>
      ) : dynamics.length === 1 ? (
        <p className="mb-6 text-sm text-muted-foreground">
          Пока одна проверенная работа с баллом — динамика появится после
          следующих проверок.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Пока нет результатов"
          description="Сдайте задание — оно появится здесь после отправки и проверки."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Задание</TableHead>
              <TableHead>Тема</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Балл</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const hw = data.homeworks.find((h) => h.id === a.homeworkId);
              const topic = data.topics.find((t) => t.id === a.topicId);
              const dateIso = a.reviewedAt ?? a.completedAt ?? a.dueAt;
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {getAssignmentTitle(a, hw)}
                    {a.feedback && a.status === "reviewed" ? (
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground line-clamp-2">
                        {a.feedback}
                      </p>
                    ) : a.status === "completed" ? (
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                        Итог после проверки развёрнутых ответов
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {topic?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <HomeworkAssignmentStatusBadge
                      status={a.status}
                      perspective="student"
                    />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.score != null
                      ? `${a.score}${a.maxScore != null ? `/${a.maxScore}` : ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateIso ? formatDateTime(dateIso) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenHw(a)}
                    >
                      Открыть
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <TestTakeDialog
        assignment={openHw}
        open={!!openHw}
        onOpenChange={(o) => !o && setOpenHw(null)}
      />
    </div>
  );
}
