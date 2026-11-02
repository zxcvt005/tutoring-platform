import { describe, expect, it } from "vitest";

import {
  hasTheoryComponent,
  theoryComponentLabels,
} from "@/lib/theory/components";

describe("theory components", () => {
  it("accepts each of the seven combinations and rejects empty", () => {
    expect(hasTheoryComponent({ videoUrl: "https://vk.com/video-1_1" })).toBe(
      true
    );
    expect(hasTheoryComponent({ fileCount: 1 })).toBe(true);
    expect(hasTheoryComponent({ testId: "hw1" })).toBe(true);
    expect(
      hasTheoryComponent({ videoUrl: "https://vk.com/video-1_1", fileCount: 2 })
    ).toBe(true);
    expect(
      hasTheoryComponent({ videoUrl: "https://vk.com/video-1_1", testId: "t" })
    ).toBe(true);
    expect(hasTheoryComponent({ fileCount: 1, testId: "t" })).toBe(true);
    expect(
      hasTheoryComponent({
        videoUrl: "https://vk.com/video-1_1",
        fileCount: 1,
        testId: "t",
      })
    ).toBe(true);
    expect(hasTheoryComponent({})).toBe(false);
    expect(hasTheoryComponent({ videoUrl: "  ", testId: "", fileCount: 0 })).toBe(
      false
    );
  });

  it("labels only present components", () => {
    expect(theoryComponentLabels({ hasVideo: true, fileCount: 0 })).toEqual([
      "видео",
    ]);
    expect(theoryComponentLabels({ hasTest: true, fileCount: 2 })).toEqual([
      "конспектов: 2",
      "тест",
    ]);
    expect(theoryComponentLabels({})).toEqual([]);
  });
});
