"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { MIXED_MATERIAL_KINDS } from "@/lib/folders/material-routes";
import { topicStatusLabel } from "@/lib/format";
import { isCatalogHomeworkPurpose } from "@/lib/homework/source-kind";
import { apiPlatform } from "@/lib/store/api-client";
import { useDemoStore } from "@/lib/store/demo-store";
import type { Homework, Topic, TopicStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Единый смешанный проводник материалов Кафедры:
 * папки + темы + тесты + теория + интенсивы в одном списке.
 */
export function MaterialsLibraryWorkspace({
  teacherId: teacherIdProp,
}: {
  teacherId?: string;
}) {
  const router = useRouter();
  const {
    data,
    topicsForTeacher,
    homeworksForTeacher,
    saveTopic,
    deleteTopic,
    deleteHomework,
    restoreHomework,
    reload,
  } = useDemoStore();
  const teacherId = teacherIdProp ?? data.currentTeacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);

  const [showArchived, setShowArchived] = useState(false);
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
  const [folderToSchoolBusy, setFolderToSchoolBusy] = useState<string | null>(null);

  const topics = topicsForTeacher(teacherId);
  const tests = homeworksForTeacher(teacherId);
  const archivedTests = data.homeworks.filter(
    (h) =>
      h.teacherId === teacherId &&
      h.status === "archived" &&
      isCatalogHomeworkPurpose(h.purpose)
  );

  function openCreateTopic(folderId: string | null = null) {
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Материалы"
        description="Единое файловое пространство: папки, темы, тесты, теория и интенсивы."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => openCreateTopic(null)}
            >
              Новая тема
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setEditingTest(null);
                setTestFolderId(null);
                setTestOpen(true);
              }}
            >
              Новый тест
            </Button>
            <Link
              href="/kafedra/theory/new"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}
            >
              Новая теория
            </Link>
            <Link
              href="/kafedra/intensivy/new"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}
            >
              Новый интенсив
            </Link>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={showArchived ? "outline" : "default"}
          onClick={() => setShowArchived(false)}
        >
          Материалы
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showArchived ? "default" : "outline"}
          onClick={() => setShowArchived(true)}
        >
          Архив
          {archivedTests.length > 0 ? (
            <span className="ml-1 text-xs opacity-80">({archivedTests.length})</span>
          ) : null}
        </Button>
      </div>

      <MaterialsFolderPanel
        kinds={MIXED_MATERIAL_KINDS}
        teacherId={teacherId}
        canEdit={!showArchived}
        showArchived={showArchived}
        onOpenMaterial={(kind, id) => {
          if (showArchived && kind === "test") {
            return;
          }
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
                        "Будет создана копия тем, тестов и теории (включая вложенные папки).",
                        intensiveNote ??
                          "Интенсивы в этой папке не найдены.",
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
                onClick={() => void deleteHomework(item.id)}
              >
                В архив
              </Button>
            );
          }
          if (item.kind === "topic" && !showArchived) {
            const topic = topics.find((t) => t.id === item.id);
            if (!topic) return null;
            return (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => openEditTopic(topic)}
              >
                Изменить
              </Button>
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

      <TestEditorDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        homework={editingTest}
        sectionId={testFolderId}
        teacherId={teacherId}
      />
    </div>
  );
}
