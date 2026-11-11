import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCameraBackgroundDiag } from "@/lib/video/camera-background";
import { resetCameraBackgroundStageStateForTests } from "@/lib/video/camera-background-stages";
import {
  IsolatedBackgroundProcessor,
  isolatedProcessorSupportsEnvironment,
  resolveMissingMaskFrameOutput,
  resolveSkippedBackgroundFrameOutput,
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

describe("skipped / missing-mask output policy", () => {
  it("never emits the original camera frame while an effect is active", () => {
    expect(
      resolveSkippedBackgroundFrameOutput({
        mode: "background-blur",
        hasLastProcessedFrame: true,
      })
    ).toBe("repeat_last_processed");
    expect(
      resolveSkippedBackgroundFrameOutput({
        mode: "virtual-background",
        hasLastProcessedFrame: true,
      })
    ).toBe("repeat_last_processed");
    expect(
      resolveSkippedBackgroundFrameOutput({
        mode: "background-blur",
        hasLastProcessedFrame: false,
      })
    ).toBe("drop");
  });

  it("allows raw passthrough only when the effect is disabled", () => {
    expect(
      resolveSkippedBackgroundFrameOutput({
        mode: "disabled",
        hasLastProcessedFrame: false,
      })
    ).toBe("passthrough_original");
    expect(
      resolveSkippedBackgroundFrameOutput({
        mode: "disabled",
        hasLastProcessedFrame: true,
      })
    ).toBe("passthrough_original");
  });

  it("holds the last composite when segmentation mask is missing", () => {
    expect(
      resolveMissingMaskFrameOutput({ hasLastProcessedFrame: true })
    ).toBe("repeat_last_processed");
    expect(
      resolveMissingMaskFrameOutput({ hasLastProcessedFrame: false })
    ).toBe("drop");
  });
});

type TransformHarness = {
  mode: string;
  firstFrameDone: boolean;
  nextFrameDue: number;
  hasLastProcessedOutput: boolean;
  destroyed: boolean;
  epoch: number;
  canvas: { width: number; height: number };
  ctx: object;
  workCtx?: object;
  segmenter: {
    segmentForVideo: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  minFrameIntervalMs: number;
  transform: (
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>
  ) => Promise<void>;
  enqueueLastProcessed: (
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>
  ) => void;
};

function asHarness(processor: IsolatedBackgroundProcessor): TransformHarness {
  return processor as unknown as TransformHarness;
}

function makeFrame(overrides?: Partial<{ timestamp: number; close: () => void }>) {
  const close = vi.fn(overrides?.close);
  return {
    codedWidth: 16,
    codedHeight: 16,
    displayWidth: 16,
    displayHeight: 16,
    timestamp: overrides?.timestamp ?? 1000,
    close,
  } as unknown as VideoFrame & { close: ReturnType<typeof vi.fn> };
}

describe("isolated background transform skip path", () => {
  it("reuses the last processed canvas instead of the original on FPS skip", async () => {
    const processor = new IsolatedBackgroundProcessor({
      mode: "background-blur",
      maxFps: 12,
    });
    const h = asHarness(processor);
    h.mode = "background-blur";
    h.firstFrameDone = true;
    h.nextFrameDue = Number.POSITIVE_INFINITY;
    h.hasLastProcessedOutput = true;
    h.destroyed = false;
    h.canvas = { width: 16, height: 16 };
    h.ctx = {};
    h.segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(),
    };
    h.minFrameIntervalMs = 80;

    const enqueued: VideoFrame[] = [];
    const controller = {
      enqueue: (frame: VideoFrame) => {
        enqueued.push(frame);
      },
    } as TransformStreamDefaultController<VideoFrame>;

    const created: Array<{ source: unknown; timestamp: number }> = [];
    class FakeVideoFrame {
      constructor(
        public source: unknown,
        init?: { timestamp?: number }
      ) {
        created.push({ source, timestamp: init?.timestamp ?? 0 });
      }
      close() {}
    }
    vi.stubGlobal("VideoFrame", FakeVideoFrame);

    const input = makeFrame({ timestamp: 4242 });
    await h.transform(input, controller);

    expect(h.segmenter.segmentForVideo).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0]?.source).toBe(h.canvas);
    expect(created[0]?.timestamp).toBe(4242);
    expect(enqueued[0]).not.toBe(input);
    expect(input.close).toHaveBeenCalledTimes(1);

    await processor.destroy();
  });

  it("drops skipped frames before the first composite instead of flashing the camera", async () => {
    const processor = new IsolatedBackgroundProcessor({
      mode: "virtual-background",
      maxFps: 12,
    });
    const h = asHarness(processor);
    h.mode = "virtual-background";
    h.firstFrameDone = true;
    h.nextFrameDue = Number.POSITIVE_INFINITY;
    h.hasLastProcessedOutput = false;
    h.destroyed = false;
    h.canvas = { width: 16, height: 16 };
    h.ctx = {};
    h.segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(),
    };

    const enqueued: VideoFrame[] = [];
    const controller = {
      enqueue: (frame: VideoFrame) => {
        enqueued.push(frame);
      },
    } as TransformStreamDefaultController<VideoFrame>;

    const input = makeFrame({ timestamp: 7 });
    await h.transform(input, controller);

    expect(h.segmenter.segmentForVideo).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(0);
    expect(input.close).toHaveBeenCalledTimes(1);

    await processor.destroy();
  });

  it("holds the last composite when segmentation is slow and backlog skips fire", async () => {
    const processor = new IsolatedBackgroundProcessor({
      mode: "background-blur",
      maxFps: 5,
    });
    const h = asHarness(processor);
    h.mode = "background-blur";
    h.firstFrameDone = true;
    h.hasLastProcessedOutput = true;
    h.destroyed = false;
    h.canvas = { width: 8, height: 8 };
    h.ctx = {};
    h.segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(),
    };
    // Simulate a long MediaPipe call that stamps nextFrameDue far ahead.
    h.nextFrameDue = performance.now() + 500;

    class FakeVideoFrame {
      constructor(
        _source: unknown,
        public init?: { timestamp?: number }
      ) {}
      close() {}
    }
    vi.stubGlobal("VideoFrame", FakeVideoFrame);

    const enqueued: VideoFrame[] = [];
    const controller = {
      enqueue: (frame: VideoFrame) => enqueued.push(frame),
    } as TransformStreamDefaultController<VideoFrame>;

    const frames = [makeFrame({ timestamp: 1 }), makeFrame({ timestamp: 2 }), makeFrame({ timestamp: 3 })];
    for (const frame of frames) {
      await h.transform(frame, controller);
    }

    expect(h.segmenter.segmentForVideo).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(3);
    for (const frame of frames) {
      expect(frame.close).toHaveBeenCalledTimes(1);
    }

    await processor.destroy();
  });

  it("re-composites with last mask when segmentation is throttled", async () => {
    const processor = new IsolatedBackgroundProcessor({
      mode: "background-blur",
      maxFps: 12,
    });
    const h = asHarness(processor);
    h.mode = "background-blur";
    h.firstFrameDone = true;
    h.nextFrameDue = Number.POSITIVE_INFINITY;
    h.hasLastProcessedOutput = true;
    h.destroyed = false;
    h.canvas = { width: 16, height: 16 };
    h.ctx = {
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
      putImageData: vi.fn(),
    };
    h.workCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
      filter: "none",
    };
    (
      processor as unknown as {
        lastMask: { bytes: Uint8Array; width: number; height: number };
      }
    ).lastMask = {
      bytes: new Uint8Array(4),
      width: 2,
      height: 2,
    };
    h.segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(),
    };

    class FakeVideoFrame {
      constructor(
        public source: unknown,
        public init?: { timestamp?: number }
      ) {}
      close() {}
    }
    vi.stubGlobal("VideoFrame", FakeVideoFrame);

    const enqueued: VideoFrame[] = [];
    const controller = {
      enqueue: (frame: VideoFrame) => enqueued.push(frame),
    } as TransformStreamDefaultController<VideoFrame>;

    const input = makeFrame({ timestamp: 99 });
    await h.transform(input, controller);

    expect(h.segmenter.segmentForVideo).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(1);
    expect((enqueued[0] as unknown as { source: unknown }).source).toBe(h.canvas);
    expect(input.close).toHaveBeenCalledTimes(1);

    await processor.destroy();
  });
});

