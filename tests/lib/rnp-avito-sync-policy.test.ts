import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  calendarDaysBetween,
  isRnpAvitoMetricStale,
  syncTtlMsForAge,
} from "@/lib/rnp-avito-sync-policy";

describe("rnp avito sync policy", () => {
  it("computes calendar day distances and TTL windows", () => {
    expect(calendarDaysBetween("2026-11-01", "2026-11-01")).toBe(0);
    expect(calendarDaysBetween("2026-11-01", "2026-11-02")).toBe(1);
    expect(calendarDaysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(syncTtlMsForAge(0)).toBe(5 * 60_000);
    expect(syncTtlMsForAge(1)).toBe(60 * 60_000);
    expect(syncTtlMsForAge(2)).toBe(60 * 60_000);
    expect(syncTtlMsForAge(3)).toBe(24 * 60 * 60_000);
    expect(syncTtlMsForAge(6)).toBe(24 * 60 * 60_000);
    expect(syncTtlMsForAge(7)).toBeNull();
  });

  it("limits auto/force to the live 7-day window and respects TTL", () => {
    const now = fromAppWall(2026, 11, 14, 12, 0, 0);

    // Older than 7 days: neither auto nor force (history only)
    expect(isRnpAvitoMetricStale(null, "2026-11-01", now, "auto")).toBe(false);
    expect(isRnpAvitoMetricStale(null, "2026-11-01", now, "force")).toBe(false);

    // Future
    expect(isRnpAvitoMetricStale(null, "2026-11-15", now, "auto")).toBe(false);

    // Never-synced inside live window
    expect(isRnpAvitoMetricStale(null, "2026-11-14", now, "auto")).toBe(true);
    expect(isRnpAvitoMetricStale(null, "2026-11-08", now, "auto")).toBe(true);

    const freshToday = new Date(now.getTime() - 60_000);
    expect(
      isRnpAvitoMetricStale(freshToday, "2026-11-14", now, "auto")
    ).toBe(false);
    const staleToday = new Date(now.getTime() - 6 * 60_000);
    expect(
      isRnpAvitoMetricStale(staleToday, "2026-11-14", now, "auto")
    ).toBe(true);

    const hourAgo = new Date(now.getTime() - 60_000);
    expect(isRnpAvitoMetricStale(hourAgo, "2026-11-13", now, "auto")).toBe(
      false
    );

    // Force ignores TTL inside live window
    expect(
      isRnpAvitoMetricStale(freshToday, "2026-11-14", now, "force")
    ).toBe(true);
    expect(isRnpAvitoMetricStale(hourAgo, "2026-11-10", now, "force")).toBe(
      true
    );
    // Day 7 ago (ago=7) outside window
    expect(
      isRnpAvitoMetricStale(null, "2026-11-07", now, "force")
    ).toBe(false);
  });
});
