import {
  supportsBackgroundProcessors,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import type { LocalVideoTrack } from "livekit-client";

import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_BLUR_RADIUS,
  CAMERA_BACKGROUND_INIT_FAIL_MESSAGE,
  CAMERA_BACKGROUND_SLOW_MESSAGE,
  CAMERA_BACKGROUND_UNSUPPORTED_MESSAGE,
  EMPTY_SLOW_FRAME_WATCH,
  cameraBackgroundChoicesEqual,
  cameraBackgroundImageById,
  classifyCameraBackgroundInitError,
  constrainCameraTrackForBackground,
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
import {
  abortCameraBackgroundStageRun,
  beginCameraBackgroundStageRun,
  completeCameraBackgroundStageRun,
  markCameraBackgroundStage,
  noteCameraBackgroundReinit,
} from "@/lib/video/camera-background-stages";
import { probeCameraBackgroundWebGl } from "@/lib/video/camera-background-webgl";
import {
  createIsolatedBackgroundProcessor,
  isolatedProcessorSupportsEnvironment,
  type IsolatedBackgroundProcessor,
} from "@/lib/video/isolated-background-processor";

export type CameraBackgroundProcessorHandle = {
  switchTo: (options: SwitchBackgroundProcessorOptions) => Promise<void>;
  destroy?: () => Promise<void>;
};

export type BackgroundProcessorFactory = (
  options: SwitchBackgroundProcessorOptions & {
    assetPaths: typeof CAMERA_BACKGROUND_ASSETS;
    maxFps: number;
    onFrameProcessed: (stats: { processingTimeMs: number }) => void;
  }
) => CameraBackgroundProcessorHandle;

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

function defaultCreateProcessor(
  options: Parameters<BackgroundProcessorFactory>[0]
): IsolatedBackgroundProcessor {
  return createIsolatedBackgroundProcessor({
    mode: options.mode,
    blurRadius:
      options.mode === "background-blur" ? options.blurRadius : undefined,
    imagePath:
      options.mode === "virtual-background" ? options.imagePath : undefined,
    assetPaths: options.assetPaths,
    maxFps: options.maxFps,
    onFrameProcessed: options.onFrameProcessed,
  });
}

export class CameraBackgroundController {
  private choice: CameraBackgroundChoice = { type: "off" };
  private processor: CameraBackgroundProcessorHandle | null = null;
  private track: LocalVideoTrack | null = null;
  private queue: Promise<void> = Promise.resolve();
  private watch: SlowFrameWatch = EMPTY_SLOW_FRAME_WATCH;
  private disabling = false;
  private generation = 0;
  private desireEpoch = 0;
  private disposed = false;
  private activeDelegate: CameraBackgroundDelegate | null = null;
  private lastAppliedChoice: CameraBackgroundChoice | null = null;
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
    this.createProcessor = options?.createProcessor ?? defaultCreateProcessor;
    this.supportsProcessors =
      options?.supportsProcessors ??
      (() =>
        supportsBackgroundProcessors() &&
        isolatedProcessorSupportsEnvironment());
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

    markCameraBackgroundStage("camera_acquired", track.mediaStreamTrack?.id?.slice(0, 8));

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

    const current = track.getProcessor() as unknown;
    const sameProcessor =
      Boolean(this.processor) && current === (this.processor as unknown);
    if (
      sameProcessor &&
      this.lastAppliedChoice &&
      cameraBackgroundChoicesEqual(this.lastAppliedChoice, intended)
    ) {
      recordCameraBackgroundDiag({
        type: "apply_skip",
        detail: "already_active",
        delegate: this.activeDelegate ?? undefined,
      });
      return {
        ok: true,
        choice: intended,
        delegate: this.activeDelegate ?? undefined,
      };
    }
    if (sameProcessor && this.processor) {
      try {
        await this.processor.switchTo(options);
        this.lastAppliedChoice = intended;
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

    const webgl = probeCameraBackgroundWebGl();
    recordCameraBackgroundDiag({
      type: "webgl_probe",
      detail: webgl.detail,
    });
    markCameraBackgroundStage("webgl_probed", webgl.detail, {
      webglFloatOk: webgl.mediapipeGpuSafe,
      modernApi: true,
    });

    if (this.stale(gen) || epoch !== this.desireEpoch) {
      return { ok: true, choice: this.choice };
    }

    const constrained = await constrainCameraTrackForBackground(track);
    recordCameraBackgroundDiag({
      type: constrained === "fail" ? "constraint_fail" : "constraint_ok",
      detail: constrained,
    });

    this.initCount += 1;
    if (this.initCount > 1) {
      noteCameraBackgroundReinit();
      recordCameraBackgroundDiag({
        type: "reinit",
        detail: `count:${this.initCount}`,
      });
    }

    beginCameraBackgroundStageRun(options.mode);
    const started = Date.now();
    // Isolated architecture: CPU MediaPipe + separate 2D canvas.
    // Do not use LiveKit BackgroundProcessor GPU shared-context path.
    recordCameraBackgroundDiag({
      type: "init_start",
      detail: `isolated:${options.mode}`,
      delegate: "CPU",
    });

    const attached = await this.attachIsolated(track, options, gen);
    if (attached.ok) {
      this.lastAppliedChoice = intended;
      recordCameraBackgroundDiag({
        type: "init_ok",
        ms: Date.now() - started,
        delegate: "CPU",
      });
      markCameraBackgroundStage("track_published", "processor_on");
      return { ...attached, choice: intended };
    }

    abortCameraBackgroundStageRun(attached.message ?? "init_fail");
    recordCameraBackgroundDiag({
      type: "init_fail",
      ms: Date.now() - started,
      detail: attached.message,
      delegate: "CPU",
    });
    return this.failSoft(
      attached.message ?? CAMERA_BACKGROUND_INIT_FAIL_MESSAGE,
      "init_fail",
      epoch
    );
  }

  private async attachIsolated(
    track: LocalVideoTrack,
    options: SwitchBackgroundProcessorOptions,
    gen: number
  ): Promise<CameraBackgroundApplyResult & { kind?: string }> {
    if (this.stale(gen)) {
      return { ok: true, choice: this.choice };
    }

    this.watch = EMPTY_SLOW_FRAME_WATCH;
    let created: CameraBackgroundProcessorHandle | null = null;
    try {
      created = this.createProcessor({
        ...options,
        assetPaths: CAMERA_BACKGROUND_ASSETS,
        maxFps: maxFpsForDelegate("CPU"),
        onFrameProcessed: (stats) => this.onFrame(stats.processingTimeMs),
      });
      await track.setProcessor(created as never, true);
      if (this.stale(gen) || this.disposed) {
        await this.destroyCreated(created);
        await this.safeStop(track);
        return { ok: true, choice: { type: "off" } };
      }
      this.processor = created;
      this.activeDelegate = "CPU";
      return { ok: true, choice: this.choice, delegate: "CPU" };
    } catch (err) {
      const classified = classifyCameraBackgroundInitError(err);
      recordCameraBackgroundDiag({
        type: "init_fail",
        detail: `CPU:${errorDetail(err)}`,
        delegate: "CPU",
      });
      this.processor = null;
      this.activeDelegate = null;
      await this.destroyCreated(created);
      await this.safeStop(track);
      return {
        ok: false,
        choice: this.choice,
        message: classified.message,
        delegate: "CPU",
        kind: classified.kind,
      };
    }
  }

  private async destroyCreated(
    created: CameraBackgroundProcessorHandle | null
  ): Promise<void> {
    if (!created) return;
    try {
      if (typeof created.destroy === "function") {
        await created.destroy();
        recordCameraBackgroundDiag({ type: "orphan_destroy" });
      }
    } catch {
      /* already destroyed */
    }
  }

  private failSoft(
    message: string,
    reason: string,
    epoch: number
  ): CameraBackgroundApplyResult {
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
    this.lastAppliedChoice = null;
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
    this.lastAppliedChoice = null;
    this.watch = EMPTY_SLOW_FRAME_WATCH;
    await this.safeStop(track);
    if (reason === "dispose" || reason === "release" || reason === "inactive") {
      completeCameraBackgroundStageRun(reason);
    }
  }

  private async safeStop(track: LocalVideoTrack | null): Promise<void> {
    if (!track) return;
    try {
      if (track.getProcessor()) {
        await track.stopProcessor();
      }
    } catch {
      /* track already stopped with processor */
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
