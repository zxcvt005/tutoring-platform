import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraBackgroundController } from "@/lib/video/camera-background-controller";
import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_CPU_MAX_FPS,
  CAMERA_BACKGROUND_IMAGES,
  CAMERA_BACKGROUND_INIT_FAIL_MESSAGE,
  CAMERA_BACKGROUND_MAX_FPS,
  CAMERA_BACKGROUND_REQUIRED_ASSET_URLS,
  CAMERA_BACKGROUND_SLOW_FRAMES,
  CAMERA_BACKGROUND_WARMUP_FRAMES,
  EMPTY_SLOW_FRAME_WATCH,
  cameraBackgroundChoicesEqual,
  cameraBackgroundImageById,
  classifyCameraBackgroundInitError,
  clearCameraBackgroundAssetProbeCache,
  clearCameraBackgroundDiag,
  detectCameraBackgroundCapabilities,
  getCameraBackgroundDiag,
  isCameraBackgroundActive,
  maxFpsForDelegate,
  noteProcessedFrame,
  probeCameraBackgroundAssets,
  recordCameraBackgroundDiag,
  shouldAutoDisableBackground,
  shouldShowCameraBackground,
  shouldSkipCpuFallbackAfterGpuFailure,
} from "@/lib/video/camera-background";
import type { LocalVideoTrack } from "livekit-client";
import type { CameraBackgroundProcessorHandle } from "@/lib/video/camera-background-controller";

afterEach(() => {
  clearCameraBackgroundDiag();
  clearCameraBackgroundAssetProbeCache();
});

describe("camera background catalog", () => {
  it("lists every still from public/images/video/backgrounds", () => {
    expect(CAMERA_BACKGROUND_IMAGES.map((item) => item.src)).toEqual([
      "/images/video/backgrounds/background1.png",
      "/images/video/backgrounds/background2.png",
      "/images/video/backgrounds/background3.png",
      "/images/video/backgrounds/backgroun4.png",
      "/images/video/backgrounds/background5.png",
      "/images/video/backgrounds/background6.png",
      "/images/video/backgrounds/background7.png",
    ]);
    expect(cameraBackgroundImageById("background4")?.src).toContain("backgroun4");
    expect(cameraBackgroundImageById("missing")).toBeUndefined();
  });

  it("treats off as inactive and compares session choices", () => {
    expect(isCameraBackgroundActive({ type: "off" })).toBe(false);
    expect(isCameraBackgroundActive({ type: "blur" })).toBe(true);
    expect(
      cameraBackgroundChoicesEqual({ type: "blur" }, { type: "blur" })
    ).toBe(true);
    expect(
      cameraBackgroundChoicesEqual(
        { type: "image", id: "background1" },
        { type: "image", id: "background2" }
      )
    ).toBe(false);
  });
});

describe("camera background support", () => {
  it("hides the control on iPhone even if processors exist", () => {
    expect(
      shouldShowCameraBackground({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        supportsProcessors: true,
      })
    ).toBe(false);
  });

  it("shows the control on desktop Chrome when processors are supported", () => {
    expect(
      shouldShowCameraBackground({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
        supportsProcessors: true,
      })
    ).toBe(true);
    expect(
      shouldShowCameraBackground({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
        supportsProcessors: false,
      })
    ).toBe(false);
  });

  it("reports capability flags without inventing unsupported APIs", () => {
    expect(
      detectCameraBackgroundCapabilities({
        supportsProcessors: true,
        supportsModernApi: true,
        hasWebGL2: true,
      })
    ).toEqual({
      processors: true,
      modernApi: true,
      webgl2: true,
      offscreenCanvas: true,
      videoFrame: true,
    });
    expect(
      detectCameraBackgroundCapabilities({
        supportsProcessors: false,
        hasWebGL2: false,
        hasOffscreenCanvas: false,
        hasVideoFrame: false,
      }).processors
    ).toBe(false);
  });
});

