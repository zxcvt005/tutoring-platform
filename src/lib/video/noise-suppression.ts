/**
 * Браузерные audio constraints для LiveKit capture (getUserMedia).
 * Без отдельных процессоров и без runtime restartTrack.
 */

import type { AudioCaptureOptions } from "livekit-client";

export type NoiseSuppressionConstraints = {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
};

export const DEFAULT_CALL_AUDIO_CONSTRAINTS: NoiseSuppressionConstraints = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

function supportedConstraintKeys(): MediaTrackSupportedConstraints {
  if (typeof navigator === "undefined") return {};
  return (
    navigator.mediaDevices?.getSupportedConstraints?.() ??
    ({} as MediaTrackSupportedConstraints)
  );
}

/** Defaults для RoomOptions.audioCaptureDefaults (LiveKit capture time). */
export function buildAudioCaptureDefaults(
  noiseSuppressionEnabled: boolean = DEFAULT_CALL_AUDIO_CONSTRAINTS.noiseSuppression
): AudioCaptureOptions {
  const supported = supportedConstraintKeys();
  const out: AudioCaptureOptions = {};
  if (supported.noiseSuppression) {
    out.noiseSuppression = noiseSuppressionEnabled;
  }
  if (supported.echoCancellation) {
    out.echoCancellation = true;
  }
  if (supported.autoGainControl) {
    out.autoGainControl = true;
  }
  return out;
}
