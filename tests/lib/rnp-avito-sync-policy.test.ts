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

  it("marks never-synced days stale and respects auto TTL / force window", () => {
    const now = fromAppWall(2026, 11, 14, 12, 0, 0);
    expect(
      isRnpAvitoMetricStale(null, "2026-11-01", now, "auto")
    ).toBe(true);
    expect(
      isRnpAvitoMetricStale(null, "2026-11-15", now, "auto")
    ).toBe(false);

    const freshToday = new Date(now.getTime() - 60_000);
    expect(
      isRnpAvitoMetricStale(freshToday, "2026-11-14", now, "auto")
    ).toBe(false);
    const staleToday = new Date(now.getTime() - 6 * 60_000);
    expect(
      isRnpAvitoMetricStale(staleToday, "2026-11-14", now, "auto")
    ).toBe(true);

    const hourAgo = new Date(now.getTime() - 60_000);
    expect(
      isRnpAvitoMetricStale(hourAgo, "2026-11-13", now, "auto")
    ).toBe(false);

    // Older than 7 days: auto never refreshes once synced
    const oldSync = fromAppWall(2026, 10, 1, 0, 0, 0);
    expect(
      isRnpAvitoMetricStale(oldSync, "2026-11-01", now, "auto")
    ).toBe(false);
    // force обновляет весь выбранный месяц до сегодня
    expect(
      isRnpAvitoMetricStale(oldSync, "2026-11-01", now, "force")
    ).toBe(true);
    expect(
      isRnpAvitoMetricStale(oldSync, "2026-11-15", now, "force")
    ).toBe(false);
  });
});