describe("camera background slow-frame watch", () => {
  it("ignores warmup frames then trips after consecutive slow samples", () => {
    let watch = EMPTY_SLOW_FRAME_WATCH;
    for (let i = 0; i < CAMERA_BACKGROUND_WARMUP_FRAMES; i += 1) {
      watch = noteProcessedFrame(watch, 200);
    }
    expect(shouldAutoDisableBackground(watch)).toBe(false);
    for (let i = 0; i < CAMERA_BACKGROUND_SLOW_FRAMES - 1; i += 1) {
      watch = noteProcessedFrame(watch, 120);
    }
    expect(shouldAutoDisableBackground(watch)).toBe(false);
    watch = noteProcessedFrame(watch, 120);
    expect(shouldAutoDisableBackground(watch)).toBe(true);
    watch = noteProcessedFrame(watch, 10);
    expect(shouldAutoDisableBackground(watch)).toBe(false);
  });
});

describe("camera background local assets", () => {
  it("keeps MediaPipe wasm and the selfie model in public/", () => {
    const root = process.cwd();
    const publicPath = (src: string) =>
      path.join(root, "public", src.replace(/^\//, ""));
    expect(existsSync(publicPath(CAMERA_BACKGROUND_ASSETS.modelAssetPath))).toBe(
      true
    );
    for (const url of CAMERA_BACKGROUND_REQUIRED_ASSET_URLS) {
      expect(existsSync(publicPath(url))).toBe(true);
    }
    for (const image of CAMERA_BACKGROUND_IMAGES) {
      expect(existsSync(publicPath(image.src))).toBe(true);
    }
  });
});

describe("camera background asset probe and diagnostics", () => {
  it("probes assets via HEAD and caches the result", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const first = await probeCameraBackgroundAssets(fetchImpl as typeof fetch);
    expect(first.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(
      CAMERA_BACKGROUND_REQUIRED_ASSET_URLS.length
    );
    const second = await probeCameraBackgroundAssets(fetchImpl as typeof fetch);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(
      CAMERA_BACKGROUND_REQUIRED_ASSET_URLS.length
    );
  });

  it("falls back to Range GET when HEAD is not allowed", async () => {
    clearCameraBackgroundAssetProbeCache();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 405 });
      return new Response(new Uint8Array([1]), { status: 206 });
    });
    const result = await probeCameraBackgroundAssets(
      fetchImpl as unknown as typeof fetch,
      ["/video-processors/selfie_segmenter.tflite"]
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("records safe diag events without payload media", () => {
    recordCameraBackgroundDiag({
      type: "init_ok",
      ms: 42,
      delegate: "GPU",
      detail: "background-blur",
    });
    const events = getCameraBackgroundDiag();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("init_ok");
    expect(events[0]?.ms).toBe(42);
    expect(JSON.stringify(events[0])).not.toMatch(/videoframe|bitmap|base64/i);
  });

  it("classifies init errors and picks FPS by delegate", () => {
    expect(classifyCameraBackgroundInitError(new Error("Failed to fetch wasm")))
      .toMatchObject({ kind: "asset" });
    expect(
      classifyCameraBackgroundInitError(new Error("WebGL context lost"))
    ).toMatchObject({ kind: "gpu" });
    expect(maxFpsForDelegate("GPU")).toBe(CAMERA_BACKGROUND_MAX_FPS);
    expect(maxFpsForDelegate("CPU")).toBe(CAMERA_BACKGROUND_CPU_MAX_FPS);
    expect(shouldSkipCpuFallbackAfterGpuFailure("gpu")).toBe(true);
    expect(shouldSkipCpuFallbackAfterGpuFailure("generic")).toBe(false);
  });
});

function mockTrack() {
  let processor: CameraBackgroundProcessorHandle | null = null;
  const track = {
    mediaStreamTrack: {
      id: "cam-test",
      applyConstraints: vi.fn(async () => undefined),
    },
    getProcessor: () => processor,
    setProcessor: vi.fn(async (next: CameraBackgroundProcessorHandle) => {
      processor = next;
    }),
    stopProcessor: vi.fn(async () => {
      processor = null;
    }),
  };
  return track as unknown as LocalVideoTrack & {
    setProcessor: ReturnType<typeof vi.fn>;
    stopProcessor: ReturnType<typeof vi.fn>;
  };
}

function mockProcessor() {
  return {
    switchTo: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  } as CameraBackgroundProcessorHandle;
}

describe("camera background controller", () => {
  it("rejects unknown image ids without attaching a processor", async () => {
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({ ok: true, missing: [] }),
      createProcessor: () => {
        throw new Error("should not create");
      },
    });
    controller.setDesired({ type: "image", id: "missing" });
    expect(controller.getChoice()).toEqual({ type: "off" });
    await controller.dispose();
  });

  it("attaches blur via isolated CPU processor and tears down on dispose", async () => {
    const track = mockTrack();
    const created: Array<{ mode?: string; maxFps?: number }> = [];
    const processor = mockProcessor();
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({ ok: true, missing: [] }),
      createProcessor: (options) => {
        created.push(options);
        return processor;
      },
    });

    controller.setDesired({ type: "blur" });
    const result = await controller.applyTo(track);
    expect(result.ok).toBe(true);
    expect(result.delegate).toBe("CPU");
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(created[0]?.mode).toBe("background-blur");
    expect(created[0]?.maxFps).toBe(CAMERA_BACKGROUND_CPU_MAX_FPS);
    expect(
      getCameraBackgroundDiag().some((e) => e.type === "architecture")
    ).toBe(false); // architecture is recorded inside real IsolatedBackgroundProcessor.init

    await controller.dispose();
    expect(track.stopProcessor).toHaveBeenCalled();
    expect(controller.getChoice()).toEqual({ type: "off" });
  });

  it("soft-fails once on isolated init errors without a second MediaPipe load", async () => {
    const track = mockTrack();
    let creates = 0;
    const failures: string[] = [];
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({ ok: true, missing: [] }),
      createProcessor: () => {
        creates += 1;
        throw new Error("WebGL context lost");
      },
    });
    controller.onFailure = (message) => failures.push(message);

    controller.setDesired({ type: "blur" });
    const fail = await controller.applyTo(track);
    expect(fail.ok).toBe(false);
    expect(creates).toBe(1);
    expect(failures[0]).toBe(CAMERA_BACKGROUND_INIT_FAIL_MESSAGE);
    expect(track.setProcessor).not.toHaveBeenCalled();
    await controller.dispose();
  });

  it("soft-fails on missing assets without throwing", async () => {
    const track = mockTrack();
    const failures: string[] = [];
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({
        ok: false,
        missing: ["/video-processors/selfie_segmenter.tflite"],
      }),
      createProcessor: () => {
        throw new Error("should not create");
      },
    });
    controller.onFailure = (message) => failures.push(message);
    controller.setDesired({ type: "image", id: "background1" });
    const result = await controller.applyTo(track);
    expect(result.ok).toBe(false);
    expect(result.choice).toEqual({ type: "off" });
    expect(failures).toHaveLength(1);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it("reuses switchTo when changing effects and drops superseded concurrent applies", async () => {
    const track = mockTrack();
    const processor = mockProcessor();
    let creates = 0;
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({ ok: true, missing: [] }),
      createProcessor: () => {
        creates += 1;
        return processor;
      },
    });

    controller.setDesired({ type: "blur" });
    await controller.applyTo(track);
    await controller.setChoice({ type: "image", id: "background1" });
    expect(creates).toBe(1);
    expect(processor.switchTo).toHaveBeenCalledWith({
      mode: "virtual-background",
      imagePath: "/images/video/backgrounds/background1.png",
    });

    const p1 = controller.setChoice({ type: "blur" });
    const p2 = controller.setChoice({ type: "image", id: "background2" });
    const p3 = controller.setChoice({ type: "off" });
    await Promise.all([p1, p2, p3]);
    expect(creates).toBe(1);
    expect(controller.getChoice()).toEqual({ type: "off" });
    expect(
      getCameraBackgroundDiag().some((e) => e.detail === "superseded")
    ).toBe(true);
  });

  it("ignores late apply after dispose", async () => {
    const track = mockTrack();
    let creates = 0;
    const controller = new CameraBackgroundController({
      supportsProcessors: () => true,
      probeAssets: async () => ({ ok: true, missing: [] }),
      createProcessor: () => {
        creates += 1;
        return mockProcessor();
      },
    });
    controller.setDesired({ type: "blur" });
    const applyPromise = controller.applyTo(track);
    const disposePromise = controller.dispose();
    await Promise.all([applyPromise, disposePromise]);
    expect(controller.getChoice()).toEqual({ type: "off" });
    const late = await controller.applyTo(track);
    expect(late.choice).toEqual({ type: "off" });
    expect(creates).toBeLessThanOrEqual(1);
  });
});
