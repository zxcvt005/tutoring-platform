/**
 * Isolated virtual-background processor for LiveKit LocalVideoTrack.setProcessor.
 *
 * Architecture (stability-first):
 * - MediaPipe ImageSegmenter on CPU only — no shared LiveKit/MediaPipe WebGL canvas
 * - Separate 2D canvases for composite (CSS blur / image)
 * - Segmentation at CAMERA_BACKGROUND_SEGMENT_MAX_FPS on a downscaled frame
 * - Output/composite at CAMERA_BACKGROUND_CPU_MAX_FPS reusing the last mask so
 *   the person keeps moving without flashing the raw camera
 * - Temporal EMA + feather on the category mask for softer hair/edges
 */

import type {
  ProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import type { SwitchBackgroundProcessorOptions } from "@livekit/track-processors";

import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_BLUR_RADIUS,
  CAMERA_BACKGROUND_CPU_MAX_FPS,
  CAMERA_BACKGROUND_MASK_FEATHER,
  CAMERA_BACKGROUND_MASK_TEMPORAL,
  CAMERA_BACKGROUND_SEG_MAX_WIDTH,
  CAMERA_BACKGROUND_SEGMENT_MAX_FPS,
  noteCameraBackgroundImageLoadError,
  noteCameraBackgroundPerfFrame,
  recordCameraBackgroundDiag,
} from "@/lib/video/camera-background";
import {
  blendCategoryMasks,
  featherMaskBytes,
  personMixFromMaskByte,
  shouldRunSegmentation,
  targetSegmentationSize,
  type MaskBuffer,
} from "@/lib/video/camera-background-mask";
import {
  markCameraBackgroundStage,
  noteCameraBackgroundProcessorActive,
  noteCameraBackgroundSegmenterCreated,
  noteCameraBackgroundSegmenterDestroyed,
} from "@/lib/video/camera-background-stages";

export type IsolatedBackgroundProcessorOptions = {
  mode: SwitchBackgroundProcessorOptions["mode"];
  blurRadius?: number;
  imagePath?: string;
  assetPaths?: { tasksVisionFileSet?: string; modelAssetPath?: string };
  maxFps?: number;
  segmentMaxFps?: number;
  onFrameProcessed?: (stats: {
    processingTimeMs: number;
    segmentationTimeMs: number;
    filterTimeMs: number;
    segmented: boolean;
  }) => void;
};

type SegmenterLike = {
  segmentForVideo: (
    frame: VideoFrame | HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
    callback: (result: {
      categoryMask?: {
        getAsUint8Array: () => Uint8Array;
        width: number;
        height: number;
        close?: () => void;
      } | null;
      close?: () => void;
    }) => void
  ) => void;
  close: () => Promise<void> | void;
};

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (base: string) => Promise<unknown>;
  };
  ImageSegmenter: {
    createFromOptions: (
      fileset: unknown,
      options: Record<string, unknown>
    ) => Promise<SegmenterLike>;
  };
};

let visionModulePromise: Promise<VisionModule> | null = null;

async function loadVision(): Promise<VisionModule> {
  if (!visionModulePromise) {
    visionModulePromise = import("@mediapipe/tasks-vision") as Promise<VisionModule>;
  }
  return visionModulePromise;
}

function createOutputCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, width);
  canvas.height = Math.max(2, height);
  return canvas;
}

