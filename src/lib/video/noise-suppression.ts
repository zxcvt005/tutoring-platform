/**
 * Шумоподавление микрофона через браузерные constraints getUserMedia.
 * Без платных SDK (Krisp и т.п.) — бесплатно, коммерчески допустимо.
 */

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

/** Браузер объявляет поддержку noiseSuppression в getSupportedConstraints. */
export function noiseSuppressionSupported(): boolean {
  return Boolean(supportedConstraintKeys().noiseSuppression);
}

/**
 * Собирает constraints только из реально поддерживаемых ключей.
 * Иначе один неподдерживаемый ключ валит весь applyConstraints.
 */
export function buildAudioProcessingConstraints(
  noiseSuppressionEnabled: boolean
): MediaTrackConstraints {
  const supported = supportedConstraintKeys();
  const out: MediaTrackConstraints = {};
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

export type ApplyNoiseResult = {
  ok: boolean;
  /** Фактическое значение noiseSuppression после попытки (если доступно). */
  appliedNoiseSuppression: boolean | null;
  reason?: "no_track" | "unsupported" | "apply_failed";
};

/** Применяет constraints к уже опубликованному аудио-треку. */
export async function applyNoiseSuppressionToTrack(
  track: MediaStreamTrack | null | undefined,
  enabled: boolean
): Promise<ApplyNoiseResult> {
  if (!track || track.kind !== "audio") {
    return {
      ok: false,
      appliedNoiseSuppression: null,
      reason: "no_track",
    };
  }
  if (!noiseSuppressionSupported()) {
    return {
      ok: false,
      appliedNoiseSuppression: null,
      reason: "unsupported",
    };
  }
  const constraints = buildAudioProcessingConstraints(enabled);
  if (!("noiseSuppression" in constraints)) {
    return {
      ok: false,
      appliedNoiseSuppression: null,
      reason: "unsupported",
    };
  }
  try {
    await track.applyConstraints(constraints);
    const settings = track.getSettings?.() ?? {};
    const applied =
      typeof settings.noiseSuppression === "boolean"
        ? settings.noiseSuppression
        : enabled;
    // Если браузер принял apply, но getSettings не отражает NS — всё равно
    // считаем успехом только когда запрошенное состояние совпало или неизвестно.
    if (
      typeof settings.noiseSuppression === "boolean" &&
      settings.noiseSuppression !== enabled
    ) {
      return {
        ok: false,
        appliedNoiseSuppression: settings.noiseSuppression,
        reason: "apply_failed",
      };
    }
    return { ok: true, appliedNoiseSuppression: applied };
  } catch {
    return {
      ok: false,
      appliedNoiseSuppression: null,
      reason: "apply_failed",
    };
  }
}
