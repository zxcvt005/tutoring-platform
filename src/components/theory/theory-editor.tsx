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
import { theoryFileKindLabel } from "@/lib/theory/file-sniff";
import { parseVideoLink } from "@/lib/theory/video";
import { useDemoStore } from "@/lib/store/demo-store";

export function TheoryEditor({ materialId }: { materialId?: string }) {
  const {
    data,
    upsertTheory,
    uploadTheoryFile,
    removeTheoryFile,
    theoriesForTeacher,
  } = useDemoStore();
  const router = useRouter();
  const existing = materialId
    ? theoriesForTeacher(data.currentTeacherId).find((t) => t.id === materialId)
    : undefined;

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
  const tests = data.homeworks.filter(
    (h) =>
      h.teacherId === data.currentTeacherId &&
      (h.status === "published" || h.id === testId)
  );
  const attachedTest = data.homeworks.find((h) => h.id === testId);
  const files = existing?.files ?? [];

  async function save(publish: boolean) {
    if (!title.trim()) {
      toast.error("Укажите название теории");
      return;
    }
    if (publish && (!parsed || !parsed.ok)) {
      toast.error(
        parsed && !parsed.ok ? parsed.error : "Для публикации нужна ссылка на видео"
      );
      return;
    }
    setBusy(true);
    const result = await upsertTheory({
      id,
      teacherId: data.currentTeacherId,
      title: title.trim(),
      description: description.trim() || null,
      videoUrl: videoUrl.trim() || null,
      testId: testId || null,
      publish,
    });
    setBusy(false);
    if (!result.ok) return;
    const nextId = result.id ?? id;
    if (nextId && !id) {
      setId(nextId);
      router.replace(`/kafedra/theory/${nextId}`);
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
        teacherId: data.currentTeacherId,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: videoUrl.trim() || null,
        testId: testId || null,
      });
      setBusy(false);
      if (!created.ok || !created.id) return;
      currentId = created.id;
      setId(currentId);
      router.replace(`/kafedra/theory/${currentId}`);
    }
    await uploadTheoryFile(currentId, file);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={existing ? existing.title : "Новая теория"}
        description="Черновик не виден ученикам. После публикации изменения сохраняются новой версией — уже отправленные материалы не теряют историю."
        actions={
          <Link href="/kafedra/theory" className={buttonVariants({ variant: "outline" })}>
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
              placeholder="Кратко, о чём ролик"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ссылка на видео</Label>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://vk.com/video-123_456 или код экспорта"
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
            <p className="text-sm font-medium">Тест</p>
            <p className="text-xs text-muted-foreground">
              Необязательно. Используется тот же конструктор, что и для ДЗ, но
              результат не считается домашним заданием.
            </p>
            <select
              className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
            >
              <option value="">Без теста</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.status !== "published" ? " (черновик)" : ""}
                </option>
              ))}
            </select>
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
            <p className="text-sm font-medium">Конспекты</p>
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
        teacherId={data.currentTeacherId}
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
