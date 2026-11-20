import { describe, expect, it, vi } from "vitest";

import { Track } from "livekit-client";

import { attachRemoteMedia } from "@/lib/video/media-attach";
import {
  snapshotMediaElements,
  snapshotRemotePublications,
} from "@/lib/video/media-path-diag";

describe("media-path presence vs attach", () => {
  it("detects mounted=false elements while remote tracks are ready", () => {
    const elements = snapshotMediaElements([null, null], [null]);
    expect(elements.anyVideoMounted).toBe(false);
    expect(elements.anyAudioMounted).toBe(false);
    expect(elements.videoEls.every((el) => !el.mounted)).toBe(true);
  });

  it("attachRemoteMedia is a no-op when tracks exist but video/audio refs are null", () => {
    const attach = vi.fn();
    const videoTrack = { attach, kind: Track.Kind.Video };
    const audioTrack = { attach, kind: Track.Kind.Audio };
    const participant = {
      identity: "s-student",
      sid: "PA_x",
      trackPublications: new Map([
        [
          "cam",
          {
            source: Track.Source.Camera,
            kind: Track.Kind.Video,
            track: videoTrack,
            isSubscribed: true,
            trackSid: "TR_cam",
          },
        ],
        [
          "mic",
          {
            source: Track.Source.Microphone,
            kind: Track.Kind.Audio,
            track: audioTrack,
            isSubscribed: true,
            trackSid: "TR_mic",
          },
        ],
      ]),
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.Camera) {
          return {
            source,
            kind: Track.Kind.Video,
            track: videoTrack,
            isSubscribed: true,
            trackSid: "TR_cam",
          };
        }
        if (source === Track.Source.Microphone) {
          return {
            source,
            kind: Track.Kind.Audio,
            track: audioTrack,
            isSubscribed: true,
            trackSid: "TR_mic",
          };
        }
        return undefined;
      },
    };
    const room = {
      name: "vc-call-part",
      state: "connected",
      sid: "RM_x",
      localParticipant: {
        identity: "t-teacher",
        sid: "PA_t",
        getTrackPublication: () => undefined,
      },
      remoteParticipants: new Map([["s-student", participant]]),
    } as never;

    const remotes = snapshotRemotePublications(room);
    expect(remotes[0]?.camera?.hasTrack).toBe(true);
    expect(remotes[0]?.microphone?.hasTrack).toBe(true);

    // Как activate() сразу после setCall при hold: refs ещё null.
    attachRemoteMedia(room, [null], [null], {
      role: "teacher",
      callId: "call_1",
      slotId: "vcp_1",
      activeId: "vcp_1",
      reason: "activate_after_setCall_sync",
    });

    expect(attach).not.toHaveBeenCalled();
  });
});
