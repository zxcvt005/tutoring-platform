"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { MaterialsFolderPanel } from "@/components/folders/materials-folder-panel";
import { PageHeader } from "@/components/layout/page-header";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  countIntensivesInFolderSubtree,
  folderTransferIntensiveWarning,
} from "@/lib/folders/folder-transfer-intensives";
import {
  isSubsectionFolder,
  type MaterialFolderKind,
  type MaterialsSection,
} from "@/lib/folders/material-folders";
import { topicStatusLabel } from "@/lib/format";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, Topic, TopicStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RemovingTarget = {
  kind: "topic" | "test" | "theory" | "intensive";
  id: string;
  title: string;
};

const SECTION_META: Record<
  MaterialsSection,
  {
    title: string;
    description: string;
    kinds: MaterialFolderKind[];
    createLabel: string;
  }
> = {
  topic: {
    title: "Темы",
    description:
      "Разделы и подразделы программы. Темы создаются только внутри подраздела.",
    kinds: ["folder", "topic"],
    createLabel: "Новая тема",
  },
  theory: {
    title: "Теория",
    description:
      "Теоретические материалы по разделам. Файлы только внутри подраздела.",
    kinds: ["folder", "theory"],
    createLabel: "Новая теория",
  },
  test: {
    title: "Домашние задания",
    description:
      "Каталог тестов и ДЗ. Задания создаются только внутри подраздела.",
    kinds: ["folder", "test"],
    createLabel: "Новый тест",
  },
  intensive: {
    title: "Интенсивы",
    description:
      "Видеоинтенсивы по разделам. Материалы только внутри подраздела.",
    kinds: ["folder", "intensive"],
    createLabel: "Новый интенсив",
  },
};

