import { describe, expect, it } from "vitest";

import {
  findOccupancyConflict,
  occupancyConflictMessage,
  rangesOverlap,
  trialOccupiesSlot,
} from "@/lib/trial-lessons";

describe("trial occupancy", () => {
  it("detects duration overlap, not just matching start", () => {
    expect(rangesOverlap(10, 70, 60, 90)).toBe(true);
    expect(rangesOverlap(10, 60, 60, 90)).toBe(false);
    const hit = findOccupancyConflict(
      [
        {
          kind: "lesson",
          id: "l1",
          startsAt: "2026-10-12T14:00:00.000Z",
          endsAt: "2026-10-12T15:00:00.000Z",
          label: "занятие",
        },
      ],
      {
        startsAt: "2026-10-12T14:30:00.000Z",
        endsAt: "2026-10-12T15:30:00.000Z",
      }
    );
    expect(hit?.id).toBe("l1");
    expect(occupancyConflictMessage(hit!)).toMatch(/занят/);
  });

  it("only planned trials occupy a slot", () => {
    expect(trialOccupiesSlot("planned")).toBe(true);
    expect(trialOccupiesSlot("cancelled")).toBe(false);
    expect(trialOccupiesSlot("completed")).toBe(false);
    expect(trialOccupiesSlot("no_show")).toBe(false);
  });
});
