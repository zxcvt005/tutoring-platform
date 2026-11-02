import { describe, expect, it } from "vitest";

import { theoryAssignmentStatusLabel } from "@/lib/format";
import {
  THEORY_PLAYER_FRAME_CLASS,
  THEORY_PLAYER_SHELL_CLASS,
  THEORY_WATCHED_VIDEO_USES_DEFAULT_BUTTON,
  afterTheoryVideoWatchSaved,
  claimTheoryAction,
  releaseTheoryAction,
  studentTheoryVideoLayout,
  theoryFileOpenLabel,
  theoryFileSizeLabel,
  theoryStageNumber,
  theoryStageOrder,
  theoryTestGate,
  videoWatchCompletesTheory,
} from "@/lib/theory/viewer";

describe("student theory video viewer", () => {
  it("keeps a compact 16:9 player that fills the phone and caps desktop width", () => {
    expect(THEORY_PLAYER_SHELL_CLASS).toContain("w-full");
    expect(THEORY_PLAYER_SHELL_CLASS).toContain("max-w-2xl");
    expect(THEORY_PLAYER_SHELL_CLASS).toContain("mx-auto");
    expect(THEORY_PLAYER_FRAME_CLASS).toContain("aspect-video");
    expect(THEORY_PLAYER_FRAME_CLASS).toContain("w-full");
    expect(THEORY_PLAYER_FRAME_CLASS).not.toContain("pt-[56.25%]");
  });

  it("places the watched-video button above the player only when video exists and is not marked", () => {
    const withVideo = studentTheoryVideoLayout({
      videoUrl: "https://vk.com/video-1_2",
    });
    expect(withVideo.hasVideo).toBe(true);
    expect(withVideo.showWatchedVideoButton).toBe(true);
    expect(withVideo.watchedButtonPlacement).toBe("above-video");
    expect(THEORY_WATCHED_VIDEO_USES_DEFAULT_BUTTON).toBe(true);

    const alreadyWatched = studentTheoryVideoLayout({
      videoUrl: "https://vk.com/video-1_2",
      viewedAt: "2026-10-23T00:00:00.000Z",
    });
    expect(alreadyWatched.showWatchedVideoButton).toBe(false);

    const noVideo = studentTheoryVideoLayout({ videoUrl: null, viewedAt: null });
    expect(noVideo.hasVideo).toBe(false);
    expect(noVideo.showWatchedVideoButton).toBe(false);
  });

  it("stays on the theory page after the watch mark is saved", () => {
    expect(afterTheoryVideoWatchSaved(true)).toEqual({
      leavePage: false,
      saved: true,
    });
    expect(afterTheoryVideoWatchSaved(false)).toEqual({
      leavePage: false,
      saved: false,
    });
  });

  it("orders materials as video, conspect, then test and skips missing ones", () => {
    expect(
      theoryStageOrder({ hasVideo: true, hasFiles: true, hasTest: true })
    ).toEqual(["video", "conspect", "test"]);
    expect(
      theoryStageOrder({ hasVideo: true, hasFiles: false, hasTest: false })
    ).toEqual(["video"]);
    expect(
      theoryStageOrder({ hasVideo: false, hasFiles: true, hasTest: false })
    ).toEqual(["conspect"]);
    expect(
      theoryStageOrder({ hasVideo: false, hasFiles: false, hasTest: true })
    ).toEqual(["test"]);
    const full = theoryStageOrder({
      hasVideo: true,
      hasFiles: true,
      hasTest: true,
    });
    expect(theoryStageNumber(full, "video")).toBe("01");
    expect(theoryStageNumber(full, "conspect")).toBe("02");
    expect(theoryStageNumber(full, "test")).toBe("03");
    const filesOnly = theoryStageOrder({
      hasVideo: false,
      hasFiles: true,
      hasTest: false,
    });
    expect(theoryStageNumber(filesOnly, "conspect")).toBe("01");
    expect(theoryStageNumber(filesOnly, "video")).toBeNull();
  });

  it("ignores rapid extra clicks while a request is in flight", () => {
    const inflight = { current: false };
    expect(claimTheoryAction(inflight)).toBe(true);
    expect(claimTheoryAction(inflight)).toBe(false);
    expect(claimTheoryAction(inflight)).toBe(false);
    releaseTheoryAction(inflight);
    expect(claimTheoryAction(inflight)).toBe(true);
  });

  it("does not treat a video-watch mark as completing a theory that has a test", () => {
    expect(videoWatchCompletesTheory(true)).toBe(false);
    expect(videoWatchCompletesTheory(false)).toBe(true);
  });

  it("keeps the test locked until the existing watch mark, and hides it when there is no test", () => {
    expect(
      theoryTestGate({
        hasVideo: true,
        viewed: false,
        hasTest: true,
        testReady: true,
      })
    ).toBe("locked");
    expect(
      theoryTestGate({
        hasVideo: true,
        viewed: true,
        hasTest: true,
        testReady: true,
      })
    ).toBe("ready");
    expect(
      theoryTestGate({
        hasVideo: true,
        viewed: true,
        hasTest: true,
        testReady: false,
      })
    ).toBe("preparing");
    expect(
      theoryTestGate({
        hasVideo: false,
        viewed: false,
        hasTest: true,
        testReady: false,
      })
    ).toBe("mark-to-start");
    expect(
      theoryTestGate({
        hasVideo: true,
        viewed: false,
        hasTest: false,
        testReady: false,
      })
    ).toBe("hidden");
  });

  it("opens only PDF in the browser and formats a real file size", () => {
    expect(theoryFileOpenLabel("application/pdf")).toBe("Открыть PDF");
    expect(theoryFileOpenLabel("application/msword")).toBeNull();
    expect(
      theoryFileOpenLabel(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBeNull();
    expect(theoryFileSizeLabel(0)).toBeNull();
    expect(theoryFileSizeLabel(1.2 * 1024 * 1024)).toBe("1,2 МБ");
  });
});

describe("theory assignment status copy", () => {
  it("shows Изучено for completed theory without renaming the internal status", () => {
    expect(theoryAssignmentStatusLabel.completed).toBe("Изучено");
    expect(theoryAssignmentStatusLabel.assigned).toBe("Новая");
    expect(Object.keys(theoryAssignmentStatusLabel)).toContain("completed");
    expect(theoryAssignmentStatusLabel).not.toHaveProperty("studied");
  });
});
