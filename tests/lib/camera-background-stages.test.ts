import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMERA_BACKGROUND_STAGE_STORAGE_KEY,
  abortCameraBackgroundStageRun,
  beginCameraBackgroundStageRun,
  completeCameraBackgroundStageRun,
  consumeCameraBackgroundCrashReport,
  lastCameraBackgroundStage,
  markCameraBackgroundStage,
  noteCameraBackgroundProcessorActive,
  noteCameraBackgroundSegmenterCreated,
  readCameraBackgroundStageSnapshot,
  resetCameraBackgroundStageStateForTests,
  summarizeCameraBackgroundCrash,
} from "@/lib/video/camera-background-stages";
import { probeCameraBackgroundWebGl } from "@/lib/video/camera-background-webgl";
import { clearCameraBackgroundDiag } from "@/lib/video/camera-background";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  clearCameraBackgroundDiag();
  resetCameraBackgroundStageStateForTests();
  vi.unstubAllGlobals();
});

function stubStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  });
}

describe("camera background durable stages", () => {
  it("persists stages and detects an incomplete crash run after reload", () => {
    stubStorage();
    beginCameraBackgroundStageRun("blur");
    markCameraBackgroundStage("camera_acquired");
    markCameraBackgroundStage("processor_created");
    markCameraBackgroundStage("mediapipe_initialized", "cpu_ok");
    noteCameraBackgroundSegmenterCreated();
    noteCameraBackgroundProcessorActive(1);

    const mid = readCameraBackgroundStageSnapshot();
    expect(mid?.crashedLikely).toBe(true);
    expect(mid?.completed).toBe(false);
    expect(lastCameraBackgroundStage(mid)).toBe("mediapipe_initialized");

    // Simulate tab death: JS context gone, storage kept.
    const crash = consumeCameraBackgroundCrashReport();
    expect(crash).not.toBeNull();
    expect(summarizeCameraBackgroundCrash(crash!)).toContain(
      "mediapipe_initialized"
    );
    expect(memory.has(CAMERA_BACKGROUND_STAGE_STORAGE_KEY)).toBe(false);
  });

  it("clears crash flag when dispose completes", () => {
    stubStorage();
    beginCameraBackgroundStageRun("blur");
    markCameraBackgroundStage("first_frame_processed");
    completeCameraBackgroundStageRun("dispose");
    expect(consumeCameraBackgroundCrashReport()).toBeNull();
  });

  it("abort marks run completed without crash", () => {
    stubStorage();
    beginCameraBackgroundStageRun("blur");
    abortCameraBackgroundStageRun("init_fail");
    expect(consumeCameraBackgroundCrashReport()).toBeNull();
  });
});

describe("camera background webgl probe", () => {
  it("reports missing float buffers as unsafe for MediaPipe GPU", () => {
    const canvas = {
      getContext: () => ({
        getExtension: (name: string) =>
          name === "WEBGL_lose_context" ? { loseContext: () => undefined } : null,
      }),
    };
    const probe = probeCameraBackgroundWebGl({
      createElement: () => canvas as unknown as HTMLCanvasElement,
    });
    expect(probe.webgl2).toBe(true);
    expect(probe.mediapipeGpuSafe).toBe(false);
    expect(probe.detail).toBe("float_buffers_missing");
  });

  it("accepts half-float color buffer as safe", () => {
    const canvas = {
      getContext: () => ({
        getExtension: (name: string) => {
          if (name === "EXT_color_buffer_half_float") return {};
          if (name === "WEBGL_lose_context") {
            return { loseContext: () => undefined };
          }
          return null;
        },
      }),
    };
    const probe = probeCameraBackgroundWebGl({
      createElement: () => canvas as unknown as HTMLCanvasElement,
    });
    expect(probe.mediapipeGpuSafe).toBe(true);
    expect(probe.detail).toBe("half_float_ok");
  });
});