export class IsolatedBackgroundProcessor
  implements TrackProcessor<Track.Kind>
{
  readonly name = "neodin-isolated-background";

  processedTrack?: MediaStreamTrack;

  private source?: MediaStreamVideoTrack;
  private sourceDummy?: HTMLVideoElement;
  private processor?: MediaStreamTrackProcessor<VideoFrame>;
  private trackGenerator?: MediaStreamTrackGenerator<VideoFrame>;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private workCanvas?: HTMLCanvasElement;
  private workCtx?: CanvasRenderingContext2D | null;
  private segCanvas?: HTMLCanvasElement;
  private segCtx?: CanvasRenderingContext2D | null;
  private segmenter?: SegmenterLike | null;
  private backgroundImage: ImageBitmap | null = null;
  private backgroundPath: string | null = null;
  private mode: IsolatedBackgroundProcessorOptions["mode"] = "disabled";
  private blurRadius = CAMERA_BACKGROUND_BLUR_RADIUS;
  private imagePath?: string;
  private readonly assetPaths: {
    tasksVisionFileSet: string;
    modelAssetPath: string;
  };
  private readonly maxFps: number;
  private readonly segmentMaxFps: number;
  private readonly onFrameProcessed?: IsolatedBackgroundProcessorOptions["onFrameProcessed"];
  private minFrameIntervalMs: number;
  private minSegmentIntervalMs: number;
  private nextFrameDue = 0;
  private nextSegmentDue = 0;
  private firstFrameDone = false;
  private firstSegmentDone = false;
  private hasLastProcessedOutput = false;
  private lastMask: MaskBuffer | null = null;
  private destroyed = false;
  private epoch = 0;
  private loadEpoch = 0;
  private transformer?: TransformStream<VideoFrame, VideoFrame>;
  private pipeAbort?: AbortController;

  constructor(options: IsolatedBackgroundProcessorOptions) {
    this.mode = options.mode;
    this.blurRadius = options.blurRadius ?? CAMERA_BACKGROUND_BLUR_RADIUS;
    this.imagePath = options.imagePath;
    this.assetPaths = {
      tasksVisionFileSet:
        options.assetPaths?.tasksVisionFileSet ??
        CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet,
      modelAssetPath:
        options.assetPaths?.modelAssetPath ??
        CAMERA_BACKGROUND_ASSETS.modelAssetPath,
    };
    this.maxFps = options.maxFps ?? CAMERA_BACKGROUND_CPU_MAX_FPS;
    this.segmentMaxFps =
      options.segmentMaxFps ?? CAMERA_BACKGROUND_SEGMENT_MAX_FPS;
    this.minFrameIntervalMs = 1000 / Math.max(1, this.maxFps);
    this.minSegmentIntervalMs = 1000 / Math.max(1, this.segmentMaxFps);
    this.onFrameProcessed = options.onFrameProcessed;
  }

  async init(opts: ProcessorOptions<Track.Kind>): Promise<void> {
    if (this.destroyed) return;
    const epoch = this.epoch;
    markCameraBackgroundStage("processor_created", "isolated");
    noteCameraBackgroundProcessorActive(1);
    let activated = true;
    try {
      recordCameraBackgroundDiag({
        type: "architecture",
        detail: "isolated_cpu_2d_mask_reuse",
        delegate: "CPU",
      });

      this.source = opts.track as MediaStreamVideoTrack;
      this.sourceDummy = opts.element as HTMLVideoElement;
      const settings = this.source.getSettings();
      const width = settings.width || this.sourceDummy.videoWidth || 640;
      const height = settings.height || this.sourceDummy.videoHeight || 360;

      this.canvas = createOutputCanvas(width, height);
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      this.workCanvas = createOutputCanvas(width, height);
      this.workCtx = this.workCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      this.segCanvas = createOutputCanvas(
        CAMERA_BACKGROUND_SEG_MAX_WIDTH,
        Math.round(
          (CAMERA_BACKGROUND_SEG_MAX_WIDTH * height) / Math.max(1, width)
        )
      );
      this.segCtx = this.segCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!this.ctx || !this.workCtx || !this.segCtx) {
        throw new Error("2d canvas unavailable for isolated background");
      }

      markCameraBackgroundStage("mediapipe_initialized", "loading");
      const vision = await loadVision();
      if (this.destroyed || epoch !== this.epoch) {
        throw new Error("processor_stale_during_init");
      }
      const fileset = await vision.FilesetResolver.forVisionTasks(
        this.assetPaths.tasksVisionFileSet
      );
      this.segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: this.assetPaths.modelAssetPath,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      noteCameraBackgroundSegmenterCreated();
      markCameraBackgroundStage("mediapipe_initialized", "cpu_ok");

      if (this.imagePath) {
        await this.loadBackground(this.imagePath);
      }
      if (this.destroyed || epoch !== this.epoch) {
        throw new Error("processor_stale_during_init");
      }

      this.processor = new MediaStreamTrackProcessor({ track: this.source });
      this.trackGenerator = new MediaStreamTrackGenerator({
        kind: "video",
        signalTarget: this.source,
      });
      this.pipeAbort = new AbortController();
      this.transformer = new TransformStream(
        {
          transform: (frame, controller) => this.transform(frame, controller),
        },
        { highWaterMark: 1 },
        { highWaterMark: 1 }
      );

      const signal = this.pipeAbort.signal;
      void this.processor.readable
        .pipeThrough(this.transformer, { signal })
        .pipeTo(this.trackGenerator.writable, { signal })
        .catch((err) => {
          if (signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          recordCameraBackgroundDiag({
            type: "init_fail",
            detail: `pipe:${err instanceof Error ? err.name : "err"}`,
            delegate: "CPU",
          });
        });

      this.processedTrack = this.trackGenerator;
      markCameraBackgroundStage("processor_attached", "isolated_cpu");
    } catch (err) {
      this.destroyed = true;
      this.epoch += 1;
      this.loadEpoch += 1;
      try {
        await this.cleanupAfterFailedInit();
      } catch {
        /* ignore */
      }
      if (activated) {
        noteCameraBackgroundProcessorActive(-1);
      }
      throw err;
    }
  }

  private async cleanupAfterFailedInit(): Promise<void> {
    const segmenter = this.segmenter;
    this.segmenter = null;
    try {
      await segmenter?.close();
      if (segmenter) noteCameraBackgroundSegmenterDestroyed();
    } catch {
      /* ignore */
    }
    try {
      this.pipeAbort?.abort();
    } catch {
      /* ignore */
    }
    this.pipeAbort = undefined;
    try {
      this.trackGenerator?.stop();
    } catch {
      /* ignore */
    }
    this.trackGenerator = undefined;
    this.processor = undefined;
    this.processedTrack = undefined;
    this.clearCanvases();
  }

  private clearCanvases() {
    this.canvas = undefined;
    this.ctx = undefined;
    this.workCanvas = undefined;
    this.workCtx = undefined;
    this.segCanvas = undefined;
    this.segCtx = undefined;
  }

  async restart(opts: ProcessorOptions<Track.Kind>): Promise<void> {
    await this.destroy();
    this.destroyed = false;
    this.firstFrameDone = false;
    this.firstSegmentDone = false;
    this.hasLastProcessedOutput = false;
    this.lastMask = null;
    this.nextFrameDue = 0;
    this.nextSegmentDue = 0;
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.epoch += 1;
    this.loadEpoch += 1;
    markCameraBackgroundStage("processor_disposed", "isolated_destroy_start");

    const segmenter = this.segmenter;
    this.segmenter = null;
    try {
      await segmenter?.close();
      if (segmenter) noteCameraBackgroundSegmenterDestroyed();
    } catch {
      /* already closed */
    }

    try {
      this.pipeAbort?.abort();
    } catch {
      /* ignore */
    }
    this.pipeAbort = undefined;
    this.transformer = undefined;

    try {
      this.trackGenerator?.stop();
    } catch {
      /* ignore */
    }
    this.trackGenerator = undefined;
    this.processor = undefined;
    this.processedTrack = undefined;

    if (this.backgroundImage) {
      try {
        this.backgroundImage.close();
      } catch {
        /* ignore */
      }
    }
    this.backgroundImage = null;
    this.backgroundPath = null;
    this.hasLastProcessedOutput = false;
    this.lastMask = null;
    this.clearCanvases();
    this.source = undefined;
    noteCameraBackgroundProcessorActive(-1);
    markCameraBackgroundStage("processor_disposed", "isolated_destroy_done");
  }

  async switchTo(options: SwitchBackgroundProcessorOptions): Promise<void> {
    if (this.destroyed) return;
    this.mode = options.mode;
    if (options.mode === "background-blur") {
      this.blurRadius = options.blurRadius ?? CAMERA_BACKGROUND_BLUR_RADIUS;
      this.imagePath = undefined;
      this.loadEpoch += 1;
      if (this.backgroundImage) {
        this.backgroundImage.close();
        this.backgroundImage = null;
      }
      this.backgroundPath = null;
      return;
    }
    if (options.mode === "virtual-background") {
      this.imagePath = options.imagePath;
      await this.loadBackground(options.imagePath);
      return;
    }
    this.imagePath = undefined;
  }

  private async loadBackground(path: string): Promise<void> {
    if (this.backgroundPath === path && this.backgroundImage) return;
    const loadEpoch = ++this.loadEpoch;
    const img = new Image();
    img.crossOrigin = "anonymous";
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`bg_image_fail`));
        img.src = path;
      });
    } catch (err) {
      noteCameraBackgroundImageLoadError(
        err instanceof Error ? err.message : "bg_image_fail"
      );
      throw err;
    }
    if (this.destroyed || loadEpoch !== this.loadEpoch) {
      return;
    }
    const bitmap = await createImageBitmap(img);
    if (this.destroyed || loadEpoch !== this.loadEpoch) {
      bitmap.close();
      return;
    }
    if (this.backgroundImage) this.backgroundImage.close();
    this.backgroundImage = bitmap;
    this.backgroundPath = path;
  }

  private async transform(
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>
  ): Promise<void> {
    let passedThrough = false;
    const epoch = this.epoch;
    try {
      if (this.destroyed || !this.canvas || !this.ctx || !this.segmenter) {
        if (
          resolveSkippedBackgroundFrameOutput({
            mode: this.mode,
            hasLastProcessedFrame: this.hasLastProcessedOutput,
          }) === "repeat_last_processed"
        ) {
          this.enqueueLastProcessed(frame, controller);
          return;
        }
        if (this.mode === "disabled") {
          controller.enqueue(frame);
          passedThrough = true;
        }
        return;
      }
      if (frame.codedWidth === 0 || frame.codedHeight === 0) {
        return;
      }

      if (this.mode === "disabled") {
        controller.enqueue(frame);
        passedThrough = true;
        return;
      }

      const now = performance.now();
      if (
        shouldSkipHeavyCameraBackgroundFrame({
          now,
          nextFrameDue: this.nextFrameDue,
          firstFrameDone: this.firstFrameDone,
        })
      ) {
        const policy = resolveSkippedBackgroundFrameOutput({
          mode: this.mode,
          hasLastProcessedFrame: this.hasLastProcessedOutput,
        });
        if (policy === "repeat_last_processed") {
          noteCameraBackgroundPerfFrame({ processingTimeMs: 0, skipped: true });
          // Prefer re-composite with last mask on the *current* frame when possible.
          if (this.lastMask) {
            this.drawComposite(frame, this.lastMask, frame.displayWidth || frame.codedWidth, frame.displayHeight || frame.codedHeight);
            const out = new VideoFrame(this.canvas, {
              timestamp: frame.timestamp || Date.now(),
            });
            controller.enqueue(out);
            this.hasLastProcessedOutput = true;
          } else {
            this.enqueueLastProcessed(frame, controller);
          }
        }
        return;
      }

      const width = frame.displayWidth || frame.codedWidth;
      const height = frame.displayHeight || frame.codedHeight;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.hasLastProcessedOutput = false;
        this.lastMask = null;
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.workCanvas) {
          this.workCanvas.width = width;
          this.workCanvas.height = height;
        }
      }

      let segmentationTimeMs = 0;
      let segmented = false;
      const runSeg = shouldRunSegmentation({
        now,
        nextSegmentDue: this.nextSegmentDue,
        firstSegmentDone: this.firstSegmentDone,
      });

      if (runSeg) {
        const segStart = performance.now();
        const mask = await this.segmentFrame(frame, width, height, segStart);
        segmentationTimeMs = performance.now() - segStart;
        if (this.destroyed || epoch !== this.epoch || !this.canvas || !this.ctx) {
          if (this.hasLastProcessedOutput) {
            this.enqueueLastProcessed(frame, controller);
          }
          return;
        }
        if (mask) {
          const blended = blendCategoryMasks(
            this.lastMask,
            mask,
            CAMERA_BACKGROUND_MASK_TEMPORAL
          );
          this.lastMask = featherMaskBytes(
            blended,
            CAMERA_BACKGROUND_MASK_FEATHER
          );
          this.firstSegmentDone = true;
          segmented = true;
          this.nextSegmentDue = performance.now() + this.minSegmentIntervalMs;
        } else if (!this.lastMask) {
          // No mask yet — drop rather than flash camera.
          this.nextFrameDue = performance.now() + this.minFrameIntervalMs;
          return;
        }
      }

      if (!this.lastMask) {
        this.nextFrameDue = performance.now() + this.minFrameIntervalMs;
        return;
      }

      const filterStart = performance.now();
      this.drawComposite(frame, this.lastMask, width, height);
      const out = new VideoFrame(this.canvas, {
        timestamp: frame.timestamp || Date.now(),
      });
      controller.enqueue(out);
      this.hasLastProcessedOutput = true;
      const filterTimeMs = performance.now() - filterStart;
      this.nextFrameDue = performance.now() + this.minFrameIntervalMs;

      if (!this.firstFrameDone) {
        this.firstFrameDone = true;
        markCameraBackgroundStage(
          "first_frame_processed",
          `seg:${Math.round(segmentationTimeMs)}`
        );
      }

      const processingTimeMs = segmentationTimeMs + filterTimeMs;
      noteCameraBackgroundPerfFrame({
        processingTimeMs,
        segmentationTimeMs,
        segmented,
      });
      this.onFrameProcessed?.({
        processingTimeMs,
        segmentationTimeMs,
        filterTimeMs,
        segmented,
      });
    } catch (err) {
      recordCameraBackgroundDiag({
        type: "init_fail",
        detail: `frame:${err instanceof Error ? err.name : "err"}`,
        delegate: "CPU",
      });
      if (!passedThrough) {
        try {
          if (
            resolveSkippedBackgroundFrameOutput({
              mode: this.mode,
              hasLastProcessedFrame: this.hasLastProcessedOutput,
            }) === "repeat_last_processed"
          ) {
            this.enqueueLastProcessed(frame, controller);
          } else if (this.mode === "disabled") {
            controller.enqueue(frame);
            passedThrough = true;
          }
        } catch {
          /* stream closed */
        }
      }
    } finally {
      if (!passedThrough) {
        try {
          frame.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async segmentFrame(
    frame: VideoFrame,
    width: number,
    height: number,
    timestamp: number
  ): Promise<MaskBuffer | null> {
    if (!this.segmenter || !this.segCanvas || !this.segCtx) return null;
    const size = targetSegmentationSize(
      width,
      height,
      CAMERA_BACKGROUND_SEG_MAX_WIDTH
    );
    if (
      this.segCanvas.width !== size.width ||
      this.segCanvas.height !== size.height
    ) {
      this.segCanvas.width = size.width;
      this.segCanvas.height = size.height;
    }
    this.segCtx.drawImage(frame, 0, 0, size.width, size.height);

    return new Promise<MaskBuffer | null>((resolve, reject) => {
      try {
        if (this.destroyed || !this.segmenter) {
          resolve(null);
          return;
        }
        this.segmenter.segmentForVideo(this.segCanvas!, timestamp, (result) => {
          try {
            const category = result.categoryMask;
            if (!category) {
              result.close?.();
              resolve(null);
              return;
            }
            const raw = category.getAsUint8Array();
            const info: MaskBuffer = {
              bytes: raw.slice(),
              width: category.width,
              height: category.height,
            };
            category.close?.();
            result.close?.();
            resolve(info);
          } catch (err) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private enqueueLastProcessed(
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>
  ): void {
    if (!this.canvas || !this.hasLastProcessedOutput) return;
    const out = new VideoFrame(this.canvas, {
      timestamp: frame.timestamp || Date.now(),
    });
    controller.enqueue(out);
  }

  /**
   * Soft-alpha composite using feathered category mask.
   * Non-zero mask ≈ background (LiveKit / selfie_segmenter convention).
   */
  private drawComposite(
    frame: VideoFrame,
    mask: MaskBuffer,
    width: number,
    height: number
  ) {
    const ctx = this.ctx!;
    const work = this.workCtx!;

    if (this.mode === "background-blur") {
      work.save();
      work.filter = `blur(${Math.max(2, this.blurRadius)}px)`;
      work.drawImage(frame, 0, 0, width, height);
      work.filter = "none";
      work.restore();
    } else if (this.mode === "virtual-background" && this.backgroundImage) {
      work.drawImage(this.backgroundImage, 0, 0, width, height);
    } else {
      work.drawImage(frame, 0, 0, width, height);
    }

    ctx.drawImage(frame, 0, 0, width, height);

    const person = ctx.getImageData(0, 0, width, height);
    const background = work.getImageData(0, 0, width, height);
    const pd = person.data;
    const bd = background.data;
    const mw = mask.width;
    const mh = mask.height;
    const bytes = mask.bytes;

    for (let y = 0; y < height; y += 1) {
      const my = Math.min(mh - 1, Math.floor((y * mh) / height));
      for (let x = 0; x < width; x += 1) {
        const mx = Math.min(mw - 1, Math.floor((x * mw) / width));
        const mix = personMixFromMaskByte(bytes[my * mw + mx]!);
        if (mix >= 0.999) continue;
        const o = (y * width + x) * 4;
        if (mix <= 0.001) {
          pd[o] = bd[o]!;
          pd[o + 1] = bd[o + 1]!;
          pd[o + 2] = bd[o + 2]!;
          continue;
        }
        const inv = 1 - mix;
        pd[o] = Math.round(pd[o]! * mix + bd[o]! * inv);
        pd[o + 1] = Math.round(pd[o + 1]! * mix + bd[o + 1]! * inv);
        pd[o + 2] = Math.round(pd[o + 2]! * mix + bd[o + 2]! * inv);
      }
    }
    ctx.putImageData(person, 0, 0);
  }
}

/** Pure helper: backlog frames after a slow segmentation must not re-enter MediaPipe. */
export function shouldSkipHeavyCameraBackgroundFrame(input: {
  now: number;
  nextFrameDue: number;
  firstFrameDone: boolean;
}): boolean {
  return input.firstFrameDone && input.now < input.nextFrameDue;
}

export type SkippedBackgroundFrameOutput =
  | "passthrough_original"
  | "repeat_last_processed"
  | "drop";

export function resolveSkippedBackgroundFrameOutput(input: {
  mode: IsolatedBackgroundProcessorOptions["mode"] | string;
  hasLastProcessedFrame: boolean;
}): SkippedBackgroundFrameOutput {
  if (input.mode === "disabled") return "passthrough_original";
  if (input.hasLastProcessedFrame) return "repeat_last_processed";
  return "drop";
}

export function resolveMissingMaskFrameOutput(input: {
  hasLastProcessedFrame: boolean;
}): Exclude<SkippedBackgroundFrameOutput, "passthrough_original"> {
  return input.hasLastProcessedFrame ? "repeat_last_processed" : "drop";
}

export function createIsolatedBackgroundProcessor(
  options: IsolatedBackgroundProcessorOptions
): IsolatedBackgroundProcessor {
  return new IsolatedBackgroundProcessor(options);
}

export function isolatedProcessorSupportsEnvironment(
  globalObj: typeof globalThis = globalThis
): boolean {
  const g = globalObj as typeof globalThis & {
    MediaStreamTrackProcessor?: unknown;
    MediaStreamTrackGenerator?: unknown;
    VideoFrame?: unknown;
  };
  return (
    typeof g.MediaStreamTrackProcessor !== "undefined" &&
    typeof g.MediaStreamTrackGenerator !== "undefined" &&
    typeof g.VideoFrame !== "undefined" &&
    typeof document !== "undefined"
  );
}
