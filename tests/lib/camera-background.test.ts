import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CameraBackgroundController } from "@/lib/video/camera-background-controller";
import {
  CAMERA_BACKGROUND_ASSETS,
  CAMERA_BACKGROUND_IMAGES,
  CAMERA_BACKGROUND_SLOW_FRAMES,
  CAMERA_BACKGROUND_WARMUP_FRAMES,
  EMPTY_SLOW_FRAME_WATCH,
  cameraBackgroundChoicesEqual,
  cameraBackgroundImageById,
  isCameraBackgroundActive,
  noteProcessedFrame,
  shouldAutoDisableBackground,
  shouldShowCameraBackground,
} from "@/lib/video/camera-background";

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
    const publicPath = (src: string) => path.join(root, "public", src.replace(/^\//, ""));
    expect(existsSync(publicPath(CAMERA_BACKGROUND_ASSETS.modelAssetPath))).toBe(true);
    expect(
      existsSync(path.join(publicPath(CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet), "vision_wasm_internal.wasm"))
    ).toBe(true);
    expect(
      existsSync(
        path.join(publicPath(CAMERA_BACKGROUND_ASSETS.tasksVisionFileSet), "vision_wasm_nosimd_internal.wasm")
      )
    ).toBe(true);
    for (const image of CAMERA_BACKGROUND_IMAGES) {
      expect(existsSync(publicPath(image.src))).toBe(true);
    }
  });
});

describe("camera background controller", () => {
  it("rejects unknown image ids without attaching a processor", async () => {
    const controller = new CameraBackgroundController();
    controller.setDesired({ type: "image", id: "missing" });
    expect(controller.getChoice()).toEqual({ type: "off" });
    await controller.dispose();
  });
});
