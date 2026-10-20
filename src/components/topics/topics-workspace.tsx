"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { TopicStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDemoStore } from "@/lib/store/demo-store";
import { UNSECTIONED_ID, type Topic, type TopicStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type SectionBucket = {
  id: string | null;
  title: string;
  topics: Topic[];
};

export function TopicsWorkspace() {
  const {
    data,
    topicsForTeacher,
    sectionsForTeacher,
    homeworksForTopic,
    upsertTopic,
    deleteTopic,
    upsertTopicSection,
    deleteTopicSection,
    moveTopic,
    reorderTopics,
    reorderTopicSections,
  } = useDemoStore();

  const teacherId = data.currentTeacherId;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TopicStatus>("active");

  const [topicOpen, setTopicOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>(UNSECTIONED_ID);

  const [topicForm, setTopicForm] = useState({
    id: undefined as string | undefined,
    title: "",
    subject: "",
    description: "",
    programNote: "",
    status: "active" as TopicStatus,
    sectionId: null as string | null,
  });
  const [sectionForm, setSectionForm] = useState({
    id: undefined as string | undefined,
    title: "",
  });

  const [dragTopicId, setDragTopicId] = useState<string | null>(null);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);

  const sections = sectionsForTeacher(teacherId);
  const allTopics = topicsForTeacher(teacherId);

  const buckets = useMemo(() => {
    const filtered = allTopics.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      );
    });

    const list: SectionBucket[] = sections.map((s) => ({
      id: s.id,
      title: s.title,
      topics: filtered
        .filter((t) => t.sectionId === s.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    list.push({
      id: null,
      title: "Без раздела",
      topics: filtered
        .filter((t) => t.sectionId == null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    });

    return list;
  }, [allTopics, sections, statusFilter, query]);

  function topicStats(topicId: string) {
    const hws = homeworksForTopic(topicId);
    const assignments = data.homeworkAssignments.filter(
      (a) => a.topicId === topicId
    );
    const lessons = data.lessons.filter((l) => l.topicId === topicId);
    const doneHw = assignments.filter(
      (a) => a.status === "completed" || a.status === "reviewed"
    ).length;
    return {
      hwCount: hws.filter(
        (h) => h.status === "published" || h.status === "draft"
      ).length,
      assigned: assignments.length,
      doneHw,
      lessons: lessons.length,
    };
  }

  function openCreateTopic(sectionId: string | null = null) {
    const teacher = data.teachers.find((t) => t.id === teacherId);
    setTopicForm({
      id: undefined,
      title: "",
      subject: teacher?.subjects[0] ?? "",
      description: "",
      programNote: "",
      status: "active",
      sectionId,
    });
    setTopicOpen(true);
  }

  function openEditTopic(t: Topic) {
    setTopicForm({
      id: t.id,
      title: t.title,
      subject: t.subject,
      description: t.description ?? "",
      programNote: t.programNote ?? "",
      status: t.status,
      sectionId: t.sectionId,
    });
    setTopicOpen(true);
  }

  function saveTopic() {
    if (!topicForm.title.trim() || !topicForm.subject.trim()) return;
    upsertTopic({
      id: topicForm.id,
      teacherId,
      sectionId: topicForm.sectionId,
      title: topicForm.title.trim(),
      subject: topicForm.subject.trim(),
      description: topicForm.description.trim() || undefined,
      programNote: topicForm.programNote.trim() || undefined,
      status: topicForm.status,
    });
    setTopicOpen(false);
  }

  function openCreateSection() {
    setSectionForm({ id: undefined, title: "" });
    setSectionOpen(true);
  }

  function openEditSection(id: string, title: string) {
    setSectionForm({ id, title });
    setSectionOpen(true);
  }

  function saveSection() {
    if (!sectionForm.title.trim()) return;
    upsertTopicSection({
      id: sectionForm.id,
      teacherId,
      title: sectionForm.title.trim(),
    });
    setSectionOpen(false);
  }

  function confirmDeleteSection() {
    if (!deletingSectionId) return;
    const target = moveTo === UNSECTIONED_ID ? null : moveTo;
    const result = deleteTopicSection(deletingSectionId, target);
    if (result.ok) {
      setDeleteSectionOpen(false);
      setDeletingSectionId(null);
    }
  }

  function moveTopicInList(
    sectionId: string | null,
    topicId: string,
    direction: -1 | 1
  ) {
    const bucket = buckets.find((b) => b.id === sectionId);
    if (!bucket) return;
    const ids = bucket.topics.map((t) => t.id);
    const idx = ids.indexOf(topicId);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids];
    const [item] = ordered.splice(idx, 1);
    ordered.splice(next, 0, item!);
    reorderTopics(teacherId, sectionId, ordered);
  }

  function moveSectionInList(sectionId: string, direction: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const idx = ids.indexOf(sectionId);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids];
    const [item] = ordered.splice(idx, 1);
    ordered.splice(next, 0, item!);
    reorderTopicSections(teacherId, ordered);
  }

  function onDropTopic(targetSectionId: string | null, beforeTopicId?: string) {
    if (!dragTopicId) return;
    const topic = allTopics.find((t) => t.id === dragTopicId);
    if (!topic) return;

    const bucketTopics = allTopics
      .filter(
        (t) =>
          (t.sectionId ?? null) === targetSectionId && t.id !== dragTopicId
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => t.id);

    const ordered = [...bucketTopics];
    if (beforeTopicId) {
      const idx = ordered.indexOf(beforeTopicId);
      if (idx >= 0) ordered.splice(idx, 0, dragTopicId);
      else ordered.push(dragTopicId);
    } else {
      ordered.push(dragTopicId);
    }

    if ((topic.sectionId ?? null) !== targetSectionId) {
      moveTopic(dragTopicId, targetSectionId, 0);
    }
    reorderTopics(teacherId, targetSectionId, ordered);
    setDragTopicId(null);
  }

  function onDropSection(beforeSectionId: string) {
    if (!dragSectionId || dragSectionId === beforeSectionId) return;
    const ids = sections.map((s) => s.id).filter((id) => id !== dragSectionId);
    const idx = ids.indexOf(beforeSectionId);
    if (idx >= 0) ids.splice(idx, 0, dragSectionId);
    else ids.push(dragSectionId);
    reorderTopicSections(teacherId, ids);
    setDragSectionId(null);
  }

  const otherSectionsForDelete = sections.filter(
    (s) => s.id !== deletingSectionId
  );

  return (
    <div>
      <PageHeader
        title="Темы"
        description="Разделы программы, темы, домашние задания и статистика прохождения."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={openCreateSection}
            >
              Новый раздел
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => openCreateTopic(null)}
            >
              Новая тема
            </Button>
          </div>
        }
      />

      <FilterBar>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="border-transparent bg-background sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as "all" | TopicStatus)}
        >
          <SelectTrigger className="w-full border-transparent bg-background sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {buckets.every((b) => b.topics.length === 0) && sections.length === 0 ? (
        <EmptyState title="Нет тем" description="Создайте раздел или первую тему." />
      ) : (
        <div className="space-y-4">
          {buckets.map((bucket) => {
            const isUnsectioned = bucket.id == null;
            return (
              <section
                key={bucket.id ?? UNSECTIONED_ID}
                className="panel overflow-hidden"
                onDragOver={(e) => {
                  if (dragTopicId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropTopic(bucket.id);
                }}
              >
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5",
                    !isUnsectioned && "bg-muted/30"
                  )}
                  draggable={!isUnsectioned}
                  onDragStart={() => {
                    if (!isUnsectioned && bucket.id) setDragSectionId(bucket.id);
                  }}
                  onDragEnd={() => setDragSectionId(null)}
                  onDragOver={(e) => {
                    if (dragSectionId && !isUnsectioned) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (bucket.id) onDropSection(bucket.id);
                  }}
                >
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                      {bucket.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {bucket.topics.length} тем
                      {!isUnsectioned ? " · перетащите заголовок для порядка разделов" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {!isUnsectioned && bucket.id ? (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => moveSectionInList(bucket.id!, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => moveSectionInList(bucket.id!, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            openEditSection(bucket.id!, bucket.title)
                          }
                        >
                          Переименовать
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setDeletingSectionId(bucket.id!);
                            setMoveTo(UNSECTIONED_ID);
                            setDeleteSectionOpen(true);
                          }}
                        >
                          Удалить раздел
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => openCreateTopic(bucket.id)}
                    >
                      + Тема
                    </Button>
                  </div>
                </div>

                {bucket.topics.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    В этом разделе пока нет тем. Перетащите тему сюда или
                    создайте новую.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {bucket.topics.map((t) => {
                      const st = topicStats(t.id);
                      return (
                        <li
                          key={t.id}
                          draggable
                          onDragStart={() => setDragTopicId(t.id)}
                          onDragEnd={() => setDragTopicId(null)}
                          onDragOver={(e) => {
                            if (dragTopicId) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropTopic(bucket.id, t.id);
                          }}
                          className={cn(
                            "flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                            dragTopicId === t.id && "opacity-50"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="cursor-grab text-muted-foreground select-none"
                                title="Перетащить"
                                aria-hidden
                              >
                                ⋮⋮
                              </span>
                              <Link
                                href={`/kafedra/topics/${t.id}`}
                                className="font-medium hover:underline"
                              >
                                {t.title}
                              </Link>
                              <TopicStatusBadge status={t.status} />
                            </div>
                            <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                              {t.subject} · ДЗ {st.hwCount} · назначено{" "}
                              {st.assigned}/{st.doneHw} · занятий {st.lessons}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 pl-6 sm:pl-0">
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => moveTopicInList(bucket.id, t.id, -1)}
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => moveTopicInList(bucket.id, t.id, 1)}
                            >
                              ↓
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex h-6 items-center rounded-full border border-border bg-background px-2 text-xs font-medium hover:bg-muted">
                                Ещё
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-48">
                                <DropdownMenuItem
                                  onClick={() => openEditTopic(t)}
                                >
                                  Изменить
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Перенести в</DropdownMenuLabel>
                                {sections
                                  .filter((s) => s.id !== t.sectionId)
                                  .map((s) => (
                                    <DropdownMenuItem
                                      key={s.id}
                                      onClick={() => moveTopic(t.id, s.id)}
                                    >
                                      {s.title}
                                    </DropdownMenuItem>
                                  ))}
                                {t.sectionId != null ? (
                                  <DropdownMenuItem
                                    onClick={() => moveTopic(t.id, null)}
                                  >
                                    Без раздела
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => deleteTopic(t.id)}
                                >
                                  В архив
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={topicOpen} onOpenChange={setTopicOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {topicForm.id ? "Редактировать тему" : "Новая тема"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input
                value={topicForm.title}
                onChange={(e) =>
                  setTopicForm({ ...topicForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Предмет</Label>
              <Input
                value={topicForm.subject}
                onChange={(e) =>
                  setTopicForm({ ...topicForm, subject: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Раздел</Label>
              <Select
                value={topicForm.sectionId ?? UNSECTIONED_ID}
                onValueChange={(v) =>
                  v &&
                  setTopicForm({
                    ...topicForm,
                    sectionId: v === UNSECTIONED_ID ? null : v,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSECTIONED_ID}>Без раздела</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={topicForm.description}
                onChange={(e) =>
                  setTopicForm({ ...topicForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Связь с программой</Label>
              <Input
                value={topicForm.programNote}
                onChange={(e) =>
                  setTopicForm({ ...topicForm, programNote: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={topicForm.status}
                onValueChange={(v) =>
                  v &&
                  setTopicForm({ ...topicForm, status: v as TopicStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активна</SelectItem>
                  <SelectItem value="archived">В архиве</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {topicForm.id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  deleteTopic(topicForm.id!);
                  setTopicOpen(false);
                }}
              >
                В архив
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTopicOpen(false)}
              >
                Отмена
              </Button>
              <Button type="button" onClick={saveTopic}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sectionOpen} onOpenChange={setSectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {sectionForm.id ? "Переименовать раздел" : "Новый раздел"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Название раздела</Label>
            <Input
              value={sectionForm.title}
              onChange={(e) =>
                setSectionForm({ ...sectionForm, title: e.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSectionOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" onClick={saveSection}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteSectionOpen} onOpenChange={setDeleteSectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить раздел?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Темы не удаляются. Выберите, куда их перенести.
          </p>
          <div className="space-y-1.5">
            <Label>Перенести темы в</Label>
            <Select value={moveTo} onValueChange={(v) => v && setMoveTo(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) =>
                    v === UNSECTIONED_ID
                      ? "Без раздела"
                      : (otherSectionsForDelete.find((s) => s.id === v)?.title ??
                        "Выберите")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSECTIONED_ID}>Без раздела</SelectItem>
                {otherSectionsForDelete.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteSectionOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDeleteSection}>
              Удалить раздел
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
