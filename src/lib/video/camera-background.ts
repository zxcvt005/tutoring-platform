export type CameraBackgroundChoice =
  | { type: "off" }
  | { type: "blur" }
  | { type: "image"; id: string };

export type CameraBackgroundImage = {
  id: string;
  src: string;
  label: string;
};

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

export const CAMERA_BACKGROUND_BLUR_RADIUS = 10;
export const CAMERA_BACKGROUND_MAX_FPS = 20;
export const CAMERA_BACKGROUND_SLOW_MS = 80;
export const CAMERA_BACKGROUND_WARMUP_FRAMES = 45;
export const CAMERA_BACKGROUND_SLOW_FRAMES = 12;

export const CAMERA_BACKGROUND_SLOW_MESSAGE =
  "Виртуальный фон отключён: устройство не справляется с обработкой.";

export type SlowFrameWatch = {
  samples: number;
  slow: number;
};

export const EMPTY_SLOW_FRAME_WATCH: SlowFrameWatch = { samples: 0, slow: 0 };

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

export function shouldShowCameraBackground(input: {
  userAgent: string;
  supportsProcessors: boolean;
}): boolean {
  if (!input.supportsProcessors) return false;
  if (/iPhone/i.test(input.userAgent)) return false;
  return true;
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
