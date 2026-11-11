import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyNoiseSuppressionToTrack,
  buildAudioProcessingConstraints,
  noiseSuppressionSupported,
} from "@/lib/video/noise-suppression";

describe("noise suppression helpers", () => {
  const original = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });

  it("reports unsupported without mediaDevices", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    expect(noiseSuppressionSupported()).toBe(false);
    expect(buildAudioProcessingConstraints(true)).toEqual({});
  });

  it("builds only supported constraint keys", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getSupportedConstraints: () => ({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: false,
          }),
        },
      },
    });
    expect(buildAudioProcessingConstraints(false)).toEqual({
      noiseSuppression: false,
      echoCancellation: true,
    });
  });

  it("does not flip UI success when applyConstraints fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getSupportedConstraints: () => ({ noiseSuppression: true }),
        },
      },
    });
    const track = {
      kind: "audio",
      applyConstraints: vi.fn().mockRejectedValue(new Error("fail")),
      getSettings: () => ({}),
    } as unknown as MediaStreamTrack;
    const result = await applyNoiseSuppressionToTrack(track, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("apply_failed");
  });

  it("rejects when getSettings contradicts requested noiseSuppression", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getSupportedConstraints: () => ({ noiseSuppression: true }),
        },
      },
    });
    const track = {
      kind: "audio",
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getSettings: () => ({ noiseSuppression: false }),
    } as unknown as MediaStreamTrack;
    const result = await applyNoiseSuppressionToTrack(track, true);
    expect(result.ok).toBe(false);
    expect(result.appliedNoiseSuppression).toBe(false);
  });
});
