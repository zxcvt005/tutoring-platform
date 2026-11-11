"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TestEditorDialog } from "@/components/tests/test-editor-dialog";
import { VideoEmbed } from "@/components/theory/video-embed";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  hasTheoryComponent,
  THEORY_NEED_COMPONENT_MESSAGE,
} from "@/lib/theory/components";
import { theoryFileKindLabel } from "@/lib/theory/file-sniff";
import { attachedTheoryTest } from "@/lib/theory/editor";
import { parseVideoLink } from "@/lib/theory/video";
import { useDemoStore } from "@/lib/store/demo-store";

export function TheoryEditor({
  materialId,
  libraryScope,
  listHref = "/kafedra/theory",
  editorBase = "/kafedra/theory",
  initialFolderId,
}: {
  materialId?: string;
  libraryScope?: "school" | "teacher";
  listHref?: string;
  editorBase?: string;
  initialFolderId?: string | null;
}) {
  const {
    data,
    upsertTheory,
    uploadTheoryFile,
    removeTheoryFile,
  } = useDemoStore();
  const router = useRouter();
  const existing = materialId
    ? data.theories.find((t) => t.id === materialId)
    : undefined;
  const scope = existing?.libraryScope ?? libraryScope ?? "teacher";
  const teacherId =
    scope === "school" ? "" : existing?.teacherId || data.currentTeacherId;
  const folderId = existing?.folderId ?? initialFolderId ?? null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? "");
  const [testId, setTestId] = useState(existing?.testId ?? "");
  const [id, setId] = useState(existing?.id);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const parsed = useMemo(
    () => (videoUrl.trim() ? parseVideoLink(videoUrl) : null),
    [videoUrl]
  );
  const attachedTest = attachedTheoryTest(data.homeworks, testId);
  const files = existing?.files ?? [];

  async function save(publish: boolean) {
    if (!title.trim()) {
      toast.error("Укажите название теории");
      return;
    }
    if (videoUrl.trim() && parsed && !parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    if (
      publish &&
      !hasTheoryComponent({
        videoUrl: parsed?.ok ? videoUrl : null,
        testId,
        fileCount: files.length,
      })
    ) {
      toast.error(THEORY_NEED_COMPONENT_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = await upsertTheory({
        id,
        teacherId,
        libraryScope: scope,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: videoUrl.trim() || null,
        testId: testId || null,
        publish,
        folderId: id ? undefined : folderId,
      });
      if (!result.ok) return;
      const nextId = result.id ?? id;
      if (publish) {
        // Только после подтверждённого ответа сервера — к списку теорий.
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
    if (!file) return;
    let currentId = id;
    if (!currentId) {
      if (!title.trim()) {
        toast.error("Сначала укажите название и сохраните черновик");
        return;
      }
      setBusy(true);
      const created = await upsertTheory({
        teacherId,
        libraryScope: scope,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: videoUrl.trim() || null,
        testId: testId || null,
        folderId,
      });
      setBusy(false);
      if (!created.ok || !created.id) return;
      currentId = created.id;
      setId(currentId);
      router.replace(`${editorBase}/${currentId}`);
    }
    await uploadTheoryFile(currentId, file);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={existing ? existing.title : "Новая теория"}
        description="Видео, конспект и тест независимы: нужен хотя бы один. Черновик не виден ученикам. После публикации изменения сохраняются новой версией."
        actions={
          <Link href={listHref} className={buttonVariants({ variant: "outline" })}>
            К списку
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Электрическое поле"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Кратко, о чём материал"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ссылка на видео (необязательно)</Label>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://vk.com/video-123_456, vkvideo.ru или код «Экспортировать»"
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
            <p className="text-sm font-medium">Тест (необязательно)</p>
            <p className="text-xs text-muted-foreground">
              Собственный тест этой теории. Из каталога домашних заданий выбрать
              нельзя. Результат не считается домашним заданием.
            </p>
            {attachedTest ? (
              <p className="text-sm">{attachedTest.title}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Тест ещё не создан.</p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTestOpen(true)}
            >
              {attachedTest ? "Редактировать тест" : "Создать тест"}
            </Button>
          </section>

          <section className="panel space-y-2 p-3">
            <p className="text-sm font-medium">Конспекты (необязательно)</p>
            <p className="text-xs text-muted-foreground">PDF, DOC, DOCX</p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                void onFile(file);
              }}
            />
            <ul className="space-y-1">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {file.originalName}{" "}
                    <span className="text-xs text-muted-foreground">
                      {theoryFileKindLabel(file.mimeType)}
                    </span>
                  </span>
                  {id ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => void removeTheoryFile(id, file.id)}
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void save(false)}
        >
          Сохранить черновик
        </Button>
        <Button type="button" disabled={busy} onClick={() => void save(true)}>
          {existing?.status === "published"
            ? "Сохранить и опубликовать изменения"
            : "Опубликовать"}
        </Button>
      </div>

      <TestEditorDialog
        teacherId={teacherId}
        libraryScope={scope}
        homework={attachedTest ?? null}
        open={testOpen}
        onOpenChange={setTestOpen}
        purpose="theory"
        onSaved={(hw) => {
          setTestId(hw.id);
          setTestOpen(false);
        }}
      />
    </div>
  );
}
