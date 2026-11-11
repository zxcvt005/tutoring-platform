/**
 * Pure mask helpers for IsolatedBackgroundProcessor.
 * Kept free of DOM so Node vitest can cover temporal/feather logic.
 */

export type MaskBuffer = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

/** EMA blend of category masks (same size). Higher alpha = trust new mask more. */
export function blendCategoryMasks(
  previous: MaskBuffer | null,
  next: MaskBuffer,
  alpha: number
): MaskBuffer {
  const a = Math.min(1, Math.max(0, alpha));
  if (!previous || previous.width !== next.width || previous.height !== next.height) {
    return {
      bytes: next.bytes.slice(),
      width: next.width,
      height: next.height,
    };
  }
  const out = new Uint8Array(next.bytes.length);
  const inv = 1 - a;
  for (let i = 0; i < next.bytes.length; i += 1) {
    const blended = previous.bytes[i]! * inv + next.bytes[i]! * a;
    // Keep binary-ish categories but soft midtones for feathering.
    out[i] = blended >= 128 ? 255 : blended <= 16 ? 0 : Math.round(blended);
  }
  return { bytes: out, width: next.width, height: next.height };
}

/**
 * Soft edge weight in [0,1]: 1 = full person (keep camera), 0 = full background.
 * MediaPipe selfie category: non-zero ≈ background (LiveKit convention).
 */
export function personMixFromMaskByte(byte: number): number {
  // Soft ramp around person/background boundary instead of hard cut.
  if (byte <= 24) return 1;
  if (byte >= 200) return 0;
  return 1 - (byte - 24) / (200 - 24);
}

/** Box-blur a single-channel mask for feathered edges (separable-ish 3×3). */
export function featherMaskBytes(
  mask: MaskBuffer,
  radius: number
): MaskBuffer {
  const r = Math.max(0, Math.min(3, Math.floor(radius)));
  if (r <= 0) {
    return { bytes: mask.bytes.slice(), width: mask.width, height: mask.height };
  }
  const { width: w, height: h, bytes: src } = mask;
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  // Horizontal
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const xx = Math.min(w - 1, Math.max(0, x + dx));
        sum += src[y * w + xx]!;
        n += 1;
      }
      tmp[y * w + x] = Math.round(sum / n);
    }
  }
  // Vertical
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        sum += tmp[yy * w + x]!;
        n += 1;
      }
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return { bytes: out, width: w, height: h };
}

export function shouldRunSegmentation(input: {
  now: number;
  nextSegmentDue: number;
  firstSegmentDone: boolean;
}): boolean {
  if (!input.firstSegmentDone) return true;
  return input.now >= input.nextSegmentDue;
}

export function targetSegmentationSize(
  frameWidth: number,
  frameHeight: number,
  maxWidth: number
): { width: number; height: number } {
  const mw = Math.max(64, maxWidth);
  if (frameWidth <= mw) {
    return {
      width: Math.max(2, frameWidth),
      height: Math.max(2, frameHeight),
    };
  }
  const scale = mw / frameWidth;
  return {
    width: Math.max(2, Math.round(frameWidth * scale)),
    height: Math.max(2, Math.round(frameHeight * scale)),
  };
}
