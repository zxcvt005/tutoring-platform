import {
  BackgroundProcessor,
  type BackgroundProcessorOptions,
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
  supportsBackgroundProcessors,
} from "@livekit/track-processors";
import type { LocalVideoTrack } from "livekit-client";

import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_BLUR_RADIUS,
  CAMERA_BACKGROUND_INIT_FAIL_MESSAGE,
  CAMERA_BACKGROUND_SLOW_MESSAGE,
  CAMERA_BACKGROUND_UNSUPPORTED_MESSAGE,
  EMPTY_SLOW_FRAME_WATCH,
  cameraBackgroundImageById,
  classifyCameraBackgroundInitError,
  isCameraBackgroundActive,
  maxFpsForDelegate,
  noteProcessedFrame,
  probeCameraBackgroundAssets,
  recordCameraBackgroundDiag,
  shouldAutoDisableBackground,
  type CameraBackgroundChoice,
  type CameraBackgroundDelegate,
  type SlowFrameWatch,
} from "@/lib/video/camera-background";

export type BackgroundProcessorFactory = (
  options: BackgroundProcessorOptions
) => BackgroundProcessorWrapper;

export type CameraBackgroundApplyResult = {
  ok: boolean;
  choice: CameraBackgroundChoice;
  message?: string;
  delegate?: CameraBackgroundDelegate;
};

