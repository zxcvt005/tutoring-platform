import { afterEach, describe, expect, it } from "vitest";

import {
  clearCameraBackgroundDiag,
  getCameraBackgroundDiag,
  getCameraBackgroundPerfStats,
  noteCameraBackgroundAutoDisable,
  noteCameraBackgroundImageLoadError,
  noteCameraBackgroundPerfFrame,
  summarizeCameraBackgroundPerf,
} from "@/lib/video/camera-background";

afterEach(() => {
  clearCameraBackgroundDiag();
});

describe("camera background perf diagnostics", () => {
  it("tracks output/seg FPS, avg/max latency and skipped frames", () => {
    const started = Date.now() - 1000;
    noteCameraBackgroundPerfFrame({
      processingTimeMs: 20,
      segmentationTimeMs: 15,
      segmented: true,
    });
    noteCameraBackgroundPerfFrame({
      processingTimeMs: 30,
      segmentationTimeMs: 25,
      segmented: true,
    });
    noteCameraBackgroundPerfFrame({ processingTimeMs: 10, segmented: false });
    noteCameraBackgroundPerfFrame({ processingTimeMs: 0, skipped: true });
    noteCameraBackgroundAutoDisable("device too slow");
    noteCameraBackgroundImageLoadError("bg_image_fail");

    const raw = getCameraBackgroundPerfStats();
    raw.windowStartedAt = started;
    const snap = summarizeCameraBackgroundPerf(raw, started + 1000);
    expect(snap.outputFrames).toBe(3);
    expect(snap.segmentPasses).toBe(2);
    expect(snap.skippedFrames).toBe(1);
    expect(snap.avgSegmentationMs).toBe(20);
    expect(snap.maxSegmentationMs).toBe(25);
    expect(snap.avgProcessingMs).toBeCloseTo(20, 5);
    expect(snap.maxProcessingMs).toBe(30);
    expect(snap.outputFps).toBeCloseTo(3, 5);
    expect(snap.segmentationFps).toBeCloseTo(2, 5);
    expect(snap.lastAutoDisableReason).toContain("slow");
    expect(snap.lastBgLoadError).toBe("bg_image_fail");
    expect(
      getCameraBackgroundDiag().some((e) => e.type === "bg_image_fail")
    ).toBe(true);
  });
});
