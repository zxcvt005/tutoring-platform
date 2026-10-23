"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, HomeworkTemplateStatus } from "@/lib/types";
import { UNSECTIONED_ID } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusLabel: Record<HomeworkTemplateStatus, string> = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "Архив",
};

export function TestsWorkspace() {
  const {
    data,
    sectionsForTeacher,
    homeworksForTeacher,
    upsertTopicSection,
    deleteHomework,
  } = useDemoStore();
  const teacherId = data.currentTeacherId;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | HomeworkTemplateStatus
  >("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");

  const sections = sectionsForTeacher(teacherId);
  const tests = homeworksForTeacher(teacherId);

  const filtered = useMemo(() => {
    return tests.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [tests, statusFilter, query]);

  const buckets = useMemo(() => {
    const list = sections.map((s) => ({
      id: s.id,
      title: s.title,
      tests: filtered
        .filter((t) => t.sectionId === s.id)
        .sort((a, b) => a.title.localeCompare(b.title, "ru")),
    }));
    list.push({
      id: UNSECTIONED_ID,
      title: "Без раздела",
      tests: filtered
        .filter((t) => !t.sectionId)
        .sort((a, b) => a.title.localeCompare(b.title, "ru")),
    });
    return list.filter((b) => b.tests.length > 0 || statusFilter === "all");
  }, [sections, filtered, statusFilter]);

  function openNew(sec: string | null) {
    setSectionId(sec);
    setEditing(null);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Тесты"
        description="Каталог тестов по разделам программы. Назначаются ученику на конкретное занятие."
        actions={
          <Button type="button" onClick={() => openNew(null)}>
            Новый тест
          </Button>
        }
      />
      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            v && setStatusFilter(v as "all" | HomeworkTemplateStatus)
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue>
              {() =>
                statusFilter === "all" ? "Все статусы" : statusLabel[statusFilter]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="draft">Черновик</SelectItem>
            <SelectItem value="published">Опубликован</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Новый раздел"
            className="w-44"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!newSection.trim()}
            onClick={() => {
              upsertTopicSection({
                teacherId,
                title: newSection.trim(),
              });
              setNewSection("");
            }}
          >
            Добавить раздел
          </Button>
        </div>
      </FilterBar>

      {tests.length === 0 ? (
        <EmptyState
          title="Тестов пока нет"
          description="Создайте тест, добавьте вопросы и опубликуйте его, чтобы назначать как домашнее задание."
        />
      ) : (
        <div className="space-y-5">
          {buckets.map((bucket) => (
            <section key={bucket.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  {bucket.title}
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    openNew(bucket.id === UNSECTIONED_ID ? null : bucket.id)
                  }
                >
                  + Тест
                </Button>
              </div>
              {bucket.tests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пусто</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {bucket.tests.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={cn(
                          "panel flex w-full flex-col gap-1 p-3 text-left hover:bg-muted/40",
                          t.status === "archived" && "opacity-70"
                        )}
                        onClick={() => {
                          setEditing(t);
                          setSectionId(t.sectionId ?? null);
                          setEditorOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{t.title}</p>
                          <span className="text-[0.7rem] text-muted-foreground">
                            {statusLabel[t.status]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Вопросов: {t.questionCount ?? t.questions.length} ·
                          назначен: {t.assignmentCount ?? 0}
                        </p>
                        {t.description ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        ) : null}
                      </button>
                      {t.status !== "archived" ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="mt-0.5"
                          onClick={() => deleteHomework(t.id)}
                        >
                          В архив
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <TestEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        teacherId={teacherId}
        topicId={editing?.topicId ?? null}
        sectionId={editing ? editing.sectionId ?? null : sectionId}
        homework={editing}
      />
    </div>
  );
}
