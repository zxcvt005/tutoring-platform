import { describe, expect, it } from "vitest";

import {
  isAllowedEmbedUrl,
  parseVideoLink,
  resolveTheoryEmbedUrl,
} from "@/lib/theory/video";

describe("parseVideoLink", () => {
  it("builds the official VK embed URL from a page link", () => {
    const parsed = parseVideoLink("https://vk.com/video-139157852_456239750");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.provider).toBe("vk");
    expect(parsed.embedAllowed).toBe(true);
    expect(parsed.embedUrl).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-139157852&id=456239750&hd=2"
    );
    expect(parsed.watchUrl).toBe("https://vk.com/video-139157852_456239750");
    expect(isAllowedEmbedUrl(parsed.embedUrl!)).toBe(true);
  });

  it("keeps query parameters from breaking a VK watch URL", () => {
    const parsed = parseVideoLink(
      "https://vk.com/video-139157852_456239750?from=groups&list=hash"
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.embedUrl).toContain("oid=-139157852");
    expect(parsed.embedUrl).toContain("id=456239750");
  });

  it("parses VK z= overlay, clips, vkvideo.ru and user videos", () => {
    const overlay = parseVideoLink(
      "https://vk.com/videos-139157852?z=video-139157852_456239750%2Fpl_-139157852_-2"
    );
    expect(overlay.ok && overlay.embedUrl).toContain("oid=-139157852");
    expect(overlay.ok && overlay.embedUrl).toContain("id=456239750");

    const clip = parseVideoLink("https://vk.com/clip-123_456");
    expect(clip.ok && clip.provider).toBe("vk");
    expect(clip.ok && clip.embedUrl).toContain("oid=-123");
    expect(clip.ok && clip.embedUrl).toContain("id=456");

    const vkvideo = parseVideoLink("https://vkvideo.ru/video-1_2");
    expect(vkvideo.ok && vkvideo.embedUrl).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hd=2"
    );

    const userVideo = parseVideoLink("https://vk.com/video123_456");
    expect(userVideo.ok && userVideo.embedUrl).toContain("oid=123");
    expect(userVideo.ok && userVideo.embedUrl).toContain("id=456");
  });

  it("keeps hash from official VK export iframe src", () => {
    const parsed = parseVideoLink(
      `<iframe src="https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123&hd=3"></iframe>`
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.embedUrl).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hd=2&hash=abc123"
    );
    expect(isAllowedEmbedUrl(parsed.embedUrl!)).toBe(true);
  });

  it("rewrites stored vk.com embed URLs to vkvideo.ru without dropping hash", () => {
    expect(
      resolveTheoryEmbedUrl(
        "https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123&hd=2"
      )
    ).toBe("https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=abc123&hd=2");
    expect(
      resolveTheoryEmbedUrl("https://www.youtube.com/embed/dQw4w9wgGcQ")
    ).toBe("https://www.youtube.com/embed/dQw4w9wgGcQ");
  });

  it("supports YouTube and rejects javascript URLs", () => {
    const yt = parseVideoLink("https://youtu.be/dQw4w9wgGcQ");
    expect(yt.ok).toBe(true);
    if (yt.ok) {
      expect(yt.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9wgGcQ");
      expect(isAllowedEmbedUrl(yt.embedUrl!)).toBe(true);
    }
    const shorts = parseVideoLink("https://www.youtube.com/shorts/dQw4w9wgGcQ");
    expect(shorts.ok && shorts.embedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9wgGcQ"
    );
    expect(parseVideoLink("javascript:alert(1)").ok).toBe(false);
  });

  it("builds a Rutube embed URL", () => {
    const parsed = parseVideoLink(
      "https://rutube.ru/video/abcdef1234567890abcdef12/"
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.provider).toBe("rutube");
    expect(parsed.embedUrl).toBe(
      "https://rutube.ru/play/embed/abcdef1234567890abcdef12"
    );
    expect(isAllowedEmbedUrl(parsed.embedUrl!)).toBe(true);
  });

  it("does not treat unknown hosts as embeddable", () => {
    const parsed = parseVideoLink("https://example.com/watch?v=1");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.embedAllowed).toBe(false);
    expect(parsed.embedUrl).toBeNull();
  });
});
