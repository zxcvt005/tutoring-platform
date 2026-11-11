import { describe, expect, it } from "vitest";

import {
  blendCategoryMasks,
  featherMaskBytes,
  personMixFromMaskByte,
  shouldRunSegmentation,
  targetSegmentationSize,
} from "@/lib/video/camera-background-mask";

describe("camera background mask helpers", () => {
  it("blends temporally without emitting hard original/camera switches", () => {
    const prev = {
      bytes: new Uint8Array([0, 0, 255, 255]),
      width: 2,
      height: 2,
    };
    const next = {
      bytes: new Uint8Array([255, 0, 0, 255]),
      width: 2,
      height: 2,
    };
    const blended = blendCategoryMasks(prev, next, 0.5);
    expect(blended.bytes[0]).toBeGreaterThan(0);
    expect(blended.bytes[0]).toBeLessThan(255);
    expect(blended.bytes[1]).toBe(0);
  });

  it("feathers mask edges for softer person/background boundaries", () => {
    const mask = {
      bytes: new Uint8Array([0, 255, 0, 255]),
      width: 2,
      height: 2,
    };
    const feathered = featherMaskBytes(mask, 1);
    expect(feathered.bytes.some((b) => b > 0 && b < 255)).toBe(true);
  });

  it("maps mask bytes to soft person mix weights", () => {
    expect(personMixFromMaskByte(0)).toBe(1);
    expect(personMixFromMaskByte(255)).toBe(0);
    expect(personMixFromMaskByte(100)).toBeGreaterThan(0);
    expect(personMixFromMaskByte(100)).toBeLessThan(1);
  });

  it("separates segment cadence from first-frame force", () => {
    expect(
      shouldRunSegmentation({
        now: 10,
        nextSegmentDue: 100,
        firstSegmentDone: false,
      })
    ).toBe(true);
    expect(
      shouldRunSegmentation({
        now: 10,
        nextSegmentDue: 100,
        firstSegmentDone: true,
      })
    ).toBe(false);
    expect(
      shouldRunSegmentation({
        now: 120,
        nextSegmentDue: 100,
        firstSegmentDone: true,
      })
    ).toBe(true);
  });

  it("downscales long edge for MediaPipe input", () => {
    expect(targetSegmentationSize(1280, 720, 320)).toEqual({
      width: 320,
      height: 180,
    });
    expect(targetSegmentationSize(240, 180, 320)).toEqual({
      width: 240,
      height: 180,
    });
  });
});
