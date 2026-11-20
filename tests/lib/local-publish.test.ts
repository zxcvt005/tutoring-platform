import { describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";

import {
  localMediaMismatch,
  publishLocalMedia,
  setLocalMediaEnabled,
} from "@/lib/video/local-publish";

function fakeRoom(opts: {
  micEnabled: boolean;
  cameraEnabled: boolean;
  micTrack: boolean;
  cameraTrack: boolean;
}) {
  return {
    localParticipant: {
      get isMicrophoneEnabled() {
        return opts.micEnabled;
      },
      get isCameraEnabled() {
        return opts.cameraEnabled;
      },
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
        opts.micEnabled = enabled;
        opts.micTrack = enabled;
      }),
      setCameraEnabled: vi.fn(async (enabled: boolean) => {
        opts.cameraEnabled = enabled;
        opts.cameraTrack = enabled;
      }),
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.Microphone) {
          return opts.micTrack ? { track: {} } : undefined;
        }
        if (source === Track.Source.Camera) {
          return opts.cameraTrack ? { track: {} } : undefined;
        }
        return undefined;
      },
    },
  };
}

describe("local-publish", () => {
  it("enables mic and camera on the room", async () => {
    const state = {
      micEnabled: false,
      cameraEnabled: false,
      micTrack: false,
      cameraTrack: false,
    };
    const room = fakeRoom(state);
    await setLocalMediaEnabled(room as never, {
      microphone: true,
      camera: true,
    });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(
      localMediaMismatch(room as never, { microphone: true, camera: true })
    ).toBeNull();
  });

  it("detects missing published camera track", () => {
    const room = fakeRoom({
      micEnabled: true,
      cameraEnabled: true,
      micTrack: true,
      cameraTrack: false,
    });
    expect(
      localMediaMismatch(room as never, { microphone: true, camera: true })
    ).toMatch(/видео-трек/);
  });

  it("publishLocalMedia confirms tracks after enable", async () => {
    const state = {
      micEnabled: false,
      cameraEnabled: false,
      micTrack: false,
      cameraTrack: false,
    };
    const room = fakeRoom(state);
    await publishLocalMedia(room as never, {
      microphone: true,
      camera: false,
    });
    expect(state.micEnabled).toBe(true);
    expect(state.cameraEnabled).toBe(false);
  });
});
