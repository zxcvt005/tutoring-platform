"use client";

import Link from "next/link";
import { Download, FileText } from "lucide-react";

import { HomeworkAssignmentStatusBadge } from "@/components/status-badge";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { VideoEmbed } from "@/components/theory/video-embed";
import { formatDueAt } from "@/lib/format";
import { studentLearningLock } from "@/lib/learning-lock";
import { theoryFileKindLabel } from "@/lib/theory/file-sniff";
import { useDemoStore } from "@/lib/store/demo-store";

export function StudentIntensiveViewer({ assignmentId }: { assignmentId: string }) {
  const { data, intensiveAssignmentsForStudent } = useDemoStore();
  const item = intensiveAssignmentsForStudent(data.currentStudentId).find(
    (row) => row.id === assignmentId
  );

  if (!item) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-auditoria-surface p-4">
        <p className="text-sm">Интенсив не найден или назначен другому ученику.</p>
        <Link href="/auditoria/intensivy" className="text-sm underline">
          К списку
        </Link>
      </div>
    );
  }

  const learning = studentLearningLock(
    data.tariffAssignments,
    data.currentStudentId
  );
  if (learning.locked) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-auditoria-surface p-4">
        <h1 className="font-display text-xl font-semibold">{item.title}</h1>
        <LearningLockedBanner message={learning.message} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        <Link href="/auditoria/intensivy" className="hover:underline">
          Интенсивы
        </Link>
      </p>
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {item.title}
        </h1>
        {item.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{item.description}</p>
        ) : null}
      </header>

      {item.videoUrl ? (
        <VideoEmbed
          embedUrl={item.videoEmbedUrl}
          embedAllowed={item.embedAllowed}
          watchUrl={item.videoUrl}
          provider={item.videoProvider ?? "unknown"}
          warning={item.videoWarning}
        />
      ) : null}

      {item.files.length > 0 ? (
        <section className="auditoria-home-card space-y-2">
          <h2 className="font-medium">Конспект</h2>
          <ul className="space-y-2">
            {item.files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-2 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {file.originalName}{" "}
                  <span className="text-xs text-muted-foreground">
                    {theoryFileKindLabel(file.mimeType)}
                  </span>
                </span>
                <a
                  href={`/api/intensives/files/${file.id}`}
                  className="text-sm underline"
                >
                  Открыть
                </a>
                <a
                  href={`/api/intensives/files/${file.id}?download=1`}
                  className="inline-flex items-center gap-1 text-sm underline"
                >
                  <Download className="size-3.5" />
                  Скачать
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">Тесты</h2>
        {item.tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">К этому интенсиву тесты не прикреплены.</p>
        ) : (
          <ul className="space-y-2">
            {item.tests.map((test) => (
              <li key={test.testAssignmentId} className="auditoria-home-card flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{test.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Дедлайн · {formatDueAt(test.dueAt)}
                  </p>
                </div>
                <HomeworkAssignmentStatusBadge status={test.status} />
                <Link
                  href={`/auditoria/intensivy/${item.id}/test/${test.testAssignmentId}`}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-auditoria-surface px-3 text-sm"
                >
                  Открыть
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
