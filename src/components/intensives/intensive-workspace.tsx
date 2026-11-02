"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { IntensiveAssignDialog } from "@/components/intensives/intensive-assign-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { TheoryStatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Intensive } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IntensiveWorkspace() {
  const { data, intensivesForTeacher, deleteIntensive } = useDemoStore();
  const [query, setQuery] = useState("");
  const [assign, setAssign] = useState<Intensive | null>(null);
  const [removing, setRemoving] = useState<Intensive | null>(null);
  const [busy, setBusy] = useState(false);
  const items = intensivesForTeacher(data.currentTeacherId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) =>
      q ? item.title.toLowerCase().includes(q) : true
    );
  }, [items, query]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Интенсивы"
        description="Длинная запись, конспект и несколько тестов. Общий интенсив из базы знаний можно отправить своим ученикам без копии."
        actions={
          <Link href="/kafedra/intensivy/new" className={buttonVariants()}>
            Новый интенсив
          </Link>
        }
      />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Поиск по названию"
        className="max-w-xs"
      />
      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Интенсивов пока нет" : "Ничего не найдено"}
          description={
            items.length === 0
              ? "Создайте интенсив или дождитесь общего материала в базе знаний."
              : "Измените запрос."
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const shared = item.libraryScope === "school";
            const own = item.teacherId === data.currentTeacherId;
            return (
              <li key={item.id} className="panel space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {shared ? "База знаний" : formatDate(item.updatedAt)}
                      {` · тестов: ${item.tests.length}`}
                      {item.fileCount > 0 ? " · конспект" : ""}
                      {item.videoUrl ? " · видео" : ""}
                    </p>
                  </div>
                  <TheoryStatusBadge status={item.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Отправлено ученикам: {item.assignedCount}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={`/kafedra/intensivy/${item.id}`}
                    className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
                  >
                    Открыть
                  </Link>
                  {item.status === "published" ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setAssign(item)}
                    >
                      Отправить
                    </Button>
                  ) : null}
                  {own ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setRemoving(item)}
                    >
                      Удалить
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <IntensiveAssignDialog
        intensive={assign}
        open={assign != null}
        onOpenChange={(next) => {
          if (!next) setAssign(null);
        }}
      />
      <ConfirmDialog
        open={removing != null}
        title="Удалить интенсив?"
        description={
          removing && removing.assignedCount > 0
            ? "Интенсив уже отправлен ученикам, поэтому он будет архивирован. Выданные версии сохранятся."
            : `«${removing?.title ?? ""}» будет удалён.`
        }
        busy={busy}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null);
        }}
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          void deleteIntensive(removing.id).finally(() => {
            setBusy(false);
            setRemoving(null);
          });
        }}
      />
    </div>
  );
}
