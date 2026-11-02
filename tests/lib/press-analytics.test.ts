import { describe, expect, it } from "vitest";

import { computePressAnalytics } from "@/lib/press-analytics";
import type { PressAnalyticsTrial } from "@/lib/press-analytics";

function trial(
  partial: Partial<PressAnalyticsTrial> & { id: string }
): PressAnalyticsTrial {
  return {
    teacherId: "t1",
    ownerUserId: "press1",
    createdByUserId: "press1",
    createdAt: "2026-10-10T10:00:00.000Z",
    startsAt: "2026-10-12T10:00:00.000Z",
    agreementStatus: "not_discussed",
    lessonStatus: "planned",
    ...partial,
  };
}

describe("press analytics", () => {
  const from = new Date("2026-10-01T00:00:00.000Z");
  const to = new Date("2026-10-31T23:59:59.000Z");
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("does not count cancellations and no-shows as completed", () => {
    const result = computePressAnalytics(
      [
        trial({ id: "a", agreementStatus: "agreed", lessonStatus: "completed" }),
        trial({ id: "b", lessonStatus: "cancelled" }),
        trial({ id: "c", lessonStatus: "no_show" }),
        trial({ id: "d", lessonStatus: "planned" }),
      ],
      [],
      { from, to, now }
    );
    expect(result.created).toBe(4);
    expect(result.completed).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.noShow).toBe(1);
    expect(result.agreed).toBe(1);
    expect(result.funnel.find((s) => s.key === "completed")?.count).toBe(1);
  });

  it("filters by teacher and owner", () => {
    const trials = [
      trial({ id: "a", teacherId: "t1", ownerUserId: "p1" }),
      trial({ id: "b", teacherId: "t2", ownerUserId: "p1" }),
      trial({ id: "c", teacherId: "t1", ownerUserId: "p2" }),
    ];
    expect(
      computePressAnalytics(trials, [], {
        from,
        to,
        now,
        teacherId: "t1",
      }).created
    ).toBe(2);
    expect(
      computePressAnalytics(trials, [], {
        from,
        to,
        now,
        ownerUserId: "p2",
      }).created
    ).toBe(1);
  });

  it("uses created-in-period as the agreement rate denominator", () => {
    const result = computePressAnalytics(
      [
        trial({ id: "a", agreementStatus: "agreed" }),
        trial({ id: "b", agreementStatus: "not_agreed" }),
      ],
      [],
      { from, to, now }
    );
    expect(result.agreementRate).toBe(50);
    expect(result.funnel[1]?.denominatorLabel).toContain("созданных");
  });
});
