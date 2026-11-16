import { afterEach, describe, expect, it } from "vitest";

import { videoRoomOptions } from "@/lib/video/connect";

describe("videoRoomOptions", () => {
  const original = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });

  it("includes audioCaptureDefaults from noise suppression prefs", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getSupportedConstraints: () => ({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          }),
        },
      },
    });
    const opts = videoRoomOptions(true);
    expect(opts.audioCaptureDefaults).toEqual({
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    });
  });
});