function switchOptionsFor(
  choice: CameraBackgroundChoice
): SwitchBackgroundProcessorOptions | null {
  if (choice.type === "off") return { mode: "disabled" };
  if (choice.type === "blur") {
    return {
      mode: "background-blur",
      blurRadius: CAMERA_BACKGROUND_BLUR_RADIUS,
    };
  }
  const image = cameraBackgroundImageById(choice.id);
  if (!image) return null;
  return { mode: "virtual-background", imagePath: image.src };
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}:${err.message}`.slice(0, 160);
  }
  return "unknown";
}

export class CameraBackgroundController {
  private choice: CameraBackgroundChoice = { type: "off" };
  private processor: BackgroundProcessorWrapper | null = null;
  private track: LocalVideoTrack | null = null;
  private queue: Promise<void> = Promise.resolve();
  private watch: SlowFrameWatch = EMPTY_SLOW_FRAME_WATCH;
  private disabling = false;
  private generation = 0;
  private desireEpoch = 0;
  private disposed = false;
  private activeDelegate: CameraBackgroundDelegate | null = null;
  private initCount = 0;
  private readonly createProcessor: BackgroundProcessorFactory;
  private readonly supportsProcessors: () => boolean;
  private readonly probeAssets: typeof probeCameraBackgroundAssets;

  onAutoOff: ((message: string) => void) | null = null;
  onFailure: ((message: string) => void) | null = null;

  constructor(options?: {
    createProcessor?: BackgroundProcessorFactory;
    supportsProcessors?: () => boolean;
    probeAssets?: typeof probeCameraBackgroundAssets;
  }) {
    this.createProcessor = options?.createProcessor ?? BackgroundProcessor;
    this.supportsProcessors =
      options?.supportsProcessors ?? supportsBackgroundProcessors;
    this.probeAssets = options?.probeAssets ?? probeCameraBackgroundAssets;
  }

  getChoice(): CameraBackgroundChoice {
    return this.choice;
  }

  getActiveDelegate(): CameraBackgroundDelegate | null {
    return this.activeDelegate;
  }

  setDesired(choice: CameraBackgroundChoice) {
    this.choice =
      choice.type === "image" && !cameraBackgroundImageById(choice.id)
        ? { type: "off" }
        : choice;
    this.desireEpoch += 1;
  }

  setChoice(choice: CameraBackgroundChoice): Promise<CameraBackgroundApplyResult> {
    this.setDesired(choice);
    return this.applyTo(this.track);
  }

  applyTo(
    track: LocalVideoTrack | null | undefined
  ): Promise<CameraBackgroundApplyResult> {
    const next = track ?? null;
    const epoch = this.desireEpoch;
    const intended = this.choice;
    let result: CameraBackgroundApplyResult = {
      ok: true,
      choice: intended,
    };
    this.queue = this.queue.then(
      async () => {
        result = await this.runQueued(next, intended, epoch);
      },
      async () => {
        result = await this.runQueued(next, intended, epoch);
      }
    );
    return this.queue.then(() => result);
  }

  private async runQueued(
    track: LocalVideoTrack | null,
    intended: CameraBackgroundChoice,
    epoch: number
  ): Promise<CameraBackgroundApplyResult> {
    if (this.disposed) {
      recordCameraBackgroundDiag({
        type: "apply_skip",
        detail: "disposed",
      });
      return { ok: true, choice: { type: "off" } };
    }
    if (epoch !== this.desireEpoch) {
      recordCameraBackgroundDiag({
        type: "apply_skip",
        detail: "superseded",
      });
      return { ok: true, choice: this.choice };
    }
    return this.run(track, intended, epoch);
  }

  release(track: LocalVideoTrack | null | undefined): Promise<void> {
    const target = track ?? null;
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      if (!target || this.track !== target) return;
      await this.teardownProcessor(target, "release");
      this.track = null;
    });
    return this.queue;
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.generation += 1;
    this.choice = { type: "off" };
    this.queue = this.queue.then(async () => {
      const track = this.track;
      this.track = null;
      await this.teardownProcessor(track, "dispose");
    });
    return this.queue;
  }

  private async run(
    track: LocalVideoTrack | null,
    intended: CameraBackgroundChoice,
    epoch: number
  ): Promise<CameraBackgroundApplyResult> {
    const gen = this.generation;
    if (epoch === this.desireEpoch) {
      this.choice = intended;
    }

    if (this.track && this.track !== track) {
      await this.teardownProcessor(this.track, "track_switch");
    }
    this.track = track;

    if (!track || !isCameraBackgroundActive(intended)) {
      await this.teardownProcessor(track, "inactive");
      return { ok: true, choice: intended };
    }

    if (!this.supportsProcessors()) {
      return this.failSoft(
        CAMERA_BACKGROUND_UNSUPPORTED_MESSAGE,
        "unsupported",
        epoch
      );
    }

    const options = switchOptionsFor(intended);
    if (!options || options.mode === "disabled") {
      await this.teardownProcessor(track, "disabled");
      return { ok: true, choice: intended };
    }

    if (this.stale(gen) || epoch !== this.desireEpoch) {
      return { ok: true, choice: this.choice };
    }

    const current = track.getProcessor();
    if (this.processor && current === this.processor) {
      try {
        await this.processor.switchTo(options);
        return {
          ok: true,
          choice: intended,
          delegate: this.activeDelegate ?? undefined,
        };
      } catch (err) {
        recordCameraBackgroundDiag({
          type: "init_fail",
          detail: `switch:${errorDetail(err)}`,
          delegate: this.activeDelegate ?? undefined,
        });
        await this.teardownProcessor(track, "switch_fail");
        // fall through to full re-init
      }
    }

    if (this.stale(gen)) {
      return { ok: true, choice: this.choice };
    }

    if (track.getProcessor()) {
      await this.teardownProcessor(track, "replace");
    }

    const assets = await this.probeAssets();
    if (!assets.ok) {
      recordCameraBackgroundDiag({
        type: "asset_fail",
        detail: `missing:${assets.missing.length}`,
      });
      return this.failSoft(
        classifyCameraBackgroundInitError(new Error("asset missing")).message,
        "asset_fail",
        epoch
      );
    }
    recordCameraBackgroundDiag({ type: "asset_ok" });

    if (this.stale(gen) || epoch !== this.desireEpoch) {
      return { ok: true, choice: this.choice };
    }

    this.initCount += 1;
    if (this.initCount > 1) {
      recordCameraBackgroundDiag({
        type: "reinit",
        detail: `count:${this.initCount}`,
      });
    }

    const started = Date.now();
    recordCameraBackgroundDiag({
      type: "init_start",
      detail: options.mode,
      delegate: "GPU",
    });

    const gpu = await this.attachWithDelegate(track, options, "GPU", gen);
    if (gpu.ok) {
      recordCameraBackgroundDiag({
        type: "init_ok",
        ms: Date.now() - started,
        delegate: "GPU",
      });
      return { ...gpu, choice: intended };
    }

    if (this.stale(gen) || this.disposed) {
      return { ok: true, choice: { type: "off" } };
    }

    // CPU только после сбоя GPU-инициализации (не как режим по умолчанию).
    // Медленные кадры по-прежнему гасятся shouldAutoDisableBackground.
    recordCameraBackgroundDiag({
      type: "fallback_cpu",
      detail: gpu.message ?? "gpu_init_failed",
    });
    const cpu = await this.attachWithDelegate(track, options, "CPU", gen);
    if (cpu.ok) {
      recordCameraBackgroundDiag({
        type: "init_ok",
        ms: Date.now() - started,
        delegate: "CPU",
      });
      return { ...cpu, choice: intended };
    }

    recordCameraBackgroundDiag({
      type: "init_fail",
      ms: Date.now() - started,
      detail: cpu.message ?? gpu.message,
    });
    return this.failSoft(
      cpu.message ?? gpu.message ?? CAMERA_BACKGROUND_INIT_FAIL_MESSAGE,
      "init_fail",
      epoch
    );
  }

  private async attachWithDelegate(
    track: LocalVideoTrack,
    options: SwitchBackgroundProcessorOptions,
    delegate: CameraBackgroundDelegate,
    gen: number
  ): Promise<CameraBackgroundApplyResult> {
    if (this.stale(gen)) {
      return { ok: true, choice: this.choice };
    }

    this.watch = EMPTY_SLOW_FRAME_WATCH;
    let created: BackgroundProcessorWrapper | null = null;
    try {
      created = this.createProcessor({
        ...options,
        assetPaths: CAMERA_BACKGROUND_ASSETS,
        maxFps: maxFpsForDelegate(delegate),
        segmenterOptions: { delegate },
        onFrameProcessed: (stats) => this.onFrame(stats.processingTimeMs),
      });
      await track.setProcessor(created, true);
      if (this.stale(gen) || this.disposed) {
        await this.safeStop(track);
        return { ok: true, choice: { type: "off" } };
      }
      this.processor = created;
      this.activeDelegate = delegate;
      return { ok: true, choice: this.choice, delegate };
    } catch (err) {
      const classified = classifyCameraBackgroundInitError(err);
      recordCameraBackgroundDiag({
        type: "init_fail",
        detail: `${delegate}:${errorDetail(err)}`,
        delegate,
      });
      this.processor = null;
      this.activeDelegate = null;
      await this.safeStop(track);
      return {
        ok: false,
        choice: this.choice,
        message: classified.message,
        delegate,
      };
    }
  }

  private failSoft(
    message: string,
    reason: string,
    epoch: number
  ): CameraBackgroundApplyResult {
    // Не затираем более новый выбор пользователя, сделанный во время init.
    if (epoch !== this.desireEpoch) {
      recordCameraBackgroundDiag({
        type: "apply_skip",
        detail: `fail_stale:${reason}`,
      });
      return { ok: false, choice: this.choice, message };
    }
    this.choice = { type: "off" };
    this.desireEpoch += 1;
    this.activeDelegate = null;
    this.processor = null;
    this.watch = EMPTY_SLOW_FRAME_WATCH;
    recordCameraBackgroundDiag({ type: "apply_skip", detail: reason });
    this.onFailure?.(message);
    return { ok: false, choice: this.choice, message };
  }

  private async teardownProcessor(
    track: LocalVideoTrack | null,
    reason: string
  ): Promise<void> {
    recordCameraBackgroundDiag({ type: "teardown", detail: reason });
    this.processor = null;
    this.activeDelegate = null;
    this.watch = EMPTY_SLOW_FRAME_WATCH;
    await this.safeStop(track);
  }

  private async safeStop(track: LocalVideoTrack | null): Promise<void> {
    if (!track) return;
    try {
      if (track.getProcessor()) {
        await track.stopProcessor();
      }
    } catch {
      /* трек уже остановлен вместе с процессором */
    }
  }

  private stale(gen: number): boolean {
    return this.disposed || gen !== this.generation;
  }

  private onFrame(processingTimeMs: number) {
    if (this.disabling || this.disposed) return;
    this.watch = noteProcessedFrame(this.watch, processingTimeMs);
    if (!shouldAutoDisableBackground(this.watch)) return;
    this.disabling = true;
    recordCameraBackgroundDiag({
      type: "frame_slow_trip",
      detail: `ms:${Math.round(processingTimeMs)}`,
      delegate: this.activeDelegate ?? undefined,
    });
    this.setDesired({ type: "off" });
    void this.applyTo(this.track).finally(() => {
      this.disabling = false;
      this.onAutoOff?.(CAMERA_BACKGROUND_SLOW_MESSAGE);
    });
  }
}