describe("isolated background processor lifecycle", () => {
  it("closes MediaPipe segmenter before tearing down the pipe and clears the hold", async () => {
    const closeOrder: string[] = [];
    const segmenter = {
      segmentForVideo: vi.fn(),
      close: vi.fn(async () => {
        closeOrder.push("segmenter");
      }),
    };

    const processor = new IsolatedBackgroundProcessor({
      mode: "background-blur",
      maxFps: 8,
    });

    const h = asHarness(processor);
    h.segmenter = segmenter;
    h.hasLastProcessedOutput = true;
    (
      processor as unknown as { pipeAbort: AbortController }
    ).pipeAbort = new AbortController();
    const stop = vi.fn(() => {
      closeOrder.push("generator");
    });
    (
      processor as unknown as { trackGenerator: { stop: () => void } }
    ).trackGenerator = { stop };
    (
      processor as unknown as { backgroundImage: { close: () => void } | null }
    ).backgroundImage = {
      close: () => {
        closeOrder.push("bitmap");
      },
    };

    await processor.destroy();
    expect(closeOrder[0]).toBe("segmenter");
    expect(closeOrder).toContain("generator");
    expect(closeOrder).toContain("bitmap");
    expect(segmenter.close).toHaveBeenCalledTimes(1);
    expect(h.hasLastProcessedOutput).toBe(false);
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

    await processor.switchTo({ mode: "disabled" });
    expect((processor as unknown as { mode: string }).mode).toBe("disabled");
    await processor.destroy();
  });
});
