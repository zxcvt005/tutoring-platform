import { describe, expect, it } from "vitest";

import { isDocumentPipSupported } from "@/lib/video/document-pip";
import { roomRowClass } from "@/lib/video/room-row-class";
import { canTeacherEnterRoom } from "@/lib/video/teacher-room-access";

describe("document picture-in-picture helpers", () => {
  it("is unavailable in the Node test environment", () => {
    expect(isDocumentPipSupported()).toBe(false);
    expect(isDocumentPipSupported(undefined)).toBe(false);
  });
});

describe("room row states", () => {
  it("keeps hover and active as different classes", () => {
    const idle = roomRowClass(false);
    const active = roomRowClass(true);
    expect(idle).toContain("hover:bg-muted");
    expect(idle).not.toContain("ring-primary");
    expect(active).toContain("ring-primary");
    expect(active).toContain("bg-primary/20");
    expect(active).not.toContain("hover:bg-muted");
  });
});

describe("teacher room entry", () => {
  const open = {
    callStatus: "active",
    mode: "parallel",
    roomStatus: "invited",
    isActive: false,
    switching: false,
  };

  it("allows entering an invited room even if the student is not online", () => {
    expect(canTeacherEnterRoom(open)).toBe(true);
  });

  it("blocks a closed room and the already active room", () => {
    expect(canTeacherEnterRoom({ ...open, roomStatus: "closed" })).toBe(false);
    expect(canTeacherEnterRoom({ ...open, isActive: true })).toBe(false);
    expect(canTeacherEnterRoom({ ...open, callStatus: "ended" })).toBe(false);
  });
});
