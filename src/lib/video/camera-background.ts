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

/** Готовые кадры из public/images/video/backgrounds/. Имя background4 на диске — backgroun4.png. */
export const CAMERA_BACKGROUND_IMAGES: readonly CameraBackgroundImage[] = [
  {
    id: "background1",
    src: "/images/video/backgrounds/background1.png",
    label: "Фон 1",
  },
  {
    id: "background2",
    src: "/images/video/backgrounds/background2.png",
    label: "Фон 2",
  },
  {
    id: "background3",
    src: "/images/video/backgrounds/background3.png",
    label: "Фон 3",
  },
  {
    id: "background4",
    src: "/images/video/backgrounds/backgroun4.png",
    label: "Фон 4",
  },
  {
    id: "background5",
    src: "/images/video/backgrounds/background5.png",
    label: "Фон 5",
  },
  {
    id: "background6",
    src: "/images/video/backgrounds/background6.png",
    label: "Фон 6",
  },
  {
    id: "background7",
    src: "/images/video/backgrounds/background7.png",
    label: "Фон 7",
  },
];

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
/** CPU-делегат: ниже FPS, чтобы не перегружать главный поток. */
export const CAMERA_BACKGROUND_CPU_MAX_FPS = 12;
export const CAMERA_BACKGROUND_SLOW_MS = 80;
export const CAMERA_BACKGROUND_WARMUP_FRAMES = 45;
export const CAMERA_BACKGROUND_SLOW_FRAMES = 12;

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
  | "fallback_cpu"
  | "frame_slow_trip"
  | "reinit"
  | "teardown"
  | "apply_skip"
  | "unsupported";

export type CameraBackgroundDiagEvent = {
  t: number;
  type: CameraBackgroundDiagType;
  detail?: string;
  ms?: number;
  delegate?: CameraBackgroundDelegate;
};

const DIAG_LIMIT = 48;
let diagEvents: CameraBackgroundDiagEvent[] = [];
let diagListener: ((event: CameraBackgroundDiagEvent) => void) | null = null;
let assetProbeCache: { ok: boolean; missing: string[] } | null = null;

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
}

export function setCameraBackgroundDiagListener(
  listener: ((event: CameraBackgroundDiagEvent) => void) | null
) {
  diagListener = listener;
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
