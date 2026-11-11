export type CameraBackgroundChoice =
  | { type: "off" }
  | { type: "blur" }
  | { type: "image"; id: string };

export type CameraBackgroundImage = {
  id: string;
  src: string;
  label: string;
};

export type CameraBackgroundDelegate = "GPU" | "CPU";

/**
 * Готовые кадры: JPEG ~960px (~80–150 KB) для быстрой загрузки в звонке.
 * Полные PNG остаются в каталоге как исходники редактирования.
 */
export const CAMERA_BACKGROUND_IMAGES: readonly CameraBackgroundImage[] = [
  {
    id: "background1",
    src: "/images/video/backgrounds/background1.jpg",
    label: "Фон 1",
  },
  {
    id: "background2",
    src: "/images/video/backgrounds/background2.jpg",
    label: "Фон 2",
  },
  {
    id: "background3",
    src: "/images/video/backgrounds/background3.jpg",
    label: "Фон 3",
  },
  {
    id: "background4",
    src: "/images/video/backgrounds/background4.jpg",
    label: "Фон 4",
  },
  {
    id: "background5",
    src: "/images/video/backgrounds/background5.jpg",
    label: "Фон 5",
  },
  {
    id: "background6",
    src: "/images/video/backgrounds/background6.jpg",
    label: "Фон 6",
  },
  {
    id: "background7",
    src: "/images/video/backgrounds/background7.jpg",
    label: "Фон 7",
  },
];

/** Prefetch WASM/model + first background so enabling FX is faster. */
export function prefetchCameraBackgroundAssets(
  urls: readonly string[] = [
    ...CAMERA_BACKGROUND_REQUIRED_ASSET_URLS,
    CAMERA_BACKGROUND_IMAGES[0]?.src ?? "",
  ].filter(Boolean)
): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    try {
      void fetch(url, { method: "GET", credentials: "same-origin", cache: "force-cache" });
    } catch {
      /* ignore */
    }
  }
}

export const CAMERA_BACKGROUND_ASSETS = {
  tasksVisionFileSet: "/video-processors/wasm",
  modelAssetPath: "/video-processors/selfie_segmenter.tflite",
} as const;

/** Файлы, без которых MediaPipe не стартует (SIMD и nosimd варианты). */
export const CAMERA_BACKGROUND_REQUIRED_ASSET_URLS = [
  CAMERA_BACKGROUND_ASSETS.modelAssetPath,
  `${CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet}/vision_wasm_internal.js`,
  `${CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet}/vision_wasm_internal.wasm`,
  `${CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet}/vision_wasm_nosimd_internal.js`,
  `${CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet}/vision_wasm_nosimd_internal.wasm`,
] as const;

export const CAMERA_BACKGROUND_BLUR_RADIUS = 10;
export const CAMERA_BACKGROUND_MAX_FPS = 20;
/**
 * Output / composite FPS on CPU path. Segmentation runs at a lower rate
 * (`CAMERA_BACKGROUND_SEGMENT_MAX_FPS`); skipped segs reuse the last mask on
 * the current camera frame so motion stays smooth without raw passthrough.
 */
export const CAMERA_BACKGROUND_CPU_MAX_FPS = 20;
/** Heavy MediaPipe passes per second (mask updates). */
export const CAMERA_BACKGROUND_SEGMENT_MAX_FPS = 12;
/** Downscale long edge before MediaPipe to cut CPU cost. */
export const CAMERA_BACKGROUND_SEG_MAX_WIDTH = 320;
/** EMA weight for new masks (0..1). */
export const CAMERA_BACKGROUND_MASK_TEMPORAL = 0.4;
/** Feather radius in mask pixels after temporal blend. */
export const CAMERA_BACKGROUND_MASK_FEATHER = 2;
/**
 * На Chrome MediaStreamTrackProcessor path maxFps процессора не действует.
 * Сжимаем захват камеры до применения фона, чтобы снизить нагрузку GPU/CPU.
 */
export const CAMERA_BACKGROUND_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 960 },
  height: { ideal: 360, max: 540 },
  frameRate: { ideal: 20, max: 24 },
};
export const CAMERA_BACKGROUND_SLOW_MS = 95;
/** Быстрее выходим на слабых устройствах после cap capture. */
export const CAMERA_BACKGROUND_WARMUP_FRAMES = 30;
export const CAMERA_BACKGROUND_SLOW_FRAMES = 10;

export const CAMERA_BACKGROUND_SLOW_MESSAGE =
  "Виртуальный фон отключён: устройство не справляется с обработкой.";

export const CAMERA_BACKGROUND_INIT_FAIL_MESSAGE =
  "Не удалось включить виртуальный фон. Звонок продолжается с обычной камерой.";

