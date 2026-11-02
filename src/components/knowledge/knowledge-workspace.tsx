"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TheoryStatusBadge, TopicStatusBadge } from "@/components/status-badge";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";
import type {
  Homework,
  Intensive,
  MaterialOrigin,
  TheoryMaterial,
  Topic,
  TopicStatus,
} from "@/lib/types";

type Kind = "theory" | "test" | "topic" | "intensive";
type Block = "school" | "teachers";
type SortKey = "title" | "updated";

type TransferResult = {
  phase: "plan" | "commit";
  planned: number;
  created: number;
  skipped: number;
  duplicates: {
    kind: Kind;
    id: string;
    title: string;
    teacherId: string;
    teacherName: string;
  }[];
  failed: { kind: string; id: string; teacherId: string; message: string }[];
};

const KIND_LABEL: Record<Kind, string> = {
  theory: "Теория",
  test: "Тесты",
  topic: "Темы",
  intensive: "Интенсивы",
};

const SAVE_TO_SCHOOL_EXPLAIN =
  "Будет создана независимая копия в собственных разработках школы. Последующие изменения материала преподавателя не повлияют на сохранённую копию.";

function originText(
  origin: MaterialOrigin | null | undefined,
  sourceAlive: boolean
) {
  if (!origin) return "Собственная разработка";
  const author = origin.sourceAuthorName ? ` · ${origin.sourceAuthorName}` : "";
  const when = formatDate(origin.copiedAt);
  const gone = sourceAlive ? "" : " · оригинал удалён";
  const from =
    origin.sourceScope === "teacher"
      ? "Сохранено из разработки"
      : "Копия из базы знаний";
  return `${from} «${origin.sourceTitle}»${author} · ${when}${gone}`;
}

