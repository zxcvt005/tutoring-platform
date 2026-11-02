import {
  BackgroundProcessor,
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import type { LocalVideoTrack } from "livekit-client";

import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_BLUR_RADIUS,
  CAMERA_BACKGROUND_MAX_FPS,
  CAMERA_BACKGROUND_SLOW_MESSAGE,
  EMPTY_SLOW_FRAME_WATCH,
  cameraBackgroundImageById,
  isCameraBackgroundActive,
  noteProcessedFrame,
  shouldAutoDisableBackground,
  type CameraBackgroundChoice,
  type SlowFrameWatch,
} from "@/lib/video/camera-background";

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

export class CameraBackgroundController {
  private choice: CameraBackgroundChoice = { type: "off" };
  private processor: BackgroundProcessorWrapper | null = null;
  private track: LocalVideoTrack | null = null;
  private queue: Promise<void> = Promise.resolve();
  private watch: SlowFrameWatch = EMPTY_SLOW_FRAME_WATCH;
  private disabling = false;

  onAutoOff: ((message: string) => void) | null = null;

  getChoice(): CameraBackgroundChoice {
    return this.choice;
  }

  setDesired(choice: CameraBackgroundChoice) {
    this.choice =
      choice.type === "image" && !cameraBackgroundImageById(choice.id)
        ? { type: "off" }
        : choice;
  }

  setChoice(choice: CameraBackgroundChoice): Promise<void> {
    this.setDesired(choice);
    return this.applyTo(this.track);
  }

  applyTo(track: LocalVideoTrack | null | undefined): Promise<void> {
    const next = track ?? null;
    this.queue = this.queue.then(
      () => this.run(next),
      () => this.run(next)
    );
    return this.queue;
  }

  release(track: LocalVideoTrack | null | undefined): Promise<void> {
    const target = track ?? null;
    this.queue = this.queue.then(async () => {
      if (!target || this.track !== target) return;
      await this.detachFrom(target);
      this.track = null;
      this.processor = null;
      this.watch = EMPTY_SLOW_FRAME_WATCH;
    });
    return this.queue;
  }

  dispose(): Promise<void> {
    this.choice = { type: "off" };
    return this.applyTo(null);
  }

  private async run(track: LocalVideoTrack | null): Promise<void> {
    if (this.track && this.track !== track) {
      await this.detachFrom(this.track);
    }
    this.track = track;
    if (!track || !isCameraBackgroundActive(this.choice)) {
      await this.detachFrom(track);
      this.processor = null;
      this.watch = EMPTY_SLOW_FRAME_WATCH;
      return;
    }
    const options = switchOptionsFor(this.choice);
    if (!options || options.mode === "disabled") {
      await this.detachFrom(track);
      this.processor = null;
      return;
    }
    const current = track.getProcessor();
    if (this.processor && current === this.processor) {
      await this.processor.switchTo(options);
      return;
    }
    if (current) {
      await track.stopProcessor();
    }
    this.watch = EMPTY_SLOW_FRAME_WATCH;
    try {
      this.processor = BackgroundProcessor({
        ...options,
        assetPaths: CAMERA_BACKGROUND_ASSETS,
        maxFps: CAMERA_BACKGROUND_MAX_FPS,
        onFrameProcessed: (stats) => this.onFrame(stats.processingTimeMs),
      });
      await track.setProcessor(this.processor, true);
    } catch (err) {
      this.processor = null;
      this.choice = { type: "off" };
      await this.detachFrom(track);
      throw err;
    }
  }

  private async detachFrom(track: LocalVideoTrack | null): Promise<void> {
    if (!track) return;
    try {
      if (track.getProcessor()) {
        await track.stopProcessor();
      }
    } catch {
      /* трек уже остановлен вместе с процессором */
    }
  }

  private onFrame(processingTimeMs: number) {
    if (this.disabling) return;
    this.watch = noteProcessedFrame(this.watch, processingTimeMs);
    if (!shouldAutoDisableBackground(this.watch)) return;
    this.disabling = true;
    this.choice = { type: "off" };
    void this.applyTo(this.track).finally(() => {
      this.disabling = false;
      this.onAutoOff?.(CAMERA_BACKGROUND_SLOW_MESSAGE);
    });
  }
}