export function MaterialsSectionWorkspace({
  section,
  teacherId: teacherIdProp,
}: {
  section: MaterialsSection;
  teacherId?: string;
}) {
  const router = useRouter();
  const meta = SECTION_META[section];
  const {
    data,
    topicsForTeacher,
    homeworksForTeacher,
    saveTopic,
    deleteTopic,
    deleteHomework,
    deleteTheory,
    deleteIntensive,
    restoreHomework,
    reload,
  } = useDemoStore();
  const teacherId = teacherIdProp ?? data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);

  const [showArchived, setShowArchived] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicForm, setTopicForm] = useState({
    id: undefined as string | undefined,
    title: "",
    subject: "",
    description: "",
    status: "active" as TopicStatus,
    folderId: null as string | null,
  });
  const [topicErrors, setTopicErrors] = useState<{
    title?: string;
    description?: string;
  }>({});

  const [testOpen, setTestOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Homework | null>(null);
  const [testFolderId, setTestFolderId] = useState<string | null>(null);
  const [folderToSchoolBusy, setFolderToSchoolBusy] = useState<string | null>(
    null
  );
  const [removing, setRemoving] = useState<RemovingTarget | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const topics = topicsForTeacher(teacherId);
  const tests = homeworksForTeacher(teacherId);
  const archivedTests = data.homeworks.filter(
    (h) =>
      h.teacherId === teacherId &&
      h.status === "archived" &&
      isCatalogHomeworkPurpose(h.purpose)
  );

  const folders = useMemo(
    () =>
      (data.materialFolders ?? []).filter(
        (f) =>
          f.ownerScope === "teacher" &&
          f.teacherId === teacherId
      ),
    [data.materialFolders, teacherId]
  );

  const canCreateEntity = isSubsectionFolder(folders, currentFolderId);

  function openCreateTopic(folderId: string | null) {
    if (!isSubsectionFolder(folders, folderId)) {
      toast.error(
        "Сначала откройте подраздел (папку внутри раздела), затем создайте тему"
      );
      return;
    }
    setTopicForm({
      id: undefined,
      title: "",
      subject: teacher?.subjects[0] ?? "",
      description: "",
      status: "active",
      folderId,
    });
    setTopicErrors({});
    setTopicOpen(true);
  }

  function openEditTopic(topic: Topic) {
    setTopicForm({
      id: topic.id,
      title: topic.title,
      subject: topic.subject,
      description: topic.description ?? "",
      status: topic.status,
      folderId: topic.folderId ?? topic.sectionId ?? null,
    });
    setTopicErrors({});
    setTopicOpen(true);
  }

  function submitTopic() {
    const errors: { title?: string; description?: string } = {};
    if (!topicForm.title.trim()) errors.title = "Укажите название";
    if (!topicForm.description.trim()) errors.description = "Укажите описание";
    if (!isSubsectionFolder(folders, topicForm.folderId)) {
      errors.title =
        errors.title ??
        "Тема должна находиться внутри подраздела";
    }
    setTopicErrors(errors);
    if (Object.keys(errors).length) return;
    setTopicSaving(true);
    void (async () => {
      try {
        const result = await saveTopic({
          id: topicForm.id,
          teacherId,
          folderId: topicForm.folderId,
          sectionId: topicForm.folderId,
          title: topicForm.title.trim(),
          subject: topicForm.subject.trim() || teacher?.subjects[0] || "Предмет",
          description: topicForm.description.trim(),
          status: topicForm.status,
        });
        if (result.ok) setTopicOpen(false);
      } finally {
        setTopicSaving(false);
      }
    })();
  }

  function createEntity() {
    if (!canCreateEntity) {
      toast.error(
        "Создайте подраздел внутри раздела, затем добавьте материал"
      );
      return;
    }
    if (section === "topic") {
      openCreateTopic(currentFolderId);
      return;
    }
    if (section === "test") {
      setEditingTest(null);
      setTestFolderId(currentFolderId);
      setTestOpen(true);
      return;
    }
    if (section === "theory") {
      const q = currentFolderId
        ? `?folderId=${encodeURIComponent(currentFolderId)}`
        : "";
      router.push(`/kafedra/theory/new${q}`);
      return;
    }
    const q = currentFolderId
      ? `?folderId=${encodeURIComponent(currentFolderId)}`
      : "";
    router.push(`/kafedra/intensivy/new${q}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={!canCreateEntity || showArchived}
              onClick={createEntity}
            >
              {meta.createLabel}
            </Button>
          </div>
        }
      />

      {!canCreateEntity && !showArchived ? (
        <p className="text-sm text-muted-foreground">
          Откройте или создайте подраздел внутри раздела — только там можно
          добавлять {meta.title.toLowerCase()}.
        </p>
      ) : null}

      {section === "test" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "outline" : "default"}
            onClick={() => setShowArchived(false)}
          >
            Активные
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived(true)}
          >
            Архив
            {archivedTests.length > 0 ? (
              <span className="ml-1 text-xs opacity-80">
                ({archivedTests.length})
              </span>
            ) : null}
          </Button>
        </div>
      ) : null}

      <MaterialsFolderPanel
        kinds={meta.kinds}
        contentKind={section}
        teacherId={teacherId}
        canEdit={!showArchived}
        showArchived={showArchived}
        onCurrentFolderChange={setCurrentFolderId}
        onOpenMaterial={(kind, id) => {
          if (showArchived && kind === "test") return;
          if (kind === "topic") {
            router.push(`/kafedra/topics/${id}`);
            return;
          }
          if (kind === "theory") {
            router.push(`/kafedra/theory/${id}`);
            return;
          }
          if (kind === "intensive") {
            router.push(`/kafedra/intensivy/${id}`);
            return;
          }
          if (kind === "test") {
            const hw = tests.find((t) => t.id === id) ?? null;
            setEditingTest(hw);
            setTestFolderId(hw?.folderId ?? hw?.sectionId ?? null);
            setTestOpen(true);
          }
        }}
        renderMaterialActions={(item) => {
          if (item.kind === "folder" && !showArchived) {
            return (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={folderToSchoolBusy === item.id}
                onClick={() => {
                  void (async () => {
                    const intensiveCount = countIntensivesInFolderSubtree(
                      data.materialFolders,
                      data.intensives.filter(
                        (row) =>
                          row.libraryScope === "teacher" &&
                          row.teacherId === teacherId
                      ),
                      item.id
                    );
                    const intensiveNote =
                      folderTransferIntensiveWarning(intensiveCount);
                    const ok = window.confirm(
                      [
                        `Передать папку «${item.title}» в Дирекцию со всем содержимым?`,
                        "Будет создана копия материалов (включая вложенные папки).",
                        intensiveNote ?? "Интенсивы в этой папке не найдены.",
                      ].join("\n\n")
                    );
                    if (!ok) return;
                    setFolderToSchoolBusy(item.id);
                    try {
                      const result = await apiPlatform<{
                        created: number;
                        skipped: number;
                        foldersCreated: number;
                        intensivesNotTransferred?: number;
                      }>(
                        "transferFolderToSchool",
                        {
                          sourceFolderId: item.id,
                          phase: "commit",
                          duplicatePolicy: "skip",
                        },
                        crypto.randomUUID()
                      );
                      const left =
                        result.intensivesNotTransferred ?? intensiveCount;
                      toast.success(
                        `В школьную базу: папок ${result.foldersCreated}, материалов ${result.created}, пропущено ${result.skipped}.${
                          left > 0
                            ? ` Интенсивы не копировались (${left}).`
                            : ""
                        }`
                      );
                      await reload();
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Не удалось передать папку"
                      );
                    } finally {
                      setFolderToSchoolBusy(null);
                    }
                  })();
                }}
              >
                В Дирекцию
              </Button>
            );
          }
          if (item.kind === "test") {
            if (showArchived) {
              return (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void restoreHomework(item.id)}
                >
                  Восстановить
                </Button>
              );
            }
            return (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() =>
                  setRemoving({
                    kind: "test",
                    id: item.id,
                    title: item.title,
                  })
                }
              >
                Удалить
              </Button>
            );
          }
          if (item.kind === "topic" && !showArchived) {
            const topic = topics.find((t) => t.id === item.id);
            if (!topic) return null;
            return (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => openEditTopic(topic)}
                >
                  Изменить
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setRemoving({
                      kind: "topic",
                      id: item.id,
                      title: item.title,
                    })
                  }
                >
                  Удалить
                </Button>
              </div>
            );
          }
          if (
            (item.kind === "theory" || item.kind === "intensive") &&
            !showArchived
          ) {
            const href =
              item.kind === "theory"
                ? `/kafedra/theory/${item.id}`
                : `/kafedra/intensivy/${item.id}`;
            return (
              <div className="flex gap-1">
                <Link
                  href={href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "xs" })
                  )}
                >
                  Открыть
                </Link>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setRemoving({
                      kind: item.kind as "theory" | "intensive",
                      id: item.id,
                      title: item.title,
                    })
                  }
                >
                  Удалить
                </Button>
              </div>
            );
          }
          return null;
        }}
      />

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
              {topicErrors.title ? (
                <p className="text-xs text-destructive">{topicErrors.title}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={topicForm.description}
                onChange={(e) =>
                  setTopicForm({ ...topicForm, description: e.target.value })
                }
              />
              {topicErrors.description ? (
                <p className="text-xs text-destructive">
                  {topicErrors.description}
                </p>
              ) : null}
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
                  <SelectValue>
                    {(v) => topicStatusLabel[v as TopicStatus] ?? "Статус"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {topicStatusLabel.active}
                  </SelectItem>
                  <SelectItem value="archived">
                    {topicStatusLabel.archived}
                  </SelectItem>
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
                  setRemoving({
                    kind: "topic",
                    id: topicForm.id!,
                    title: topicForm.title.trim() || "Без названия",
                  });
                  setTopicOpen(false);
                }}
              >
                Удалить
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
              <Button
                type="button"
                onClick={submitTopic}
                disabled={topicSaving}
              >
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        title={
          removing
            ? `Удалить «${removing.title}»?`
            : "Удалить материал?"
        }
        description={
          removing?.kind === "topic"
            ? "Если у темы есть связанные тесты, уроки или назначения, тема (и связанные тесты) будут архивированы, а не удалены. Другие материалы не затрагиваются."
            : removing?.kind === "test"
              ? "Если тест уже назначался ученикам, он будет архивирован (история сохраняется). Иначе тест удаляется из базы безвозвратно."
              : removing?.kind === "theory" || removing?.kind === "intensive"
                ? "Если материал уже назначался ученикам, он будет архивирован. Иначе будет удалён из базы вместе с файлами, на которые больше нет ссылок."
                : undefined
        }
        busy={removeBusy}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(null);
        }}
        onConfirm={() => {
          if (!removing) return;
          setRemoveBusy(true);
          const action =
            removing.kind === "intensive"
              ? deleteIntensive(removing.id)
              : removing.kind === "theory"
                ? deleteTheory(removing.id)
                : removing.kind === "test"
                  ? deleteHomework(removing.id)
                  : deleteTopic(removing.id);
          void Promise.resolve(action)
            .then(async (result) => {
              if (result?.ok === false) {
                toast.error(result.error ?? "Не удалось удалить");
                return;
              }
              await reload();
            })
            .catch((err: unknown) => {
              toast.error(
                err instanceof Error ? err.message : "Не удалось удалить"
              );
            })
            .finally(() => {
              setRemoveBusy(false);
              setRemoving(null);
            });
        }}
      />

      <TestEditorDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        homework={editingTest}
        folderId={testFolderId}
        teacherId={teacherId}
      />
    </div>
  );
}

/** @deprecated Используйте MaterialsSectionWorkspace с конкретным разделом. */
export function MaterialsLibraryWorkspace(props: { teacherId?: string }) {
  return <MaterialsSectionWorkspace section="topic" {...props} />;
}
