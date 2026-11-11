"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AssignmentReviewDialog } from "@/components/tests/assignment-review-dialog";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { VideoEmbed } from "@/components/theory/video-embed";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatDueAt } from "@/lib/format";
import {
  INTENSIVE_TEST_STATUS_LABEL,
  intensiveStudentLabel,
  intensiveTestRunStatus,
  moveIntensiveTest,
} from "@/lib/intensives/progress";
import { isOrgKnowledgeStaff } from "@/lib/auth/school-knowledge";
import { useDemoStore } from "@/lib/store/demo-store";
import { parseVideoLink } from "@/lib/theory/video";
import type { HomeworkAssignment, IntensiveAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IntensiveEditor({
  intensiveId,
  libraryScope,
  listHref = "/kafedra/intensivy",
  editorBase = "/kafedra/intensivy",
  initialFolderId,
}: {
  intensiveId?: string;
  libraryScope?: "school" | "teacher";
  listHref?: string;
  editorBase?: string;
  initialFolderId?: string | null;
}) {
  const {
    data,
    upsertIntensive,
    uploadIntensiveFile,
    removeIntensiveFile,
    deleteHomework,
  } = useDemoStore();
  const router = useRouter();
  const existing = intensiveId
    ? data.intensives.find((item) => item.id === intensiveId)
    : undefined;
  const scope = existing?.libraryScope ?? libraryScope ?? "teacher";
  const teacherId =
    scope === "school" ? "" : existing?.teacherId || data.currentTeacherId;
  const folderId = existing?.folderId ?? initialFolderId ?? null;
  const readOnly = scope === "school" && listHref.startsWith("/kafedra");

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? "");
  const [testIds, setTestIds] = useState(
    () => existing?.tests.map((test) => test.testId) ?? []
  );
  const [id, setId] = useState(existing?.id);
  const [busy, setBusy] = useState(false);
  const [testEditor, setTestEditor] = useState<string | null | undefined>(undefined);
  const [review, setReview] = useState<HomeworkAssignment | null>(null);

  const parsed = useMemo(
    () => (videoUrl.trim() ? parseVideoLink(videoUrl) : null),
    [videoUrl]
  );
  const files = existing?.files ?? [];
  const attached = testIds.map((testId) => ({
    testId,
    title:
      data.homeworks.find((item) => item.id === testId)?.title ??
      existing?.tests.find((item) => item.testId === testId)?.title ??
      "Тест",
  }));
  const editingTest =
    testEditor && testEditor.length > 0
      ? (data.homeworks.find((item) => item.id === testEditor) ?? null)
      : null;

  async function ensureSavedDraft() {
    if (id) return id;
    if (!title.trim()) {
      toast.error("Сначала укажите название интенсива");
      return null;
    }
    if (videoUrl.trim() && parsed && !parsed.ok) {
      toast.error(parsed.error);
      return null;
    }
    setBusy(true);
    const created = await upsertIntensive({
      teacherId,
      libraryScope: scope,
      title: title.trim(),
      description: description.trim() || null,
      videoUrl: videoUrl.trim() || null,
      testIds,
      folderId,
    });
    setBusy(false);
    if (!created.ok || !created.id) return null;
    setId(created.id);
    return created.id;
  }

  async function persistTests(next: string[], currentId = id) {
    setTestIds(next);
    if (!currentId) return false;
    const result = await upsertIntensive({
      id: currentId,
      teacherId,
      libraryScope: scope,
      title: title.trim(),
      description: description.trim() || null,
      videoUrl: videoUrl.trim() || null,
      testIds: next,
    });
    return result.ok;
  }

  async function save(publish: boolean) {
    if (readOnly) return;
    if (!title.trim()) {
      toast.error("Укажите название интенсива");
      return;
    }
    if (videoUrl.trim() && parsed && !parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    if (publish && !videoUrl.trim() && files.length === 0 && testIds.length === 0) {
      toast.error("Добавьте видео, конспект или хотя бы один тест");
      return;
    }
    setBusy(true);
    try {
      const result = await upsertIntensive({
        id,
        teacherId,
        libraryScope: scope,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: videoUrl.trim() || null,
        testIds,
        publish,
        folderId: id ? undefined : folderId,
      });
      if (!result.ok) return;
      const nextId = result.id ?? id;
      if (publish) {
        router.push(listHref);
        return;
      }
      if (nextId && !id) {
        setId(nextId);
        router.replace(`${editorBase}/${nextId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (readOnly || !file) return;
    let currentId = id;
    if (!currentId) {
      if (!title.trim()) {
        toast.error("Сначала укажите название и сохраните черновик");
        return;
      }
      setBusy(true);
      const created = await upsertIntensive({
        teacherId,
        libraryScope: scope,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: videoUrl.trim() || null,
        testIds,
        folderId,
      });
      setBusy(false);
      if (!created.ok || !created.id) return;
      currentId = created.id;
      setId(currentId);
      router.replace(`${editorBase}/${currentId}`);
    }
    await uploadIntensiveFile(currentId, file);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={existing ? existing.title : "Новый интенсив"}
        description="Видеозапись, PDF-конспект и любое число тестов. Ученик получает версию, которая была опубликована на момент отправки."
        actions={
          <Link href={listHref} className={buttonVariants({ variant: "outline" })}>
            К списку
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              value={title}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: Интенсив по механике"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea
              value={description}
              disabled={readOnly}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="О чём трансляция и что разобрать по тестам"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Видеозапись трансляции</Label>
            <Input
              value={videoUrl}
              disabled={readOnly}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://vk.com/video-123_456 или ссылка YouTube / Rutube"
            />
            {parsed && !parsed.ok ? (
              <p className="text-xs text-destructive">{parsed.error}</p>
            ) : null}
            {parsed?.ok ? (
              <VideoEmbed
                embedUrl={parsed.embedUrl}
                embedAllowed={parsed.embedAllowed}
                watchUrl={parsed.watchUrl}
                provider={parsed.provider}
                warning={parsed.warning}
              />
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="panel space-y-2 p-3">
            <p className="text-sm font-medium">Тесты</p>
            <p className="text-xs text-muted-foreground">
              Тесты создаются внутри интенсива и не попадают в общий банк.
            </p>
            {readOnly ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const currentId = await ensureSavedDraft();
                    if (!currentId) return;
                    setTestEditor(null);
                  })();
                }}
              >
                Создать тест
              </Button>
            )}
            {attached.length === 0 ? (
              <p className="text-xs text-muted-foreground">Тесты пока не прикреплены.</p>
            ) : (
              <ol className="space-y-1">
                {attached.map((test, index) => (
                  <li
                    key={test.testId}
                    className="flex items-center gap-1 rounded-lg bg-muted/40 px-2 py-1"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{test.title}</span>
                    {readOnly ? null : (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setTestEditor(test.testId)}
                        >
                          Изменить
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={index === 0 || busy}
                          onClick={() =>
                            void persistTests(moveIntensiveTest(testIds, index, -1))
                          }
                        >
                          Выше
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={index === attached.length - 1 || busy}
                          onClick={() =>
                            void persistTests(moveIntensiveTest(testIds, index, 1))
                          }
                        >
                          Ниже
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              const next = testIds.filter((item) => item !== test.testId);
                              const ok = await persistTests(next);
                              if (ok) await deleteHomework(test.testId);
                            })();
                          }}
                        >
                          Удалить
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel space-y-2 p-3">
            <p className="text-sm font-medium">Конспект</p>
            <p className="text-xs text-muted-foreground">Один PDF</p>
            {readOnly ? null : (
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  void onFile(file);
                }}
              />
            )}
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{file.originalName}</span>
                  {id && !readOnly ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => void removeIntensiveFile(id, file.id)}
                    >
                      Убрать
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {existing ? (
        <AssignedTests
          intensiveId={existing.id}
          onReview={setReview}
        />
      ) : null}
      <AssignmentReviewDialog
        assignment={review}
        open={review != null}
        onOpenChange={(next) => {
          if (!next) setReview(null);
        }}
      />
      <TestEditorDialog
        teacherId={teacherId}
        libraryScope={scope}
        homework={editingTest}
        open={testEditor !== undefined}
        purpose="intensive"
        onOpenChange={(next) => {
          if (!next) setTestEditor(undefined);
        }}
        onSaved={(hw) => {
          const currentId = id;
          const next = testIds.includes(hw.id) ? testIds : [...testIds, hw.id];
          void (async () => {
            await persistTests(next, currentId);
            if (!intensiveId && currentId) {
              router.replace(`${editorBase}/${currentId}`);
            }
            setTestEditor(undefined);
          })();
        }}
      />

      {readOnly ? (
        <p className={cn("text-sm text-muted-foreground")}>
          Это общий интенсив базы знаний. Его можно отправить своим ученикам без копии.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
            Сохранить черновик
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save(true)}>
            {existing?.status === "published"
              ? "Сохранить и опубликовать изменения"
              : "Опубликовать"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AssignedTests({
  intensiveId,
  onReview,
}: {
  intensiveId: string;
  onReview: (assignment: HomeworkAssignment) => void;
}) {
  const { auth, data } = useDemoStore();
  const [selected, setSelected] = useState<IntensiveAssignment | null>(null);
  const rows = data.intensiveAssignments.filter((item) => {
    if (item.intensiveId !== intensiveId) return false;
    if (auth?.role && isOrgKnowledgeStaff(auth.role)) return true;
    return item.teacherId === data.currentTeacherId;
  });
  const current = selected
    ? (rows.find((item) => item.id === selected.id) ?? selected)
    : null;
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Ученики</h2>
      <ul className="space-y-2">
        {rows.map((row) => {
          const student = data.students.find((item) => item.id === row.studentId);
          const summary = intensiveStudentLabel(row.tests);
          return (
            <li key={row.id}>
              <button
                type="button"
                className="panel flex w-full flex-wrap items-center gap-3 p-3 text-left text-sm"
                onClick={() => setSelected(row)}
              >
                <span className="min-w-0 flex-1 font-medium">
                  {student?.fullName ?? "Ученик"}
                </span>
                <span className="text-muted-foreground">
                  {summary.total === 0
                    ? summary.label
                    : `${summary.done} из ${summary.total} тестов`}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    summary.label === "Готово"
                      ? "bg-pastel-mint"
                      : "bg-pastel-beige"
                  )}
                >
                  {summary.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog open={current != null} onOpenChange={(next) => !next && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {data.students.find((item) => item.id === current?.studentId)?.fullName ??
                "Ученик"}
            </DialogTitle>
          </DialogHeader>
          {current && current.tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">В этой версии нет тестов.</p>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
              {current?.tests.map((test) => {
                const run = intensiveTestRunStatus(test);
                const assignment = data.homeworkAssignments.find(
                  (item) => item.id === test.testAssignmentId
                );
                const result =
                  test.score != null
                    ? `${test.score} из ${test.maxScore ?? "—"}`
                    : test.status === "completed"
                      ? "Ожидает проверки"
                      : "—";
                return (
                  <li key={test.testAssignmentId} className="rounded-xl border border-border/70 p-3 text-sm">
                    <p className="font-medium">{test.title}</p>
                    <p className="mt-1 text-muted-foreground">
                      Дедлайн · {formatDueAt(test.dueAt)}
                    </p>
                    <p className="text-muted-foreground">
                      Статус · {INTENSIVE_TEST_STATUS_LABEL[run]}
                    </p>
                    <p className="text-muted-foreground">Результат · {result}</p>
                    <p className="text-muted-foreground">
                      Дата выполнения ·{" "}
                      {test.completedAt ? formatDateTime(test.completedAt) : "—"}
                    </p>
                    {assignment && (test.status === "completed" || test.status === "reviewed") ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="mt-2"
                        onClick={() => onReview(assignment)}
                      >
                        Проверка
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
