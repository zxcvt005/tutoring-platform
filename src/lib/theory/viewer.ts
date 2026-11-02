export const THEORY_LIST_HREF = "/auditoria/theory";

/** Компактный плеер: на телефоне на всю ширину колонки, на широком экране не растягивается. */
export const THEORY_PLAYER_SHELL_CLASS = "mx-auto w-full max-w-2xl";
export const THEORY_PLAYER_FRAME_CLASS =
  "relative aspect-video w-full overflow-hidden rounded-xl bg-black";
/** Кнопка «Досмотрел видео» использует стандартный Button, без отдельного цвета. */
export const THEORY_WATCHED_VIDEO_USES_DEFAULT_BUTTON = true;

export function studentTheoryVideoLayout(item: {
  videoUrl?: string | null;
  viewedAt?: string | null;
}): {
  hasVideo: boolean;
  showWatchedVideoButton: boolean;
  watchedButtonPlacement: "above-video";
} {
  const hasVideo = Boolean(item.videoUrl);
  return {
    hasVideo,
    showWatchedVideoButton: hasVideo && !item.viewedAt,
    watchedButtonPlacement: "above-video",
  };
}

export function claimTheoryAction(inflight: { current: boolean }): boolean {
  if (inflight.current) return false;
  inflight.current = true;
  return true;
}

export function releaseTheoryAction(inflight: { current: boolean }) {
  inflight.current = false;
}

/** После отметки просмотра ученик остаётся на странице этого пакета теории. */
export function afterTheoryVideoWatchSaved(saved: boolean): {
  leavePage: false;
  saved: boolean;
} {
  return { leavePage: false, saved };
}

export type TheoryStageId = "video" | "conspect" | "test";

/** Видео, затем конспект, затем мини-тест. Пустые этапы не попадают в список. */
export function theoryStageOrder(input: {
  hasVideo: boolean;
  hasFiles: boolean;
  hasTest: boolean;
}): TheoryStageId[] {
  const stages: TheoryStageId[] = [];
  if (input.hasVideo) stages.push("video");
  if (input.hasFiles) stages.push("conspect");
  if (input.hasTest) stages.push("test");
  return stages;
}

export function theoryStageNumber(
  stages: readonly TheoryStageId[],
  id: TheoryStageId
): string | null {
  const index = stages.indexOf(id);
  if (index < 0) return null;
  return String(index + 1).padStart(2, "0");
}

/** Клиент не завершает теорию с тестом: это делает только сервер по факту теста. */
export function videoWatchCompletesTheory(hasTest: boolean): boolean {
  return !hasTest;
}

export type TheoryTestGate =
  | "hidden"
  | "locked"
  | "preparing"
  | "ready"
  | "mark-to-start";

/** Доступ к тесту остаётся за viewedAt. Без видео подтверждение — прежняя кнопка «Пройти тест». */
export function theoryTestGate(input: {
  hasVideo: boolean;
  viewed: boolean;
  hasTest: boolean;
  testReady: boolean;
}): TheoryTestGate {
  if (!input.hasTest) return "hidden";
  if (input.hasVideo && !input.viewed) return "locked";
  if (!input.viewed) return "mark-to-start";
  if (!input.testReady) return "preparing";
  return "ready";
}

/** PDF открывается в браузере. DOC и DOCX браузер не показывает, для них остаётся скачивание. */
export function theoryFileOpenLabel(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "Открыть PDF";
  return null;
}

export function theoryFileSizeLabel(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${Math.trunc(bytes)} Б`;
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  const mb = bytes / (1024 * 1024);
  const text =
    mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(".", ",");
  return `${text} МБ`;
}
