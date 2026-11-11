/**
 * Crash-surviving breadcrumbs for virtual background.
 * Tab/GPU death kills JS before console logs flush — localStorage persists across reload.
 * No video frames, PII, secrets, or object keys.
 */

import {
  recordCameraBackgroundDiag,
  summarizeCameraBackgroundPerf,
  type CameraBackgroundDiagEvent,
} from "@/lib/video/camera-background";

export const CAMERA_BACKGROUND_STAGE_STORAGE_KEY =
  "neodin.camera-bg.stages.v1";

export type CameraBackgroundStage =
  | "camera_acquired"
  | "webgl_probed"
  | "processor_created"
  | "mediapipe_initialized"
  | "first_frame_processed"
  | "processor_attached"
  | "track_published"
  | "processor_disposed"
  | "apply_aborted"
  | "crash_pending";

export type CameraBackgroundStageRecord = {
  t: number;
  stage: CameraBackgroundStage;
  detail?: string;
  activeProcessors?: number;
  segmentersCreated?: number;
  segmentersDestroyed?: number;
  reinits?: number;
  webglFloatOk?: boolean;
  modernApi?: boolean;
};

export type CameraBackgroundStageSnapshot = {
  runId: string;
  startedAt: number;
  updatedAt: number;
  completed: boolean;
  crashedLikely: boolean;
  stages: CameraBackgroundStageRecord[];
};

const MAX_STAGES = 64;

let activeProcessors = 0;
let segmentersCreated = 0;
let segmentersDestroyed = 0;
let reinits = 0;
let currentRun: CameraBackgroundStageSnapshot | null = null;

/** Test-only reset of in-memory counters and current run. */
export function resetCameraBackgroundStageStateForTests() {
  activeProcessors = 0;
  segmentersCreated = 0;
  segmentersDestroyed = 0;
  reinits = 0;
  currentRun = null;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function newRunId(): string {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function persist(snapshot: CameraBackgroundStageSnapshot) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(CAMERA_BACKGROUND_STAGE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function getCameraBackgroundLifecycleCounters() {
  return {
    activeProcessors,
    segmentersCreated,
    segmentersDestroyed,
    reinits,
  };
}

export function noteCameraBackgroundProcessorActive(delta: 1 | -1) {
  activeProcessors = Math.max(0, activeProcessors + delta);
}

export function noteCameraBackgroundSegmenterCreated() {
  segmentersCreated += 1;
}

export function noteCameraBackgroundSegmenterDestroyed() {
  segmentersDestroyed += 1;
}

export function noteCameraBackgroundReinit() {
  reinits += 1;
}

export function beginCameraBackgroundStageRun(detail?: string): string {
  const runId = newRunId();
  currentRun = {
    runId,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completed: false,
    crashedLikely: true,
    stages: [],
  };
  markCameraBackgroundStage("crash_pending", detail ?? "run_start");
  return runId;
}

export function markCameraBackgroundStage(
  stage: CameraBackgroundStage,
  detail?: string,
  extra?: Partial<
    Pick<
      CameraBackgroundStageRecord,
      "webglFloatOk" | "modernApi"
    >
  >
): CameraBackgroundStageRecord {
  if (!currentRun) {
    beginCameraBackgroundStageRun("implicit");
  }
  const record: CameraBackgroundStageRecord = {
    t: Date.now(),
    stage,
    detail: detail?.slice(0, 80),
    activeProcessors,
    segmentersCreated,
    segmentersDestroyed,
    reinits,
    ...extra,
  };
  const run = currentRun!;
  run.stages =
    run.stages.length >= MAX_STAGES
      ? [...run.stages.slice(1 - MAX_STAGES), record]
      : [...run.stages, record];
  run.updatedAt = record.t;
  if (stage === "processor_disposed" || stage === "apply_aborted") {
    run.completed = true;
    run.crashedLikely = false;
  }
  if (stage === "first_frame_processed" || stage === "processor_attached") {
    // Still may crash later; keep crashedLikely until disposed.
    run.crashedLikely = true;
  }
  persist(run);
  recordCameraBackgroundDiag({
    type: "stage",
    detail: `${stage}${detail ? `:${detail}` : ""}`,
  });
  return record;
}

export function completeCameraBackgroundStageRun(reason: string) {
  markCameraBackgroundStage("processor_disposed", reason);
  if (currentRun) {
    currentRun.completed = true;
    currentRun.crashedLikely = false;
    persist(currentRun);
  }
  currentRun = null;
}

export function abortCameraBackgroundStageRun(reason: string) {
  markCameraBackgroundStage("apply_aborted", reason);
  if (currentRun) {
    currentRun.completed = true;
    currentRun.crashedLikely = false;
    persist(currentRun);
  }
  currentRun = null;
}

export function readCameraBackgroundStageSnapshot(): CameraBackgroundStageSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CAMERA_BACKGROUND_STAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CameraBackgroundStageSnapshot;
    if (!parsed || !Array.isArray(parsed.stages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** After a hard tab crash, previous run stays completed=false / crashedLikely=true. */
export function consumeCameraBackgroundCrashReport(): CameraBackgroundStageSnapshot | null {
  const snap = readCameraBackgroundStageSnapshot();
  if (!snap || snap.completed || !snap.crashedLikely) return null;
  const store = storage();
  try {
    store?.removeItem(CAMERA_BACKGROUND_STAGE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return snap;
}

export function lastCameraBackgroundStage(
  snap: CameraBackgroundStageSnapshot | null | undefined
): CameraBackgroundStage | null {
  if (!snap?.stages.length) return null;
  return snap.stages[snap.stages.length - 1]?.stage ?? null;
}

export function summarizeCameraBackgroundCrash(
  snap: CameraBackgroundStageSnapshot
): string {
  const last = lastCameraBackgroundStage(snap) ?? "unknown";
  return `Последний этап до сбоя вкладки: ${last}`;
}

export function cameraBackgroundDiagToPayload(
  events: readonly CameraBackgroundDiagEvent[],
  snap: CameraBackgroundStageSnapshot | null
) {
  return {
    events: events.slice(-24).map((e) => ({
      type: e.type,
      detail: e.detail?.slice(0, 80),
      ms: e.ms,
      delegate: e.delegate,
      t: e.t,
    })),
    snapshot: snap
      ? {
          runId: snap.runId,
          completed: snap.completed,
          crashedLikely: snap.crashedLikely,
          lastStage: lastCameraBackgroundStage(snap),
          stages: snap.stages.slice(-24),
        }
      : null,
    counters: getCameraBackgroundLifecycleCounters(),
    perf: summarizeCameraBackgroundPerf(),
  };
}
