"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, FileText, Lock } from "lucide-react";

import { HomeworkTake } from "@/components/homework/homework-take";
import { VideoEmbed } from "@/components/theory/video-embed";
import { TheoryAssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { theoryFileKindLabel } from "@/lib/theory/file-sniff";
import {
  studentTheorySection,
  theoryQuestionCountLabel,
} from "@/lib/theory/list";
import {
  afterTheoryVideoWatchSaved,
  claimTheoryAction,
  releaseTheoryAction,
  studentTheoryVideoLayout,
  theoryFileOpenLabel,
  theoryFileSizeLabel,
  theoryStageNumber,
  theoryStageOrder,
  theoryTestGate,
  type TheoryStageId,
} from "@/lib/theory/viewer";
import { LearningLockedBanner } from "@/components/tariff-balance-notice";
import { studentLearningLock } from "@/lib/learning-lock";
import { useDemoStore } from "@/lib/store/demo-store";

export function StudentTheoryViewer({ assignmentId }: { assignmentId: string }) {
  const { data, theoryAssignmentsForStudent, markTheoryViewed } = useDemoStore();
  const item = theoryAssignmentsForStudent(data.currentStudentId).find(
    (a) => a.id === assignmentId
  );
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const inflight = useRef(false);

  if (!item) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/70 bg-auditoria-surface p-4">
        <p className="text-sm">Теория не найдена или назначена другому ученику.</p>
        <Link
          href="/auditoria/theory"
          className="inline-flex h-8 items-center rounded-full border border-border bg-auditoria-surface px-3 text-sm"
        >
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
        <p className="text-xs text-muted-foreground">
          <Link href="/auditoria/theory" className="hover:underline">
            Теория
          </Link>
        </p>
        <h1 className="font-display text-xl font-semibold">{item.title}</h1>
        <LearningLockedBanner message={learning.message} />
      </div>
    );
  }

  const layout = studentTheoryVideoLayout(item);
  const hasFiles = item.files.length > 0;
  const viewed = Boolean(item.viewedAt);
  const testReady = Boolean(item.testAssignmentId);
  const testGate = theoryTestGate({
    hasVideo: layout.hasVideo,
    viewed,
    hasTest: item.hasTest,
    testReady,
  });
  const canTakeTest = testGate === "ready";
  const completed = item.status === "completed";
  const linkedTest = data.homeworkAssignments.find(
    (row) => row.id === item.testAssignmentId
  );
  const questionLabel = theoryQuestionCountLabel(
    linkedTest?.testSnapshot?.questions.length ?? 0
  );
  const isNew = studentTheorySection(item.status) === "new";

  async function markVideoWatched() {
    const current = item;
    if (!current) return;
    if (!claimTheoryAction(inflight)) return;
    setBusy(true);
    try {
      const result = await markTheoryViewed(current.id);
      afterTheoryVideoWatchSaved(result.ok);
    } finally {
      releaseTheoryAction(inflight);
      setBusy(false);
    }
  }

  async function markProgress() {
    const current = item;
    if (!current) return;
    if (!claimTheoryAction(inflight)) return;
    setBusy(true);
    try {
      const result = await markTheoryViewed(current.id);
      if (result.ok && current.hasTest) setShowTest(true);
    } finally {
      releaseTheoryAction(inflight);
      setBusy(false);
    }
  }

  const showHomework =
    canTakeTest && (showTest || completed || item.status === "awaiting_review");
  const stages = theoryStageOrder({
    hasVideo: layout.hasVideo,
    hasFiles,
    hasTest: testGate !== "hidden",
  });
  const stageNo = (id: TheoryStageId) => theoryStageNumber(stages, id);

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <section className="auditoria-home-card">
        <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/auditoria/theory" className="hover:underline">
            Теория
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {item.title}
          </h1>
          {isNew ? (
            <span className="rounded-full border border-black/10 bg-auditoria-surface px-2.5 py-1 text-xs">
              Новая
            </span>
          ) : (
            <TheoryAssignmentStatusBadge status={item.status} />
          )}
        </div>
        {item.description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/80 sm:text-base">
            {item.description}
          </p>
        ) : null}
      </section>

      {layout.hasVideo ? (
        <section className="auditoria-home-card grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:items-center">
          <div>
            <StageIndex>{stageNo("video")}</StageIndex>
            <h2 className="mt-3 font-display text-xl font-semibold">Видеоурок</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Посмотрите видео, чтобы изучить основной материал темы.
            </p>
            <p
              className={
                viewed
                  ? "mt-4 inline-flex rounded-full bg-pastel-mint/80 px-3 py-1 text-sm text-foreground"
                  : "mt-4 inline-flex rounded-full bg-pastel-rose/80 px-3 py-1 text-sm text-foreground"
              }
            >
              {viewed ? "Просмотрено" : "Не просмотрено"}
            </p>
          </div>
          <div className="min-w-0 space-y-3">
            {layout.showWatchedVideoButton ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void markVideoWatched()}
              >
                {busy ? "Сохранение…" : "Досмотрел видео"}
              </Button>
            ) : null}
            <VideoEmbed
              embedUrl={item.videoEmbedUrl}
              embedAllowed={item.embedAllowed}
              watchUrl={item.videoUrl}
              provider={item.videoProvider}
              warning={item.videoWarning}
            />
          </div>
        </section>
      ) : null}

      {hasFiles ? (
        <section className="auditoria-home-card grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:items-start">
          <div>
            <StageIndex>{stageNo("conspect")}</StageIndex>
            <h2 className="mt-3 font-display text-xl font-semibold">Конспект</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Материалы по теме в удобном формате.
            </p>
          </div>
          <ul className="min-w-0 space-y-2">
            {item.files.map((file) => {
              const openLabel = theoryFileOpenLabel(file.mimeType);
              const size = theoryFileSizeLabel(file.sizeBytes);
              const word =
                file.mimeType === "application/msword" ||
                file.mimeType ===
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
              return (
                <li
                  key={file.id}
                  className="flex min-w-0 flex-col gap-3 rounded-2xl border border-black/10 bg-auditoria-surface px-3 py-3 sm:flex-row sm:items-center"
                >
                  <span
                    className={
                      word
                        ? "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-pastel-blue/70"
                        : "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-pastel-beige/80"
                    }
                  >
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{file.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {theoryFileKindLabel(file.mimeType)}
                      {size ? ` · ${size}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {openLabel ? (
                      <a
                        href={`/api/theory/files/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center rounded-full bg-pastel-blue/80 px-3 text-sm"
                      >
                        {openLabel}
                      </a>
                    ) : null}
                    <a
                      href={`/api/theory/files/${file.id}?download=1`}
                      className="inline-flex h-10 items-center gap-1 rounded-full border border-black/10 bg-auditoria-surface px-3 text-sm"
                    >
                      <Download className="size-3.5" />
                      Скачать
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!layout.hasVideo && !viewed && !item.hasTest ? (
        <section className="auditoria-home-card">
          <Button type="button" disabled={busy} onClick={() => void markProgress()}>
            {busy ? "Сохранение…" : "Отметить изученным"}
          </Button>
        </section>
      ) : null}

      {testGate !== "hidden" ? (
        <section className="auditoria-home-card grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:items-center">
          <div>
            <StageIndex>{stageNo("test")}</StageIndex>
            <h2 className="mt-3 font-display text-xl font-semibold">Проверьте себя</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Небольшой тест поможет закрепить материал.
            </p>
            {questionLabel ? (
              <p className="mt-3 text-sm text-muted-foreground">{questionLabel}</p>
            ) : null}
          </div>
          <div className="min-w-0">
            {testGate === "locked" ? (
              <div className="rounded-2xl border border-black/10 bg-pastel-blue/55 px-4 py-4">
                <p className="flex items-center gap-2 font-medium">
                  <Lock className="size-4" />
                  Сначала посмотрите видео
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Тест станет доступен после подтверждения просмотра.
                </p>
              </div>
            ) : null}
            {testGate === "preparing" ? (
              <p className="text-sm text-muted-foreground">
                Готовим тест… обновите страницу.
              </p>
            ) : null}
            {testGate === "mark-to-start" ? (
              <Button type="button" disabled={busy} onClick={() => void markProgress()}>
                {busy ? "Сохранение…" : "Начать мини-тест →"}
              </Button>
            ) : null}
            {testGate === "ready" &&
            !showTest &&
            !completed &&
            item.status !== "awaiting_review" ? (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-full bg-pastel-blue/80 px-5 text-sm text-foreground"
                onClick={() => setShowTest(true)}
              >
                {item.status === "in_progress"
                  ? "Продолжить тест"
                  : "Начать мини-тест →"}
              </button>
            ) : null}
            {showHomework ? (
              <p className="text-sm text-muted-foreground">Тест открыт ниже.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showHomework ? (
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

function StageIndex({ children }: { children: string | null }) {
  return (
    <span className="inline-flex rounded-xl bg-pastel-blue/70 px-2.5 py-1 font-display text-sm font-semibold">
      {children}
    </span>
  );
}
