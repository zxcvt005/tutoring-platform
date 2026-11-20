import { afterEach, describe, expect, it } from "vitest";

import { buildAudioCaptureDefaults } from "@/lib/video/noise-suppression";

describe("audio capture defaults", () => {
  const original = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });

  it("maps capture defaults for RoomOptions", () => {
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
    expect(buildAudioCaptureDefaults(false)).toEqual({
      noiseSuppression: false,
      echoCancellation: true,
      autoGainControl: true,
    });
  });

  it("omits unsupported constraint keys", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getSupportedConstraints: () => ({
            echoCancellation: true,
          }),
        },
      },
    });
    expect(buildAudioCaptureDefaults(true)).toEqual({
      echoCancellation: true,
    });
  });
});
