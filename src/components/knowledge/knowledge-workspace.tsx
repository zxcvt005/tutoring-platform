"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { MaterialsFolderPanel } from "@/components/folders/materials-folder-panel";
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
import { canManageSchoolKnowledgeBase } from "@/lib/auth/school-knowledge";
import {
  folderMatchesSection,
  isSubsectionFolder,
  type MaterialsSection,
} from "@/lib/folders/material-folders";
import { formatDate } from "@/lib/format";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import { cn } from "@/lib/utils";
import type {
  Homework,
  MaterialOrigin,
  TheoryMaterial,
  Topic,
  TopicStatus,
} from "@/lib/types";

type Kind = "theory" | "test" | "topic" | "intensive";
type Block = "school" | "teachers";
type SortKey = "title" | "updated";

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

export function KnowledgeWorkspace({
  knowledgeBasePath = "/direkciya/knowledge",
}: {
  knowledgeBasePath?: string;
}) {
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
  const [openTeachers, setOpenTeachers] = useState<string[]>([]);
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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Homework | null>(null);
  const [testFolderId, setTestFolderId] = useState<string | null>(null);
  const [testOwner, setTestOwner] = useState<{
    teacherId: string;
    libraryScope: "school" | "teacher";
  }>({ teacherId: "", libraryScope: "school" });
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicForm, setTopicForm] = useState({
    id: undefined as string | undefined,
    teacherId: "",
    libraryScope: "school" as "school" | "teacher",
    folderId: null as string | null,
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

  const schoolFolders = useMemo(
    () =>
      (data.materialFolders ?? []).filter(
        (folder) =>
          folder.ownerScope === "school" &&
          folder.teacherId == null &&
          folderMatchesSection(folder, kind as MaterialsSection)
      ),
    [data.materialFolders, kind]
  );

  if (auth && !canManageSchoolKnowledgeBase(auth.role)) {
    return (
      <p className="text-sm text-muted-foreground">
        База знаний доступна только дирекции и ассистентам.
      </p>
    );
  }

  function toggleTeacher(id: string) {
    setOpenTeachers((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  /** Папка создания: корень, текущий подраздел, либо ошибка для корня раздела. */
  function resolveCreateFolderId(
    materialKind: Kind
  ): string | null | "invalid" {
    if (kind !== materialKind) return null;
    if (!currentFolderId) return null;
    if (!isSubsectionFolder(schoolFolders, currentFolderId)) return "invalid";
    return currentFolderId;
  }

  function openNewTest() {
    const folderId = resolveCreateFolderId("test");
    if (folderId === "invalid") {
      toast.error(
        "Сначала откройте подраздел (папку внутри раздела), затем создайте тест"
      );
      return;
    }
    setEditingTest(null);
    setTestFolderId(folderId);
    setTestOwner({ teacherId: "", libraryScope: "school" });
    setTestOpen(true);
  }

  function openTest(hw: Homework) {
    setEditingTest(hw);
    setTestFolderId(hw.folderId ?? hw.sectionId ?? null);
    setTestOwner({
      teacherId: hw.libraryScope === "school" ? "" : hw.teacherId,
      libraryScope: hw.libraryScope === "school" ? "school" : "teacher",
    });
    setTestOpen(true);
  }

  function openNewTopic() {
    const folderId = resolveCreateFolderId("topic");
    if (folderId === "invalid") {
      toast.error(
        "Сначала откройте подраздел (папку внутри раздела), затем создайте тему"
      );
      return;
    }
    setTopicForm({
      id: undefined,
      teacherId: "",
      libraryScope: "school",
      folderId,
      sectionId: null,
      title: "",
      subject: "",
      description: "",
      status: "active",
    });
    setTopicOpen(true);
  }

  function openNewTheory() {
    const folderId = resolveCreateFolderId("theory");
    if (folderId === "invalid") {
      toast.error(
        "Сначала откройте подраздел (папку внутри раздела), затем создайте теорию"
      );
      return;
    }
    const q = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    router.push(`${knowledgeBasePath}/theory/new${q}`);
  }

  function openNewIntensive() {
    const folderId = resolveCreateFolderId("intensive");
    if (folderId === "invalid") {
      toast.error(
        "Сначала откройте подраздел (папку внутри раздела), затем создайте интенсив"
      );
      return;
    }
    const q = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    router.push(`${knowledgeBasePath}/intensives/new${q}`);
  }

  function openSavedCopy(kind: Kind, id: string) {
    setBlock("school");
    setKind(kind);
    if (kind === "intensive") {
      router.push(`${knowledgeBasePath}/intensives/${id}`);
      return;
    }
    if (kind === "theory") {
      router.push(`${knowledgeBasePath}/theory/${id}`);
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
      folderId: topic.folderId ?? topic.sectionId ?? null,
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
      folderId: topicForm.folderId,
      sectionId:
        topicForm.libraryScope === "school" ? null : topicForm.folderId,
      title: topicForm.title.trim(),
      subject: topicForm.subject.trim() || "Предмет",
      description: topicForm.description.trim(),
      status: topicForm.status,
    });
    setBusy(false);
    if (result.ok) setTopicOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="База знаний"
        description="Оригиналы школы и рабочие материалы преподавателей."
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={block === "school" ? "default" : "outline"}
          onClick={() => setBlock("school")}
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
            <Button type="button" variant="outline" onClick={openNewTheory}>
              Новая теория
            </Button>
            <Button type="button" variant="outline" onClick={openNewIntensive}>
              Новый интенсив
            </Button>
            <Button type="button" variant="outline" onClick={openNewTest}>
              Новый тест
            </Button>
            <Button type="button" variant="outline" onClick={openNewTopic}>
              Новая тема
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["theory", "Теория"],
                ["test", "Домашние задания"],
                ["topic", "Темы"],
                ["intensive", "Интенсивы"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kind === value ? "default" : "outline"}
                onClick={() => {
                  setKind(value);
                  setCurrentFolderId(null);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <MaterialsFolderPanel
            key={`school-${kind}`}
            ownerScope="school"
            teacherId={null}
            canEdit
            kinds={["folder", kind]}
            contentKind={kind}
            onCurrentFolderChange={setCurrentFolderId}
            onOpenMaterial={(itemKind, id) => {
              if (itemKind === "theory") {
                router.push(`${knowledgeBasePath}/theory/${id}`);
              } else if (itemKind === "intensive") {
                router.push(`${knowledgeBasePath}/intensives/${id}`);
              } else if (itemKind === "topic") {
                const topic = schoolTopics.find((t) => t.id === id);
                if (topic) openTopic(topic);
              } else if (itemKind === "test") {
                const hw = schoolTests.find((t) => t.id === id);
                if (hw) {
                  setEditingTest(hw);
                  setTestFolderId(hw.folderId ?? hw.sectionId ?? null);
                  setTestOwner({ teacherId: "", libraryScope: "school" });
                  setTestOpen(true);
                }
              }
            }}
            renderMaterialActions={(item) => {
              return (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setRemoving({
                        kind: (item.kind === "test"
                          ? "test"
                          : item.kind === "topic"
                            ? "topic"
                            : item.kind === "intensive"
                              ? "intensive"
                              : "theory") as Kind,
                        id: item.id,
                        title: item.title,
                      })
                    }
                  >
                    Удалить
                  </Button>
                </div>
              );
            }}
          />
        </div>
      ) : (
        <TeacherDevelopments
          knowledgeBasePath={knowledgeBasePath}
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

      <TestEditorDialog
        teacherId={testOwner.teacherId}
        libraryScope={testOwner.libraryScope}
        homework={editingTest}
        folderId={testFolderId}
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
        title={
          removing
            ? `Удалить «${removing.title}»?`
            : "Удалить материал?"
        }
        description={
          removing?.assigned
            ? "Материал уже назначен ученикам — он будет архивирован. Копии и история прохождения сохранятся. Другие сущности не удаляются."
            : "Материал будет удалён из базы, если нет назначений ученикам. Иначе — архивирован. Связанные чужие копии не затрагиваются."
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
          });
        }}
      />
    </div>
  );
}

function TeacherDevelopments({
  knowledgeBasePath,
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
  knowledgeBasePath: string;
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
                      knowledgeBasePath={knowledgeBasePath}
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
  knowledgeBasePath,
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
  knowledgeBasePath: string;
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
        knowledgeBasePath={knowledgeBasePath}
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
        knowledgeBasePath={knowledgeBasePath}
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
  knowledgeBasePath,
  title,
  kind,
  items,
  sourceIds,
  onOpenTest,
  onOpenTopic,
  onSave,
  onDelete,
}: {
  knowledgeBasePath: string;
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
                    href={`${knowledgeBasePath}/theory/${item.id}`}
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