export function KnowledgeWorkspace() {
  const {
    auth,
    data,
    reload,
    saveTopic,
    deleteTopic,
    deleteHomework,
    deleteTheory,
    deleteIntensive,
  } = useDemoStore();
  const router = useRouter();
  const [block, setBlock] = useState<Block>("school");
  const [kind, setKind] = useState<Kind>("theory");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openTeachers, setOpenTeachers] = useState<string[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [removing, setRemoving] = useState<{
    kind: Kind;
    id: string;
    title: string;
    assigned?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState<{
    kind: Kind;
    id: string;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Homework | null>(null);
  const [testOwner, setTestOwner] = useState<{
    teacherId: string;
    libraryScope: "school" | "teacher";
  }>({ teacherId: "", libraryScope: "school" });
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicForm, setTopicForm] = useState({
    id: undefined as string | undefined,
    teacherId: "",
    libraryScope: "school" as "school" | "teacher",
    sectionId: null as string | null,
    title: "",
    subject: "",
    description: "",
    status: "active" as TopicStatus,
  });

  const schoolTheories = data.theories.filter((item) => item.libraryScope === "school");
  const schoolTests = data.homeworks.filter(
    (item) => item.libraryScope === "school" && isCatalogHomeworkPurpose(item.purpose)
  );
  const schoolTopics = data.topics.filter((item) => item.libraryScope === "school");
  const schoolIntensives = data.intensives.filter(
    (item) => item.libraryScope === "school"
  );
  const sourceIds = useMemo(() => {
    return new Set([
      ...data.theories.map((item) => `theory:${item.id}`),
      ...data.homeworks.map((item) => `test:${item.id}`),
      ...data.topics.map((item) => `topic:${item.id}`),
    ]);
  }, [data.theories, data.homeworks, data.topics]);

  const schoolItems =
    kind === "intensive"
      ? schoolIntensives
      : kind === "theory"
        ? schoolTheories
        : kind === "test"
          ? schoolTests
          : schoolTopics;
  const visibleSchool = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = schoolItems.filter((item) => {
      if (!showArchived && (item.status === "archived")) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q);
    });
    return rows.slice().sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "ru");
      const au = "updatedAt" in a ? a.updatedAt ?? "" : "";
      const bu = "updatedAt" in b ? b.updatedAt ?? "" : "";
      return bu.localeCompare(au) || a.title.localeCompare(b.title, "ru");
    });
  }, [schoolItems, query, showArchived, sort]);

  if (auth && auth.role !== "director") {
    return (
      <p className="text-sm text-muted-foreground">
        База знаний доступна только дирекции.
      </p>
    );
  }

  function toggleSelected(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleTeacher(id: string) {
    setOpenTeachers((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function openNewTest() {
    setEditingTest(null);
    setTestOwner({ teacherId: "", libraryScope: "school" });
    setTestOpen(true);
  }

  function openTest(hw: Homework) {
    setEditingTest(hw);
    setTestOwner({
      teacherId: hw.libraryScope === "school" ? "" : hw.teacherId,
      libraryScope: hw.libraryScope === "school" ? "school" : "teacher",
    });
    setTestOpen(true);
  }

  function openNewTopic() {
    setTopicForm({
      id: undefined,
      teacherId: "",
      libraryScope: "school",
      sectionId: null,
      title: "",
      subject: "",
      description: "",
      status: "active",
    });
    setTopicOpen(true);
  }

  function openSavedCopy(kind: Kind, id: string) {
    setBlock("school");
    setKind(kind);
    if (kind === "intensive") {
      router.push(`/direkciya/knowledge/intensives/${id}`);
      return;
    }
    if (kind === "theory") {
      router.push(`/direkciya/knowledge/theory/${id}`);
      return;
    }
    if (kind === "test") {
      const hw = data.homeworks.find((item) => item.id === id);
      if (hw) openTest(hw);
      return;
    }
    const topic = data.topics.find((item) => item.id === id);
    if (topic) openTopic(topic);
  }

  async function saveTeacherMaterial() {
    if (!saving || busy) return;
    setBusy(true);
    try {
      const result = await apiPlatform<{
        created: boolean;
        id: string;
        kind: Kind;
        title: string;
      }>(
        "saveToSchoolLibrary",
        { kind: saving.kind, id: saving.id },
        crypto.randomUUID()
      );
      await reload();
      setBlock("school");
      setKind(result.kind);
      if (result.created) {
        toast.success(`«${result.title}» сохранено в собственные разработки`);
      } else {
        toast.message("Этот материал уже сохранён в собственных разработках", {
          action: {
            label: "Открыть",
            onClick: () => openSavedCopy(result.kind, result.id),
          },
        });
      }
      setSaving(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось сохранить материал"
      );
    } finally {
      setBusy(false);
    }
  }

  function openTopic(topic: Topic) {
    setTopicForm({
      id: topic.id,
      teacherId: topic.libraryScope === "school" ? "" : topic.teacherId,
      libraryScope: topic.libraryScope === "school" ? "school" : "teacher",
      sectionId: topic.sectionId,
      title: topic.title,
      subject: topic.subject,
      description: topic.description ?? "",
      status: topic.status,
    });
    setTopicOpen(true);
  }

  async function submitTopic() {
    if (!topicForm.title.trim() || !topicForm.description.trim()) {
      toast.error("Укажите название и описание темы");
      return;
    }
    setBusy(true);
    const result = await saveTopic({
      id: topicForm.id,
      teacherId: topicForm.libraryScope === "school" ? "" : topicForm.teacherId,
      libraryScope: topicForm.libraryScope,
      sectionId: topicForm.libraryScope === "school" ? null : topicForm.sectionId,
      title: topicForm.title.trim(),
      subject: topicForm.subject.trim() || "Предмет",
      description: topicForm.description.trim(),
      status: topicForm.status,
    });
    setBusy(false);
    if (result.ok) setTopicOpen(false);
  }

  const selectedItems = selected
    .map((id) => visibleSchool.find((item) => item.id === id) ?? schoolItems.find((item) => item.id === id))
    .filter((item): item is (typeof schoolItems)[number] => Boolean(item));

  return (
    <div className="space-y-4">
      <PageHeader
        title="База знаний"
        description="Оригиналы школы и рабочие материалы преподавателей. Передача создаёт независимую копию."
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={block === "school" ? "default" : "outline"}
          onClick={() => {
            setBlock("school");
            setSelected([]);
          }}
        >
          Собственная разработка
        </Button>
        <Button
          type="button"
          variant={block === "teachers" ? "default" : "outline"}
          onClick={() => setBlock("teachers")}
        >
          Разработки преподавателей
        </Button>
      </div>

      {block === "school" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as Kind[]).map((item) => {
              const count =
                item === "intensive"
                  ? schoolIntensives.length
                  : item === "theory"
                    ? schoolTheories.length
                    : item === "test"
                      ? schoolTests.length
                      : schoolTopics.length;
              return (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={kind === item ? "default" : "outline"}
                  onClick={() => {
                    setKind(item);
                    setSelected([]);
                  }}
                >
                  {KIND_LABEL[item]} · {count}
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию"
              className="max-w-xs"
            />
            <select
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="updated">Сначала новые</option>
              <option value="title">По названию</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showArchived}
                onCheckedChange={() => setShowArchived((v) => !v)}
              />
              Архив
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              {kind === "intensive" ? null : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={selected.length === 0}
                  onClick={() => setTransferOpen(true)}
                >
                  Передать преподавателям
                  {selected.length ? ` (${selected.length})` : ""}
                </Button>
              )}
              {kind === "intensive" ? (
                <Link
                  href="/direkciya/knowledge/intensives/new"
                  className={buttonVariants()}
                >
                  Новый интенсив
                </Link>
              ) : kind === "theory" ? (
                <Link
                  href="/direkciya/knowledge/theory/new"
                  className={buttonVariants()}
                >
                  Новая теория
                </Link>
              ) : kind === "test" ? (
                <Button type="button" onClick={openNewTest}>
                  Новый тест
                </Button>
              ) : (
                <Button type="button" onClick={openNewTopic}>
                  Новая тема
                </Button>
              )}
            </div>
          </div>
          {visibleSchool.length === 0 ? (
            <EmptyState
              title={schoolItems.length === 0 ? "Материалов пока нет" : "Ничего не найдено"}
              description={
                schoolItems.length === 0
                  ? kind === "intensive"
                    ? "Создайте общий интенсив. Преподаватель отправит его своим ученикам без копии."
                    : "Создайте оригинал школы. После передачи у преподавателя появится отдельная копия."
                  : "Измените поиск или фильтр."
              }
            />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={
                          visibleSchool.length > 0 &&
                          visibleSchool.every((item) => selected.includes(item.id))
                        }
                        onCheckedChange={() => {
                          const ids = visibleSchool.map((item) => item.id);
                          const allOn = ids.every((id) => selected.includes(id));
                          setSelected((prev) =>
                            allOn
                              ? prev.filter((id) => !ids.includes(id))
                              : [...new Set([...prev, ...ids])]
                          );
                        }}
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Название</th>
                    <th className="px-2 py-2 font-medium">Статус</th>
                    <th className="px-2 py-2 font-medium">Обновлено</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleSchool.map((item) => (
                    <tr key={item.id} className="border-t border-border/70">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.includes(item.id)}
                          onCheckedChange={() => toggleSelected(item.id)}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">
                        <p>{item.title}</p>
                        {"origin" in item && item.origin ? (
                          <p className="text-xs font-normal text-muted-foreground">
                            {originText(
                              item.origin,
                              sourceIds.has(
                                `${item.origin.sourceKind}:${item.origin.sourceId}`
                              )
                            )}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        {kind === "topic" ? (
                          <TopicStatusBadge status={item.status as TopicStatus} />
                        ) : (
                          <TheoryStatusBadge
                            status={item.status as TheoryMaterial["status"]}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {"updatedAt" in item && item.updatedAt
                          ? formatDate(item.updatedAt)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          {kind === "intensive" ? (
                            <Link
                              href={`/direkciya/knowledge/intensives/${item.id}`}
                              className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
                            >
                              Открыть
                            </Link>
                          ) : kind === "theory" ? (
                            <Link
                              href={`/direkciya/knowledge/theory/${item.id}`}
                              className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
                            >
                              Открыть
                            </Link>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                kind === "test"
                                  ? openTest(item as Homework)
                                  : openTopic(item as Topic)
                              }
                            >
                              Открыть
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              setRemoving({
                                kind,
                                id: item.id,
                                title: item.title,
                                assigned:
                                  kind === "theory"
                                    ? (item as TheoryMaterial).assignedCount > 0
                                    : kind === "intensive"
                                      ? (item as Intensive).assignedCount > 0
                                      : false,
                              })
                            }
                          >
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <TeacherDevelopments
          teachers={data.teachers}
          theories={data.theories}
          tests={data.homeworks}
          topics={data.topics}
          openTeachers={openTeachers}
          onToggleTeacher={toggleTeacher}
          sourceIds={sourceIds}
          query={query}
          onQuery={setQuery}
          showArchived={showArchived}
          onArchived={setShowArchived}
          onOpenTest={openTest}
          onOpenTopic={openTopic}
          onSave={(item) => setSaving(item)}
          onDelete={(item) => setRemoving(item)}
        />
      )}

      <TransferDialog
        open={transferOpen}
        materials={selectedItems.map((item) => ({
          kind,
          id: item.id,
          title: item.title,
        }))}
        teachers={data.teachers.filter((teacher) => teacher.status !== "archived")}
        onOpenChange={setTransferOpen}
        onDone={async () => {
          setSelected([]);
          setTransferOpen(false);
          await reload();
        }}
      />

      <TestEditorDialog
        teacherId={testOwner.teacherId}
        libraryScope={testOwner.libraryScope}
        homework={editingTest}
        open={testOpen}
        onOpenChange={setTestOpen}
        purpose="homework"
      />

      <Dialog open={topicOpen} onOpenChange={setTopicOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{topicForm.id ? "Тема" : "Новая тема"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input
                value={topicForm.title}
                onChange={(e) =>
                  setTopicForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Предмет</Label>
              <Input
                value={topicForm.subject}
                onChange={(e) =>
                  setTopicForm((prev) => ({ ...prev, subject: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={topicForm.description}
                onChange={(e) =>
                  setTopicForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <select
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                value={topicForm.status}
                onChange={(e) =>
                  setTopicForm((prev) => ({
                    ...prev,
                    status: e.target.value as TopicStatus,
                  }))
                }
              >
                <option value="active">Активна</option>
                <option value="archived">В архиве</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTopicOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submitTopic()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!saving}
        title={saving ? `Сохранить «${saving.title}»?` : "Сохранить в собственные разработки"}
        description={SAVE_TO_SCHOOL_EXPLAIN}
        confirmLabel="Сохранить"
        busyLabel="Сохранение…"
        confirmVariant="default"
        busy={busy}
        onOpenChange={(open) => !open && !busy && setSaving(null)}
        onConfirm={() => void saveTeacherMaterial()}
      />

      <ConfirmDialog
        open={!!removing}
        title="Удалить материал?"
        description={
          removing?.assigned
            ? "Если материал уже назначен ученикам, он будет архивирован. Копии и история прохождения сохранятся."
            : `«${removing?.title ?? ""}» будет удалён или архивирован по правилам этого типа. Другие копии не затрагиваются.`
        }
        busy={busy}
        onOpenChange={(open) => !open && !busy && setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          const action =
            removing.kind === "intensive"
              ? deleteIntensive(removing.id)
              : removing.kind === "theory"
                ? deleteTheory(removing.id)
                : removing.kind === "test"
                  ? deleteHomework(removing.id)
                  : deleteTopic(removing.id);
          void Promise.resolve(action).finally(() => {
            setBusy(false);
            setRemoving(null);
            setSelected((prev) => prev.filter((id) => id !== removing.id));
          });
        }}
      />
    </div>
  );
}

function TeacherDevelopments({
  teachers,
  theories,
  tests,
  topics,
  openTeachers,
  onToggleTeacher,
  sourceIds,
  query,
  onQuery,
  showArchived,
  onArchived,
  onOpenTest,
  onOpenTopic,
  onSave,
  onDelete,
}: {
  teachers: { id: string; fullName: string; status: string }[];
  theories: TheoryMaterial[];
  tests: Homework[];
  topics: Topic[];
  openTeachers: string[];
  onToggleTeacher: (id: string) => void;
  sourceIds: Set<string>;
  query: string;
  onQuery: (value: string) => void;
  showArchived: boolean;
  onArchived: (value: boolean) => void;
  onOpenTest: (hw: Homework) => void;
  onOpenTopic: (topic: Topic) => void;
  onSave: (item: { kind: Kind; id: string; title: string }) => void;
  onDelete: (item: { kind: Kind; id: string; title: string; assigned?: boolean }) => void;
}) {
  const [teacherKind, setTeacherKind] = useState<Kind>("theory");
  const visibleTeachers = teachers.filter((teacher) => teacher.status !== "archived");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Поиск по названию"
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showArchived}
            onCheckedChange={() => onArchived(!showArchived)}
          />
          Архив
        </label>
      </div>
      {visibleTeachers.length === 0 ? (
        <EmptyState title="Преподавателей нет" description="Добавьте преподавателя в организации." />
      ) : (
        <ul className="space-y-2">
          {visibleTeachers.map((teacher) => {
            const ownTheories = theories.filter((item) => item.teacherId === teacher.id);
            const ownTests = tests.filter(
              (item) =>
                item.teacherId === teacher.id && isCatalogHomeworkPurpose(item.purpose)
            );
            const ownTopics = topics.filter((item) => item.teacherId === teacher.id);
            const total = ownTheories.length + ownTests.length + ownTopics.length;
            const opened = openTeachers.includes(teacher.id);
            return (
              <li key={teacher.id} className="panel p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => onToggleTeacher(teacher.id)}
                >
                  <span>
                    <span className="font-medium">{teacher.fullName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      материалов: {total}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {opened ? "Свернуть" : "Открыть"}
                  </span>
                </button>
                {opened ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["theory", ownTheories.length],
                          ["test", ownTests.length],
                          ["topic", ownTopics.length],
                        ] as const
                      ).map(([item, count]) => (
                        <Button
                          key={item}
                          type="button"
                          size="sm"
                          variant={teacherKind === item ? "default" : "outline"}
                          onClick={() => setTeacherKind(item)}
                        >
                          {KIND_LABEL[item]} · {count}
                        </Button>
                      ))}
                    </div>
                    <MaterialGroups
                      kind={teacherKind}
                      theories={ownTheories}
                      tests={ownTests}
                      topics={ownTopics}
                      query={query}
                      showArchived={showArchived}
                      sourceIds={sourceIds}
                      onOpenTest={onOpenTest}
                      onOpenTopic={onOpenTopic}
                      onSave={onSave}
                      onDelete={onDelete}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MaterialGroups({
  kind,
  theories,
  tests,
  topics,
  query,
  showArchived,
  sourceIds,
  onOpenTest,
  onOpenTopic,
  onSave,
  onDelete,
}: {
  kind: Kind;
  theories: TheoryMaterial[];
  tests: Homework[];
  topics: Topic[];
  query: string;
  showArchived: boolean;
  sourceIds: Set<string>;
  onOpenTest: (hw: Homework) => void;
  onOpenTopic: (topic: Topic) => void;
  onSave: (item: { kind: Kind; id: string; title: string }) => void;
  onDelete: (item: { kind: Kind; id: string; title: string; assigned?: boolean }) => void;
}) {
  if (kind === "intensive") {
    return (
      <p className="text-sm text-muted-foreground">
        Общие интенсивы хранятся в собственных разработках школы и назначаются из кафедры без копии.
      </p>
    );
  }
  const rows =
    kind === "theory" ? theories : kind === "test" ? tests : topics;
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((item) => {
    if (!showArchived && item.status === "archived") return false;
    if (!q) return true;
    return item.title.toLowerCase().includes(q);
  });
  const own = filtered.filter((item) => !item.origin);
  const copies = filtered.filter((item) => item.origin);
  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">В этом разделе пусто.</p>
    );
  }
  return (
    <div className="space-y-3">
      <Group
        title="Собственные разработки"
        kind={kind}
        items={own}
        sourceIds={sourceIds}
        onOpenTest={onOpenTest}
        onOpenTopic={onOpenTopic}
        onSave={onSave}
        onDelete={onDelete}
      />
      <Group
        title="Копии из базы знаний и других источников"
        kind={kind}
        items={copies}
        sourceIds={sourceIds}
        onOpenTest={onOpenTest}
        onOpenTopic={onOpenTopic}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
}

function Group({
  title,
  kind,
  items,
  sourceIds,
  onOpenTest,
  onOpenTopic,
  onSave,
  onDelete,
}: {
  title: string;
  kind: Kind;
  items: (TheoryMaterial | Homework | Topic)[];
  sourceIds: Set<string>;
  onOpenTest: (hw: Homework) => void;
  onOpenTopic: (topic: Topic) => void;
  onSave: (item: { kind: Kind; id: string; title: string }) => void;
  onDelete: (item: { kind: Kind; id: string; title: string; assigned?: boolean }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {title} · {items.length}
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const alive = item.origin?.sourceId
            ? sourceIds.has(`${item.origin.sourceKind}:${item.origin.sourceId}`)
            : true;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {originText(item.origin, alive)}
                </p>
              </div>
              <div className="flex gap-1">
                {kind === "theory" ? (
                  <Link
                    href={`/direkciya/knowledge/theory/${item.id}`}
                    className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
                  >
                    Открыть
                  </Link>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      kind === "test"
                        ? onOpenTest(item as Homework)
                        : onOpenTopic(item as Topic)
                    }
                  >
                    Открыть
                  </Button>
                )}
                {item.libraryScope !== "school" ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      onSave({ kind, id: item.id, title: item.title })
                    }
                  >
                    Сохранить в собственные разработки
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    onDelete({
                      kind,
                      id: item.id,
                      title: item.title,
                      assigned:
                        kind === "theory"
                          ? (item as TheoryMaterial).assignedCount > 0
                          : false,
                    })
                  }
                >
                  Удалить
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TransferDialog({
  open,
  materials,
  teachers,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  materials: { kind: Kind; id: string; title: string }[];
  teachers: { id: string; fullName: string }[];
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<TransferResult["duplicates"]>([]);
  const [planned, setPlanned] = useState<number | null>(null);
  const [failures, setFailures] = useState<TransferResult["failed"]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  function reset() {
    setPicked([]);
    setDuplicates([]);
    setPlanned(null);
    setFailures([]);
    lock.current = false;
  }

  async function run(phase: "plan" | "commit", policy: "skip" | "create") {
    const idempotencyKey = phase === "commit" ? crypto.randomUUID() : undefined;
    return apiPlatform<TransferResult>(
      "transferKnowledge",
      {
        phase,
        duplicatePolicy: policy,
        teacherIds: picked,
        items: materials.map((item) => ({ kind: item.kind, id: item.id })),
      },
      idempotencyKey
    );
  }

  async function confirm(policy: "skip" | "create" | "review") {
    if (lock.current || picked.length === 0) return;
    lock.current = true;
    setBusy(true);
    try {
      if (policy === "review") {
        const plan = await run("plan", "skip");
        setFailures(plan.failed);
        if (plan.duplicates.length) {
          setDuplicates(plan.duplicates);
          setPlanned(plan.planned);
          return;
        }
        const committed = await run("commit", "skip");
        report(committed);
        await onDone();
        reset();
        return;
      }
      const committed = await run("commit", policy);
      report(committed);
      await onDone();
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось передать материалы");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const copies = materials.length * picked.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Передать преподавателям</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Выбрано материалов: {materials.length}. Преподавателей: {picked.length}.
          Будет создано копий: {planned ?? copies}. Повторная передача по умолчанию
          не создаёт дубликат.
        </p>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {teachers.map((teacher) => (
            <li key={teacher.id}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(teacher.id)}
                  onCheckedChange={() => {
                    setDuplicates([]);
                    setPlanned(null);
                    setPicked((prev) =>
                      prev.includes(teacher.id)
                        ? prev.filter((id) => id !== teacher.id)
                        : [...prev, teacher.id]
                    );
                  }}
                />
                {teacher.fullName}
              </label>
            </li>
          ))}
        </ul>
        {duplicates.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Уже есть копии: {duplicates.length}</p>
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {duplicates.map((item) => (
                <li key={`${item.id}:${item.teacherId}`}>
                  «{item.title}» → {item.teacherName}
                </li>
              ))}
            </ul>
            <p>Пропустить их или явно создать ещё одну копию.</p>
          </div>
        ) : null}
        {failures.length > 0 ? (
          <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-destructive">
            {failures.map((item, index) => (
              <li key={`${item.id}:${item.teacherId}:${index}`}>{item.message}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          {duplicates.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void confirm("skip")}
              >
                Пропустить существующие
              </Button>
              <Button type="button" disabled={busy} onClick={() => void confirm("create")}>
                Создать ещё копии
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={busy || picked.length === 0}
              onClick={() => void confirm("review")}
            >
              Передать
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function report(result: TransferResult) {
  const failed = result.failed.length;
  if (failed) {
    toast.error(
      `Создано копий: ${result.created}. Пропущено: ${result.skipped}. Ошибок: ${failed}.`
    );
    return;
  }
  toast.success(
    `Создано копий: ${result.created}. Пропущено: ${result.skipped}.`
  );
}
