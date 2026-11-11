import { describe, expect, it, vi } from "vitest";

import { playAttachedMedia } from "@/lib/video/media-attach";

describe("playAttachedMedia", () => {
  it("returns empty when nothing is attached", async () => {
    expect(await playAttachedMedia([null, undefined])).toBe("empty");
  });

  it("plays elements with srcObject", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const el = {
      srcObject: {} as MediaStream,
      setAttribute: vi.fn(),
      play,
      playsInline: false,
    } as unknown as HTMLVideoElement;
    expect(await playAttachedMedia([el])).toBe("ok");
    expect(play).toHaveBeenCalled();
  });

  it("reports blocked autoplay", async () => {
    const play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const el = {
      srcObject: {} as MediaStream,
      setAttribute: vi.fn(),
      play,
      playsInline: false,
    } as unknown as HTMLAudioElement;
    expect(await playAttachedMedia([el])).toBe("blocked");
  });
});
