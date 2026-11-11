import { describe, expect, it } from "vitest";

import { createMicLevelMonitor } from "@/lib/video/mic-level-monitor";

describe("createMicLevelMonitor", () => {
  it("returns null without a stream", () => {
    expect(createMicLevelMonitor(null)).toBeNull();
    expect(createMicLevelMonitor(undefined)).toBeNull();
  });
});