export const CAMERA_BACKGROUND_ASSET_FAIL_MESSAGE =
  "Не удалось загрузить модуль виртуального фона. Звонок продолжается с обычной камерой.";

export const CAMERA_BACKGROUND_UNSUPPORTED_MESSAGE =
  "Виртуальный фон недоступен в этом браузере.";

export type SlowFrameWatch = {
  samples: number;
  slow: number;
};

export const EMPTY_SLOW_FRAME_WATCH: SlowFrameWatch = { samples: 0, slow: 0 };

export type CameraBackgroundCapabilities = {
  processors: boolean;
  modernApi: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  videoFrame: boolean;
};

export type CameraBackgroundDiagType =
  | "init_start"
  | "init_ok"
  | "init_fail"
  | "asset_fail"
  | "asset_ok"
  | "bg_image_fail"
  | "fallback_cpu"
  | "skip_cpu_fallback"
  | "constraint_ok"
  | "constraint_fail"
  | "orphan_destroy"
  | "frame_slow_trip"
  | "reinit"
  | "teardown"
  | "apply_skip"
  | "unsupported"
  | "stage"
  | "webgl_probe"
  | "architecture"
  | "perf_sample";

export type CameraBackgroundDiagEvent = {
  t: number;
  type: CameraBackgroundDiagType;
  detail?: string;
  ms?: number;
  delegate?: CameraBackgroundDelegate;
};

/** Rolling counters for FPS / latency — no frames or PII. */
export type CameraBackgroundPerfStats = {
  windowStartedAt: number;
  outputFrames: number;
  segmentPasses: number;
  skippedFrames: number;
  segMsSum: number;
  segMsMax: number;
  processMsSum: number;
  processMsMax: number;
  lastAutoDisableReason: string | null;
  lastBgLoadError: string | null;
};

export type CameraBackgroundPerfSnapshot = {
  outputFps: number;
  segmentationFps: number;
  avgSegmentationMs: number;
  maxSegmentationMs: number;
  avgProcessingMs: number;
  maxProcessingMs: number;
  skippedFrames: number;
  outputFrames: number;
  segmentPasses: number;
  windowMs: number;
  lastAutoDisableReason: string | null;
  lastBgLoadError: string | null;
};

const DIAG_LIMIT = 48;
const PERF_SAMPLE_EVERY = 40;
let diagEvents: CameraBackgroundDiagEvent[] = [];
let diagListener: ((event: CameraBackgroundDiagEvent) => void) | null = null;
let assetProbeCache: { ok: boolean; missing: string[] } | null = null;
let perfStats: CameraBackgroundPerfStats = emptyPerfStats();
let perfSampleCounter = 0;

function emptyPerfStats(): CameraBackgroundPerfStats {
  return {
    windowStartedAt: Date.now(),
    outputFrames: 0,
    segmentPasses: 0,
    skippedFrames: 0,
    segMsSum: 0,
    segMsMax: 0,
    processMsSum: 0,
    processMsMax: 0,
    lastAutoDisableReason: null,
    lastBgLoadError: null,
  };
}

export function cameraBackgroundImageById(
  id: string
): CameraBackgroundImage | undefined {
  return CAMERA_BACKGROUND_IMAGES.find((item) => item.id === id);
}

export function isCameraBackgroundActive(choice: CameraBackgroundChoice): boolean {
  return choice.type !== "off";
}

export function cameraBackgroundChoicesEqual(
  a: CameraBackgroundChoice,
  b: CameraBackgroundChoice
): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "image" && b.type === "image") return a.id === b.id;
  return true;
}

/**
 * Показывать ли UI фона. iPhone скрываем (нет стабильного MediaStreamTrackProcessor).
 * Не отключаем функцию «на всех устройствах» — только явную несовместимость.
 */
export function shouldShowCameraBackground(input: {
  userAgent: string;
  supportsProcessors: boolean;
}): boolean {
  if (!input.supportsProcessors) return false;
  if (/iPhone/i.test(input.userAgent)) return false;
  return true;
}

export function detectCameraBackgroundCapabilities(input: {
  supportsProcessors: boolean;
  supportsModernApi?: boolean;
  hasWebGL2?: boolean;
  hasOffscreenCanvas?: boolean;
  hasVideoFrame?: boolean;
}): CameraBackgroundCapabilities {
  return {
    processors: input.supportsProcessors,
    modernApi: Boolean(input.supportsModernApi),
    webgl2: input.hasWebGL2 !== false,
    offscreenCanvas: input.hasOffscreenCanvas !== false,
    videoFrame: input.hasVideoFrame !== false,
  };
}

