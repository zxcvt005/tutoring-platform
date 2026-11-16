import { describe, expect, it, vi } from "vitest";

import { Track } from "livekit-client";

import { pickRemoteCameraAndMicTracks } from "@/lib/video/media-attach";

type PubLike = {
  kind: Track.Kind;
  source: Track.Source;
  track?: { id: string };
  isSubscribed?: boolean;
  setSubscribed?: (value: boolean) => void;
};

function makeParticipant(pubs: PubLike[]) {
  const map = new Map(
    pubs.map((pub, index) => [`pub-${index}`, pub as never])
  );
  return {
    trackPublications: map,
    getTrackPublication: (source: Track.Source) => {
      for (const pub of pubs) {
        if (pub.source === source) return pub;
      }
      return undefined;
    },
  };
}

describe("pickRemoteCameraAndMicTracks", () => {
  it("prefers camera and microphone sources over screen share", () => {
    const screen = {
      kind: Track.Kind.Video,
      source: Track.Source.ScreenShare,
      track: { id: "screen" },
    };
    const camera = {
      kind: Track.Kind.Video,
      source: Track.Source.Camera,
      track: { id: "camera" },
    };
    const mic = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      track: { id: "mic" },
    };
    const participant = makeParticipant([screen, camera, mic]);
  const room = {
      remoteParticipants: new Map([["p1", participant]]),
    } as never;

    const picked = pickRemoteCameraAndMicTracks(room);
    expect(picked.videoTrack).toEqual({ id: "camera" });
    expect(picked.audioTrack).toEqual({ id: "mic" });
  });

  it("falls back to kind when source publications lack tracks", () => {
    const videoOnly = {
      kind: Track.Kind.Video,
      source: Track.Source.Unknown,
      track: { id: "fallback-video" },
    };
    const audioOnly = {
      kind: Track.Kind.Audio,
      source: Track.Source.Unknown,
      track: { id: "fallback-audio" },
    };
    const participant = makeParticipant([videoOnly, audioOnly]);
    const room = {
      remoteParticipants: new Map([["p1", participant]]),
    } as never;

    const picked = pickRemoteCameraAndMicTracks(room);
    expect(picked.videoTrack).toEqual({ id: "fallback-video" });
    expect(picked.audioTrack).toEqual({ id: "fallback-audio" });
  });

  it("requests subscribe on unsubscribed publications", () => {
    const setSubscribed = vi.fn();
    const camera = {
      kind: Track.Kind.Video,
      source: Track.Source.Camera,
      track: { id: "cam" },
      isSubscribed: false,
      setSubscribed,
    };
    const participant = makeParticipant([camera]);
    const room = {
      remoteParticipants: new Map([["p1", participant]]),
    } as never;

    pickRemoteCameraAndMicTracks(room);
    expect(setSubscribed).toHaveBeenCalledWith(true);
  });
});