import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCameraBackgroundDiag } from "@/lib/video/camera-background";
import { resetCameraBackgroundStageStateForTests } from "@/lib/video/camera-background-stages";
import {
  IsolatedBackgroundProcessor,
  isolatedProcessorSupportsEnvironment,
  shouldSkipHeavyCameraBackgroundFrame,
} from "@/lib/video/isolated-background-processor";

afterEach(() => {
  clearCameraBackgroundDiag();
  resetCameraBackgroundStageStateForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isolated background processor environment", () => {
  it("requires insertable streams and VideoFrame", () => {
    expect(
      isolatedProcessorSupportsEnvironment({
        MediaStreamTrackProcessor: undefined,
        MediaStreamTrackGenerator: undefined,
        VideoFrame: undefined,
      } as unknown as typeof globalThis)
    ).toBe(false);
  });
});

describe("isolated background FPS backlog gate", () => {
  it("skips heavy work for frames that arrive before nextFrameDue", () => {
    expect(
      shouldSkipHeavyCameraBackgroundFrame({
        now: 100,
        nextFrameDue: 180,
        firstFrameDone: true,
      })
    ).toBe(true);
    expect(
      shouldSkipHeavyCameraBackgroundFrame({
        now: 200,
        nextFrameDue: 180,
        firstFrameDone: true,
      })
    ).toBe(false);
    expect(
      shouldSkipHeavyCameraBackgroundFrame({
        now: 50,
        nextFrameDue: 180,
        firstFrameDone: false,
      })
    ).toBe(false);
  });
});

describe("isolated background processor lifecycle", () => {
  it("closes MediaPipe segmenter before tearing down the pipe", async () => {
    const closeOrder: string[] = [];
    const segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(async () => {
        closeOrder.push("segmenter");
      }),
    };

    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: {
        forVisionTasks: async () => ({}),
      },
      ImageSegmenter: {
        createFromOptions: async () => segmenter,
      },
    }));

    // Re-import after mock is awkward with ESM; exercise destroy path directly.
    const processor = new IsolatedBackgroundProcessor({
      mode: "background-blur",
      maxFps: 8,
    });

    // Inject a fake segmenter as if init completed.
    (
      processor as unknown as { segmenter: typeof segmenter; destroyed: boolean }
    ).segmenter = segmenter;
    (
      processor as unknown as { pipeAbort: AbortController }
    ).pipeAbort = new AbortController();
    const stop = vi.fn(() => {
      closeOrder.push("generator");
    });
    (
      processor as unknown as { trackGenerator: { stop: () => void } }
    ).trackGenerator = { stop };

    await processor.destroy();
    expect(closeOrder[0]).toBe("segmenter");
    expect(closeOrder).toContain("generator");
    expect(segmenter.close).toHaveBeenCalledTimes(1);
  });

  it("switchTo updates blur and image modes without recreating the class", async () => {
    const processor = new IsolatedBackgroundProcessor({
      mode: "disabled",
      maxFps: 8,
    });
    await processor.switchTo({ mode: "background-blur", blurRadius: 12 });
    expect(
      (processor as unknown as { mode: string; blurRadius: number }).mode
    ).toBe("background-blur");
    expect(
      (processor as unknown as { blurRadius: number }).blurRadius
    ).toBe(12);

    // Avoid network image load in unit test: virtual-background path loads Image.
    // Only assert disabled switch stays local.
    await processor.switchTo({ mode: "disabled" });
    expect((processor as unknown as { mode: string }).mode).toBe("disabled");
    await processor.destroy();
  });
});