/** Runtime-проверка API в браузере (без импорта LiveKit — удобно для тестов). */
export function inspectBrowserCameraBackgroundApis(
  globalObj: typeof globalThis = globalThis
): Omit<CameraBackgroundCapabilities, "processors" | "modernApi"> {
  const g = globalObj as typeof globalThis & {
    OffscreenCanvas?: unknown;
    VideoFrame?: unknown;
    document?: {
      createElement: (tag: string) => { getContext: (id: string) => unknown };
    };
  };
  let webgl2 = false;
  try {
    webgl2 = Boolean(g.document?.createElement("canvas").getContext("webgl2"));
  } catch {
    webgl2 = false;
  }
  return {
    webgl2,
    offscreenCanvas: typeof g.OffscreenCanvas !== "undefined",
    videoFrame: typeof g.VideoFrame !== "undefined",
  };
}

export function noteProcessedFrame(
  watch: SlowFrameWatch,
  processingTimeMs: number
): SlowFrameWatch {
  const samples = watch.samples + 1;
  if (samples <= CAMERA_BACKGROUND_WARMUP_FRAMES) {
    return { samples, slow: 0 };
  }
  const slow =
    processingTimeMs > CAMERA_BACKGROUND_SLOW_MS ? watch.slow + 1 : 0;
  return { samples, slow };
}

export function shouldAutoDisableBackground(watch: SlowFrameWatch): boolean {
  return watch.slow >= CAMERA_BACKGROUND_SLOW_FRAMES;
}

export function clearCameraBackgroundAssetProbeCache() {
  assetProbeCache = null;
}

export function getCameraBackgroundAssetProbeCache() {
  return assetProbeCache;
}

/**
 * Предпроверка WASM/модели. Не читает видеокадры и не логирует персональные данные.
 * HEAD с fallback на Range GET — часть CDN/статик-серверов не отдают HEAD.
 */
export async function probeCameraBackgroundAssets(
  fetchImpl: typeof fetch = fetch,
  urls: readonly string[] = CAMERA_BACKGROUND_REQUIRED_ASSET_URLS,
  options?: { force?: boolean }
): Promise<{ ok: boolean; missing: string[] }> {
  if (!options?.force && assetProbeCache) return assetProbeCache;

  const missing: string[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const head = await fetchImpl(url, {
          method: "HEAD",
          cache: "force-cache",
        });
        if (head.ok) return;
        if (head.status === 405 || head.status === 501 || head.status === 400) {
          const ranged = await fetchImpl(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            cache: "force-cache",
          });
          if (ranged.ok || ranged.status === 206) return;
          missing.push(url);
          return;
        }
        missing.push(url);
      } catch {
        missing.push(url);
      }
    })
  );

  assetProbeCache = { ok: missing.length === 0, missing };
  return assetProbeCache;
}

export function recordCameraBackgroundDiag(
  event: Omit<CameraBackgroundDiagEvent, "t">
): CameraBackgroundDiagEvent {
  const full: CameraBackgroundDiagEvent = { ...event, t: Date.now() };
  diagEvents =
    diagEvents.length >= DIAG_LIMIT
      ? [...diagEvents.slice(1 - DIAG_LIMIT), full]
      : [...diagEvents, full];
  try {
    // Только технические метки: тип, делегат, длительность, короткий detail без URI query.
    console.info(
      "[camera-bg]",
      full.type,
      full.delegate ?? "",
      full.ms != null ? `${full.ms}ms` : "",
      full.detail ?? ""
    );
  } catch {
    /* ignore console failures */
  }
  diagListener?.(full);
  return full;
}

export function getCameraBackgroundDiag(): readonly CameraBackgroundDiagEvent[] {
  return diagEvents;
}

export function clearCameraBackgroundDiag() {
  diagEvents = [];
  resetCameraBackgroundPerfStats();
}

export function setCameraBackgroundDiagListener(
  listener: ((event: CameraBackgroundDiagEvent) => void) | null
) {
  diagListener = listener;
}

export function resetCameraBackgroundPerfStats() {
  perfStats = emptyPerfStats();
  perfSampleCounter = 0;
}

export function getCameraBackgroundPerfStats(): CameraBackgroundPerfStats {
  return { ...perfStats };
}

export function summarizeCameraBackgroundPerf(
  stats: CameraBackgroundPerfStats = perfStats,
  now: number = Date.now()
): CameraBackgroundPerfSnapshot {
  const windowMs = Math.max(1, now - stats.windowStartedAt);
  const sec = windowMs / 1000;
  return {
    outputFps: stats.outputFrames / sec,
    segmentationFps: stats.segmentPasses / sec,
    avgSegmentationMs:
      stats.segmentPasses > 0 ? stats.segMsSum / stats.segmentPasses : 0,
    maxSegmentationMs: stats.segMsMax,
    avgProcessingMs:
      stats.outputFrames > 0 ? stats.processMsSum / stats.outputFrames : 0,
    maxProcessingMs: stats.processMsMax,
    skippedFrames: stats.skippedFrames,
    outputFrames: stats.outputFrames,
    segmentPasses: stats.segmentPasses,
    windowMs,
    lastAutoDisableReason: stats.lastAutoDisableReason,
    lastBgLoadError: stats.lastBgLoadError,
  };
}

