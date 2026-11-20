/**
 * Прямая публикация камеры/микрофона через LiveKit без промежуточных процессоров.
 */

import { Room, Track } from "livekit-client";

export type LocalMediaWant = {
  microphone: boolean;
  camera: boolean;
};

export async function setLocalMediaEnabled(
  room: Room,
  want: LocalMediaWant
): Promise<void> {
  await room.localParticipant.setMicrophoneEnabled(want.microphone);
  await room.localParticipant.setCameraEnabled(want.camera);
}

export function localMediaStatus(room: Room): {
  micEnabled: boolean;
  cameraEnabled: boolean;
  micTrack: boolean;
  cameraTrack: boolean;
} {
  const micPub = room.localParticipant.getTrackPublication(
    Track.Source.Microphone
  );
  const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  return {
    micEnabled: room.localParticipant.isMicrophoneEnabled,
    cameraEnabled: room.localParticipant.isCameraEnabled,
    micTrack: Boolean(micPub?.track),
    cameraTrack: Boolean(camPub?.track),
  };
}

/**
 * После set*Enabled сверяет фактическое состояние с желаемым.
 * Возвращает текст ошибки или null, если всё согласовано.
 */
export function localMediaMismatch(
  room: Room,
  want: LocalMediaWant
): string | null {
  const status = localMediaStatus(room);
  if (want.microphone && !status.micEnabled) {
    return "Микрофон не включился после публикации";
  }
  if (want.microphone && !status.micTrack) {
    return "Микрофон включён, но аудио-трек не опубликован";
  }
  if (!want.microphone && status.micEnabled) {
    return "Микрофон остался включённым";
  }
  if (want.camera && !status.cameraEnabled) {
    return "Камера не включилась после публикации";
  }
  if (want.camera && !status.cameraTrack) {
    return "Камера включена, но видео-трек не опубликован";
  }
  if (!want.camera && status.cameraEnabled) {
    return "Камера осталась включённой";
  }
  return null;
}

/** Ждёт, пока локальные треки совпадут с желаемым состоянием. */
export async function waitForLocalMedia(
  room: Room,
  want: LocalMediaWant,
  timeoutMs = 2500
): Promise<string | null> {
  const started = Date.now();
  let last = localMediaMismatch(room, want);
  while (last && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    last = localMediaMismatch(room, want);
  }
  return last;
}

/** Публикует и подтверждает, что треки реально поднялись. */
export async function publishLocalMedia(
  room: Room,
  want: LocalMediaWant
): Promise<void> {
  await setLocalMediaEnabled(room, want);
  const mismatch = await waitForLocalMedia(room, want);
  if (mismatch) throw new Error(mismatch);
}
