/**
 * Симметричная диагностика пути media (presence ≠ publish ≠ subscribe ≠ attach).
 * Без JWT / access_token / полных URL.
 */

import {
  LocalParticipant,
  RemoteParticipant,
  Room,
  Track,
} from "livekit-client";

import { logRoomDiag, roomInstanceTag } from "@/lib/video/room-lifecycle";

export type MediaPathRole = "teacher" | "student";

function pubSnapshot(
  participant: LocalParticipant | RemoteParticipant | undefined,
  source: Track.Source
) {
  if (!participant) return null;
  const pub = participant.getTrackPublication(source);
  if (!pub) return { present: false };
  return {
    present: true,
    subscribed: "isSubscribed" in pub ? Boolean(pub.isSubscribed) : undefined,
    muted: Boolean(pub.isMuted),
    hasTrack: Boolean(pub.track),
    trackSid: pub.trackSid || undefined,
    source: String(pub.source),
    kind: pub.kind ? String(pub.kind) : undefined,
  };
}

export function snapshotRemotePublications(room: Room | null | undefined) {
  if (!room) return [];
  return [...room.remoteParticipants.values()].map((p) => ({
    identity: p.identity,
    sid: p.sid,
    camera: pubSnapshot(p, Track.Source.Camera),
    microphone: pubSnapshot(p, Track.Source.Microphone),
    publicationCount: p.trackPublications.size,
  }));
}

export function snapshotLocalPublications(room: Room | null | undefined) {
  if (!room) return null;
  const p = room.localParticipant;
  return {
    identity: p.identity,
    sid: p.sid,
    camera: pubSnapshot(p, Track.Source.Camera),
    microphone: pubSnapshot(p, Track.Source.Microphone),
  };
}

export function snapshotMediaElements(
  videos: Array<HTMLVideoElement | null | undefined>,
  audios: Array<HTMLAudioElement | null | undefined>
) {
  return {
    videoEls: videos.map((el) =>
      el
        ? {
            mounted: true,
            hasSrcObject: Boolean(el.srcObject),
            paused: el.paused,
            muted: el.muted,
            videoWidth: el.videoWidth,
            videoHeight: el.videoHeight,
          }
        : { mounted: false }
    ),
    audioEls: audios.map((el) =>
      el
        ? {
            mounted: true,
            hasSrcObject: Boolean(el.srcObject),
            paused: el.paused,
            muted: el.muted,
            volume: el.volume,
          }
        : { mounted: false }
    ),
    anyVideoMounted: videos.some(Boolean),
    anyAudioMounted: audios.some(Boolean),
  };
}

export function logMediaPath(
  event: string,
  input: {
    role: MediaPathRole;
    callId?: string;
    slotId?: string;
    activeId?: string | null;
    reason?: string;
    room?: Room | null;
    videos?: Array<HTMLVideoElement | null | undefined>;
    audios?: Array<HTMLAudioElement | null | undefined>;
    extra?: Record<string, unknown>;
  }
): void {
  const room = input.room ?? null;
  const elements =
    input.videos || input.audios
      ? snapshotMediaElements(input.videos ?? [], input.audios ?? [])
      : undefined;
  const remotes = snapshotRemotePublications(room);
  const local = snapshotLocalPublications(room);
  const tracksReady = remotes.some(
    (r) => Boolean(r.camera?.hasTrack) || Boolean(r.microphone?.hasTrack)
  );
  const attachWouldNoop =
    Boolean(elements) &&
    tracksReady &&
    !elements!.anyVideoMounted &&
    !elements!.anyAudioMounted;

  logRoomDiag(event, {
    callId: input.callId,
    slotId: input.slotId,
    activeId: input.activeId ?? null,
    reason: input.reason,
    roomName: room?.name || undefined,
    identity: room?.localParticipant?.identity || undefined,
    instance: room ? roomInstanceTag(room) : undefined,
    roomState: room?.state,
    // Room.sid есть в runtime SDK; в типах пакета может отсутствовать.
    roomSid: (room as Room & { sid?: string } | null)?.sid || undefined,
    role: input.role,
    local,
    remotes,
    remoteCount: room?.remoteParticipants.size ?? 0,
    elements,
    attachWouldNoop: attachWouldNoop || undefined,
    level: {
      presence: (room?.remoteParticipants.size ?? 0) > 0,
      remotePublished: remotes.some(
        (r) => Boolean(r.camera?.present) || Boolean(r.microphone?.present)
      ),
      remoteTrackReady: tracksReady,
      elementsMounted: Boolean(
        elements?.anyVideoMounted || elements?.anyAudioMounted
      ),
    },
    ...input.extra,
  });
}
