import { describe, expect, it } from "vitest";

import { isAllowedEmbedUrl, parseVideoLink } from "@/lib/theory/video";

describe("parseVideoLink", () => {
  it("builds VK embed from a page URL without executing HTML", () => {
    const parsed = parseVideoLink("https://vk.com/video-139157852_456239750");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.provider).toBe("vk");
    expect(parsed.embedAllowed).toBe(true);
    expect(parsed.embedUrl).toContain("vk.com/video_ext.php");
    expect(parsed.embedUrl).toContain("oid=-139157852");
    expect(parsed.embedUrl).toContain("id=456239750");
  });

  it("keeps hash from official VK export iframe src", () => {
    const parsed = parseVideoLink(
      `<iframe src="https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123&hd=3"></iframe>`
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.embedUrl).toContain("hash=abc123");
    expect(isAllowedEmbedUrl(parsed.embedUrl!)).toBe(true);
  });

  it("supports YouTube and rejects javascript URLs", () => {
    const yt = parseVideoLink("https://youtu.be/dQw4w9wgGcQ");
    expect(yt.ok).toBe(true);
    if (yt.ok) {
      expect(yt.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9wgGcQ");
    }
    expect(parseVideoLink("javascript:alert(1)").ok).toBe(false);
  });

  it("does not treat unknown hosts as embeddable", () => {
    const parsed = parseVideoLink("https://example.com/watch?v=1");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.embedAllowed).toBe(false);
    expect(parsed.embedUrl).toBeNull();
  });
});
