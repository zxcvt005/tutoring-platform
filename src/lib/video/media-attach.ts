import {
  LocalVideoTrack,
  RemoteParticipant,
  Room,
  Track,
} from "livekit-client";

import { logMediaPath } from "@/lib/video/media-path-diag";

export function publishedCameraTrack(
  room: Room | null | undefined
): LocalVideoTrack | undefined {
  const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)
    ?.track;
  return track instanceof LocalVideoTrack ? track : undefined;
}

export function attachLocalCamera(
  room: Room | undefined,
  elements: Array<HTMLVideoElement | null>
) {
  const pub = room?.localParticipant.getTrackPublication(Track.Source.Camera);
  const track = pub?.track;
  for (const el of elements) {
    if (!el) continue;
    if (track) track.attach(el);
    else el.srcObject = null;
  }
}

export function attachPreviewTrack(
  track: LocalVideoTrack | null,
  elements: Array<HTMLVideoElement | null>
) {
  for (const el of elements) {
    if (!el) continue;
    if (track) track.attach(el);
    else el.srcObject = null;
  }
}

export async function playAttachedMedia(
  elements: Array<HTMLMediaElement | null | undefined>
): Promise<"ok" | "blocked" | "empty"> {
  let attempted = false;
  let blocked = false;
  for (const el of elements) {
    if (!el) continue;
    if (!el.srcObject) continue;
    attempted = true;
    try {
      el.setAttribute("playsinline", "true");
    } catch {
      /* jsdom/node stubs */
    }
    try {
      // Удалённое видео можно держать muted для autoplay; аудио — нет.
      if (
        typeof HTMLVideoElement !== "undefined" &&
        el instanceof HTMLVideoElement
      ) {
        el.playsInline = true;
      }
      await el.play();
    } catch {
      blocked = true;
    }
  }
  if (!attempted) return "empty";
  return blocked ? "blocked" : "ok";
}

function ensureRemoteTrackSubscribed(participant: RemoteParticipant) {
  for (const pub of participant.trackPublications.values()) {
    if (pub.isSubscribed === false && "setSubscribed" in pub) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pub as any).setSubscribed?.(true);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Выбирает камеру/микрофон удалённого участника (как remote-grid), с запасным по kind. */
export function pickRemoteCameraAndMicTracks(room: Room): {
  videoTrack?: Track;
  audioTrack?: Track;
} {
  let videoTrack: Track | undefined;
  let audioTrack: Track | undefined;
  for (const participant of room.remoteParticipants.values()) {
    ensureRemoteTrackSubscribed(participant);
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    if (!videoTrack && cameraPub?.track) videoTrack = cameraPub.track;
    if (!audioTrack && micPub?.track) audioTrack = micPub.track;
    if (videoTrack && audioTrack) break;
    for (const pub of participant.trackPublications.values()) {
      if (!pub.track) continue;
      if (
        !videoTrack &&
        pub.kind === Track.Kind.Video &&
        pub.source !== Track.Source.ScreenShare
      ) {
        videoTrack = pub.track;
      }
      if (!audioTrack && pub.kind === Track.Kind.Audio) {
        audioTrack = pub.track;
      }
    }
    if (videoTrack && audioTrack) break;
  }
  return { videoTrack, audioTrack };
}

export function attachRemoteMedia(
  room: Room | undefined,
  videos: Array<HTMLVideoElement | null>,
  audios: Array<HTMLAudioElement | null>,
  diag?: {
    role: "teacher" | "student";
    callId?: string;
    slotId?: string;
    activeId?: string | null;
    reason?: string;
  }
) {
  if (!room) {
    for (const el of videos) if (el) el.srcObject = null;
    for (const el of audios) if (el) el.srcObject = null;
    if (diag) {
      logMediaPath("attach_remote_clear", {
        role: diag.role,
        callId: diag.callId,
        slotId: diag.slotId,
        activeId: diag.activeId,
        reason: diag.reason ?? "no_room",
        videos,
        audios,
      });
    }
    return;
  }
  const { videoTrack, audioTrack } = pickRemoteCameraAndMicTracks(room);
  const videoMounted = videos.some(Boolean);
  const audioMounted = audios.some(Boolean);
  if (diag) {
    logMediaPath("attach_remote_attempt", {
      role: diag.role,
      callId: diag.callId,
      slotId: diag.slotId,
      activeId: diag.activeId,
      reason: diag.reason,
      room,
      videos,
      audios,
      extra: {
        pickedVideo: Boolean(videoTrack),
        pickedAudio: Boolean(audioTrack),
        videoMounted,
        audioMounted,
        skippedNoElements:
          (Boolean(videoTrack) || Boolean(audioTrack)) &&
          !videoMounted &&
          !audioMounted,
      },
    });
  }
  for (const el of videos) {
    if (!el) continue;
    if (videoTrack) {
      videoTrack.attach(el);
      el.playsInline = true;
      // Видео muted — звук идёт через отдельный <audio>, так надёжнее с autoplay.
      el.muted = true;
    } else el.srcObject = null;
  }
  for (const el of audios) {
    if (!el) continue;
    if (audioTrack) {
      audioTrack.attach(el);
      el.muted = false;
      el.volume = 1;
    } else el.srcObject = null;
  }
  void playAttachedMedia([...videos, ...audios]).then((playResult) => {
    if (!diag) return;
    logMediaPath("attach_remote_play", {
      role: diag.role,
      callId: diag.callId,
      slotId: diag.slotId,
      activeId: diag.activeId,
      reason: diag.reason,
      room,
      videos,
      audios,
      extra: { playResult },
    });
  });
}

export function cameraIsPublished(rooms: Iterable<Room>): boolean {
  for (const room of rooms) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track) return true;
  }
  return false;
}

/** Ждём фактического unpublish, чтобы hold-превью не открывало вторую камеру. */
export async function waitUntilCameraUnpublished(
  rooms: Iterable<Room>,
  timeoutMs = 2500
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!cameraIsPublished(rooms)) return true;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return !cameraIsPublished(rooms);
}