/**
 * Cheap O(1) counters. Emits a rare `perf_sample` diag event (~every 40 frames).
 */
export function noteCameraBackgroundPerfFrame(input: {
  processingTimeMs: number;
  segmentationTimeMs?: number;
  segmented?: boolean;
  skipped?: boolean;
}): CameraBackgroundPerfSnapshot | null {
  if (input.skipped) {
    perfStats.skippedFrames += 1;
    return null;
  }
  const processMs = Math.max(0, input.processingTimeMs);
  perfStats.outputFrames += 1;
  perfStats.processMsSum += processMs;
  if (processMs > perfStats.processMsMax) perfStats.processMsMax = processMs;
  if (input.segmented) {
    const segMs = Math.max(0, input.segmentationTimeMs ?? 0);
    perfStats.segmentPasses += 1;
    perfStats.segMsSum += segMs;
    if (segMs > perfStats.segMsMax) perfStats.segMsMax = segMs;
  }
  perfSampleCounter += 1;
  if (perfSampleCounter < PERF_SAMPLE_EVERY) return null;
  perfSampleCounter = 0;
  const snap = summarizeCameraBackgroundPerf();
  recordCameraBackgroundDiag({
    type: "perf_sample",
    detail: `out:${snap.outputFps.toFixed(1)} seg:${snap.segmentationFps.toFixed(1)} avgSeg:${Math.round(snap.avgSegmentationMs)} maxSeg:${Math.round(snap.maxSegmentationMs)} skip:${snap.skippedFrames}`,
    ms: Math.round(snap.avgProcessingMs),
    delegate: "CPU",
  });
  return snap;
}

export function noteCameraBackgroundAutoDisable(reason: string) {
  perfStats.lastAutoDisableReason = reason.slice(0, 120);
}

export function noteCameraBackgroundImageLoadError(detail = "bg_image_fail") {
  const short = detail.slice(0, 80);
  perfStats.lastBgLoadError = short;
  recordCameraBackgroundDiag({
    type: "bg_image_fail",
    detail: short,
    delegate: "CPU",
  });
}

/** Классифицируем ошибку init без утечки внутренних стеков пользователю. */
export function classifyCameraBackgroundInitError(err: unknown): {
  kind: "asset" | "unsupported" | "gpu" | "generic";
  message: string;
} {
  const text =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : "";
  const lower = text.toLowerCase();
  if (
    /404|failed to fetch|networkerror|load.*wasm|modelasset|fileset|not found/i.test(
      lower
    )
  ) {
    return { kind: "asset", message: CAMERA_BACKGROUND_ASSET_FAIL_MESSAGE };
  }
  if (/gpu|delegate|context.?lost|opengl|webgl/i.test(lower)) {
    return { kind: "gpu", message: CAMERA_BACKGROUND_INIT_FAIL_MESSAGE };
  }
  if (/not supported|offscreen|videoframe/i.test(lower)) {
    return {
      kind: "unsupported",
      message: CAMERA_BACKGROUND_UNSUPPORTED_MESSAGE,
    };
  }
  return { kind: "generic", message: CAMERA_BACKGROUND_INIT_FAIL_MESSAGE };
}

export function maxFpsForDelegate(delegate: CameraBackgroundDelegate): number {
  return delegate === "CPU"
    ? CAMERA_BACKGROUND_CPU_MAX_FPS
    : CAMERA_BACKGROUND_MAX_FPS;
}

/** Не запускать CPU после явного сбоя WebGL/GPU — иначе двойная нагрузка перед крашем вкладки. */
export function shouldSkipCpuFallbackAfterGpuFailure(kind: string): boolean {
  return kind === "gpu" || kind === "unsupported";
}

export async function constrainCameraTrackForBackground(
  track: { mediaStreamTrack?: MediaStreamTrack | null },
  constraints: MediaTrackConstraints = CAMERA_BACKGROUND_CAPTURE_CONSTRAINTS
): Promise<"ok" | "skip" | "fail"> {
  const media = track.mediaStreamTrack;
  if (!media || typeof media.applyConstraints !== "function") return "skip";
  try {
    await media.applyConstraints(constraints);
    return "ok";
  } catch {
    return "fail";
  }
}
