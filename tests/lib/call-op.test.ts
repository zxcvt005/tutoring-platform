import { describe, expect, it } from "vitest";

import { isCurrentCallOp, teacherStageKey } from "@/lib/video/call-op";

describe("teacher call operation snapshots", () => {
  it("drops a poll that started before hold or activate", () => {
    expect(isCurrentCallOp(3, 4, false)).toBe(false);
    expect(isCurrentCallOp(4, 4, true)).toBe(false);
    expect(isCurrentCallOp(4, 4, false)).toBe(true);
  });

  it("treats a null active participant as the personal hold room", () => {
    expect(
      teacherStageKey({ mode: "parallel", activeParticipantId: "p1" })
    ).toBe("p1");
    expect(
      teacherStageKey({ mode: "parallel", activeParticipantId: null })
    ).toBe("hold");
  });
});
