"use client";

import Link from "next/link";
import { useState } from "react";

import { HomeworkTake } from "@/components/homework/homework-take";
import { VideoEmbed } from "@/components/theory/video-embed";
import { TheoryAssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { theoryFileKindLabel } from "@/lib/theory/file-sniff";
import { useDemoStore } from "@/lib/store/demo-store";

export function StudentTheoryViewer({ assignmentId }: { assignmentId: string }) {
  const { data, theoryAssignmentsForStudent, markTheoryViewed } = useDemoStore();
  const item = theoryAssignmentsForStudent(data.currentStudentId).find(
    (a) => a.id === assignmentId
  );
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);

  if (!item) {
    return (
      <div className="space-y-3">
        <p className="text-sm">Теория не найдена или назначена другому ученику.</p>
        <Link
          href="/auditoria/theory"
          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm"
        >
          К списку
        </Link>
      </div>
    );
  }

  const viewed = Boolean(item.viewedAt);
  const testReady = Boolean(item.testAssignmentId);
  const canTakeTest = viewed && item.hasTest && testReady;
  const completed = item.status === "completed";

  async function markWatched() {
    const current = item;
    if (!current) return;
    setBusy(true);
    const result = await markTheoryViewed(current.id);
    setBusy(false);
    if (result.ok && current.hasTest) setShowTest(true);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/auditoria/theory" className="hover:underline">
            Теория
          </Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold">{item.title}</h1>
          <TheoryAssignmentStatusBadge status={item.status} />
        </div>
        {item.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        ) : null}
      </div>

      <VideoEmbed
        embedUrl={item.videoEmbedUrl}
        embedAllowed={item.embedAllowed}
        watchUrl={item.videoUrl}
        provider={item.videoProvider}
        warning={item.videoWarning}
      />

      {!viewed ? (
        <Button type="button" disabled={busy} onClick={() => void markWatched()}>
          {busy ? "Сохранение…" : "Досмотрел ролик"}
        </Button>
      ) : !item.hasTest ? (
        <p className="text-sm text-muted-foreground">
          Просмотр отмечен. Можно вернуться к видео и файлам в любой момент.
        </p>
      ) : item.status === "in_progress" || item.status === "viewed" ? (
        <p className="text-sm">
          Просмотр отмечен. Чтобы завершить теорию, пройдите тест.
        </p>
      ) : null}

      {item.files.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Конспекты</h2>
          <ul className="space-y-1">
            {item.files.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/theory/files/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline"
                >
                  {file.originalName}{" "}
                  <span className="text-muted-foreground">
                    ({theoryFileKindLabel(file.mimeType)})
                  </span>
                </a>
                {" · "}
                <a
                  href={`/api/theory/files/${file.id}?download=1`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Скачать
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.hasTest && viewed && !canTakeTest ? (
        <p className="text-sm text-muted-foreground">Готовим тест… обновите страницу.</p>
      ) : null}

      {canTakeTest && !showTest && !completed ? (
        <Button type="button" onClick={() => setShowTest(true)}>
          {item.status === "in_progress" ? "Продолжить тест" : "Пройти тест"}
        </Button>
      ) : null}

      {canTakeTest && (showTest || completed || item.status === "awaiting_review") ? (
        <HomeworkTake
          assignmentId={item.testAssignmentId!}
          backHref={`/auditoria/theory/${item.id}`}
          backLabel="К теории"
          takeBasePath={`/auditoria/theory/${item.id}`}
        />
      ) : null}
    </div>
  );
}
