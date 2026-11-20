import { describe, expect, it, vi } from "vitest";

import { createRemoteAttachGate } from "@/lib/video/remote-attach-gate";

type FakeRoom = { id: string };

/** Node vitest: достаточно уникальных object-identity для gate. */
function fakeVideo() {
  return { kind: "video" } as unknown as HTMLVideoElement;
}
function fakeAudio() {
  return { kind: "audio" } as unknown as HTMLAudioElement;
}

function makeGate() {
  let video: HTMLVideoElement | null = null;
  let audio: HTMLAudioElement | null = null;
  const attach = vi.fn();
  const clear = vi.fn();
  const events: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const gate = createRemoteAttachGate<FakeRoom>({
    getVideos: () => [video],
    getAudios: () => [audio],
    attach: (room, videos, audios, reason) => {
      attach({ room, videos, audios, reason });
    },
    clear: (videos, audios, reason) => {
      clear({ videos, audios, reason });
    },
    onEvent: (event, fields) => {
      events.push({ event, fields });
    },
  });
  return {
    gate,
    attach,
    clear,
    events,
    setVideo: (el: HTMLVideoElement | null) => {
      video = el;
    },
    setAudio: (el: HTMLAudioElement | null) => {
      audio = el;
    },
  };
}

describe("remote-attach-gate", () => {
  it("1. TrackSubscribed before DOM → pending → mount → attach", () => {
    const ctx = makeGate();
    const room = { id: "A" };
    expect(ctx.gate.request(room, "slot-a", "track_subscribed")).toBe("pending");
    expect(ctx.attach).not.toHaveBeenCalled();
    expect(ctx.gate.hasPending()).toBe(true);

    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    expect(ctx.gate.notifyElements("remote_video_mount")).toBe("attached");
    expect(ctx.attach).toHaveBeenCalledTimes(1);
    expect(ctx.attach.mock.calls[0][0].room).toBe(room);
    expect(ctx.attach.mock.calls[0][0].reason).toBe("remote_video_mount");
  });

  it("2. DOM first → TrackSubscribed → attach immediately", () => {
    const ctx = makeGate();
    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    const room = { id: "A" };
    expect(ctx.gate.request(room, "slot-a", "track_subscribed")).toBe("attached");
    expect(ctx.attach).toHaveBeenCalledTimes(1);
  });

  it("3. tracks exist before activate → activate request → DOM → attach", () => {
    const ctx = makeGate();
    const room = { id: "A" };
    // activate_after_setCall while still on hold UI
    expect(ctx.gate.request(room, "slot-a", "activate_after_setCall")).toBe(
      "pending"
    );
    ctx.setVideo(fakeVideo());
    expect(ctx.gate.notifyElements("remote_video_mount")).toBe("attached");
    expect(ctx.attach).toHaveBeenCalledTimes(1);
  });

  it("4. Hold → activate → remote tracks re-attached after mount", () => {
    const ctx = makeGate();
    const room = { id: "A" };
    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    expect(ctx.gate.request(room, "slot-a", "first")).toBe("attached");

    ctx.gate.invalidate("hold_begin_clear");
    expect(ctx.clear).toHaveBeenCalled();
    expect(ctx.gate.hasPending()).toBe(false);
    expect(ctx.gate.attachedSlotId()).toBeNull();

    // Hold unmounts remote tile
    ctx.setVideo(null);
    ctx.setAudio(null);

    expect(ctx.gate.request(room, "slot-a", "activate_after_setCall")).toBe(
      "pending"
    );
    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    expect(ctx.gate.notifyElements("remote_video_mount")).toBe("attached");
    expect(ctx.attach).toHaveBeenCalledTimes(2);
  });

  it("5. Room switch → old tracks cleared; new slot attaches", () => {
    const ctx = makeGate();
    const roomA = { id: "A" };
    const roomB = { id: "B" };
    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    expect(ctx.gate.request(roomA, "slot-a", "a")).toBe("attached");

    ctx.gate.invalidate("activate_begin");
    expect(ctx.gate.attachedSlotId()).toBeNull();

    expect(ctx.gate.request(roomB, "slot-b", "activate_after_setCall")).toBe(
      "attached"
    );
    expect(ctx.attach.mock.calls.at(-1)?.[0].room).toBe(roomB);
    expect(ctx.gate.attachedSlotId()).toBe("slot-b");
  });

  it("6. Repeated TrackSubscribed does not duplicate attach to same elements", () => {
    const ctx = makeGate();
    const room = { id: "A" };
    ctx.setVideo(fakeVideo());
    ctx.setAudio(fakeAudio());
    expect(ctx.gate.request(room, "slot-a", "track_subscribed")).toBe("attached");
    expect(ctx.gate.request(room, "slot-a", "track_subscribed")).toBe(
      "skipped_duplicate"
    );
    expect(ctx.attach).toHaveBeenCalledTimes(1);
  });

  it("remount of elements re-attaches after unmount", () => {
    const ctx = makeGate();
    const room = { id: "A" };
    const v1 = fakeVideo();
    const a1 = fakeAudio();
    ctx.setVideo(v1);
    ctx.setAudio(a1);
    expect(ctx.gate.request(room, "slot-a", "first")).toBe("attached");

    ctx.setVideo(null);
    ctx.setAudio(null);
    expect(ctx.gate.notifyElements("remote_video_unmount")).toBe("pending");

    const v2 = fakeVideo();
    const a2 = fakeAudio();
    ctx.setVideo(v2);
    ctx.setAudio(a2);
    expect(ctx.gate.notifyElements("remote_video_mount")).toBe("attached");
    expect(ctx.attach).toHaveBeenCalledTimes(2);
    expect(ctx.attach.mock.calls[1][0].videos[0]).toBe(v2);
  });
});