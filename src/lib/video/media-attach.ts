import { LocalVideoTrack, Room, Track } from "livekit-client";

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

export function attachRemoteMedia(
  room: Room | undefined,
  videos: Array<HTMLVideoElement | null>,
  audios: Array<HTMLAudioElement | null>
) {
  if (!room) {
    for (const el of videos) if (el) el.srcObject = null;
    for (const el of audios) if (el) el.srcObject = null;
    return;
  }
  let videoTrack: Track | undefined;
  let audioTrack: Track | undefined;
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.trackPublications.values()) {
      // Подписываемся явно, если LiveKit ещё не сделал этого.
      if (pub.isSubscribed === false && "setSubscribed" in pub) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pub as any).setSubscribed?.(true);
        } catch {
          /* ignore */
        }
      }
      if (!pub.track) continue;
      if (pub.kind === "video" && !videoTrack) videoTrack = pub.track;
      if (pub.kind === "audio" && !audioTrack) audioTrack = pub.track;
    }
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
  void playAttachedMedia([...videos, ...audios]);
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
