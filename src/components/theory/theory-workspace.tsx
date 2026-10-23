"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TheoryAssignDialog } from "@/components/theory/theory-assign-dialog";
import { TheoryStatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { filterTheoriesByTitle, teacherTheoryStats } from "@/lib/theory/list";
import { useDemoStore } from "@/lib/store/demo-store";
import type { TheoryMaterial } from "@/lib/types";

export function TheoryWorkspace() {
  const {
    data,
    theoriesForTeacher,
    theoryAssignmentsForTeacher,
    deleteTheory,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const [query, setQuery] = useState("");
  const [assign, setAssign] = useState<TheoryMaterial | null>(null);
  const [removing, setRemoving] = useState<TheoryMaterial | null>(null);
  const [busy, setBusy] = useState(false);

  const items = theoriesForTeacher(teacherId);
  const assignments = theoryAssignmentsForTeacher(teacherId);
  const filtered = useMemo(
    () => filterTheoriesByTitle(items, query),
    [items, query]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Теория"
        description="Видео, конспекты и необязательный тест. Назначается ученику отдельно от домашних заданий."
        actions={
          <Link href="/kafedra/theory/new" className={buttonVariants()}>
            Новая теория
          </Link>
        }
      />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по названию"
        className="max-w-xs"
      />
      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Теорий пока нет" : "Ничего не найдено"}
          description={
            items.length === 0
              ? "Создайте материал со ссылкой на видео — его можно отправить ученикам."
              : "Измените запрос или сбросьте поиск."
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const stats = teacherTheoryStats(assignments, item.id);
            return (
              <li key={item.id} className="panel space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.updatedAt)} ·{" "}
                      {item.hasVideo ? "есть видео" : "без видео"} ·{" "}
                      {item.hasTest ? "есть тест" : "без теста"} · файлов:{" "}
                      {item.fileCount}
                    </p>
                  </div>
                  <TheoryStatusBadge status={item.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Отправлено: {stats.assignedCount}
                  {stats.completedCount > 0
                    ? ` · прошли: ${stats.completedCount}`
                    : ""}
                  {stats.awaitingReviewCount > 0
                    ? ` · на проверке: ${stats.awaitingReviewCount}`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={`/kafedra/theory/${item.id}`}
                    className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
                  >
                    Открыть
                  </Link>
                  <Link
                    href={`/kafedra/theory/${item.id}`}
                    className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
                  >
                    Редактировать
                  </Link>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={item.status !== "published"}
                    onClick={() => setAssign(item)}
                  >
                    Отправить ученикам
                  </Button>
                  <Link
                    href={`/kafedra/theory/${item.id}/results`}
                    className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
                  >
                    Результаты
                  </Link>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setRemoving(item)}
                  >
                    Удалить
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <TheoryAssignDialog
        material={assign}
        open={!!assign}
        onOpenChange={(open) => !open && setAssign(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title="Удалить теорию?"
        description={
          removing && removing.assignedCount > 0
            ? "Материал уже назначен ученикам. Он будет архивирован, история прохождения сохранится."
            : "Черновик и файлы, которые больше никому не нужны, будут удалены."
        }
        busy={busy}
        onOpenChange={(open) => !open && !busy && setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          void deleteTheory(removing.id).finally(() => {
            setBusy(false);
            setRemoving(null);
          });
        }}
      />
    </div>
  );
}
