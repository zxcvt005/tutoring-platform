import { describe, expect, it } from "vitest";

import { appDateKey, appZonedParts, fromAppDateOnly, fromAppWall } from "@/lib/app-time";
import {
  AUDITORIA_UPCOMING_DAYS,
  filterUpcomingLessonsForAuditoria,
  firstUpcomingOccurrence,
  isWithinUpcomingWindow,
  listOccurrencesInRange,
  listUpcomingOccurrences,
} from "@/lib/recurring-schedule";

function moscowNow(h = 15, m = 0) {
  return fromAppWall(2026, 10, 14, h, m);
}

describe("recurring schedule occurrences", () => {
  it("skips weekday already passed this week", () => {
    const now = moscowNow(15, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [2],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now,
      3
    );
    expect(occ.length).toBeGreaterThan(0);
    expect(appZonedParts(occ[0]!.startsAt).weekday).toBe(2);
    expect(appDateKey(occ[0]!.startsAt)).toBe("2026-10-20");
  });

  it("skips today if lesson time already passed", () => {
    const now = moscowNow(18, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [3],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now,
      3
    );
    expect(appDateKey(occ[0]!.startsAt)).toBe("2026-10-21");
    expect(occ.every((o) => o.startsAt.getTime() > now.getTime())).toBe(true);
  });

  it("includes today if time is still in the future", () => {
    const now = moscowNow(14, 0);
    const first = firstUpcomingOccurrence(
      {
        weekdays: [3],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now
    );
    expect(first).not.toBeNull();
    expect(appDateKey(first!.startsAt)).toBe("2026-10-14");
    expect(appZonedParts(first!.startsAt).hour).toBe(17);
  });

  it("does not backfill past weeks when activeFrom is now", () => {
    const now = moscowNow(12, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [2, 4],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now,
      2
    );
    expect(occ.every((o) => o.startsAt.getTime() > now.getTime())).toBe(true);
    expect(occ.some((o) => appDateKey(o.startsAt) < "2026-10-14")).toBe(false);
  });

  it("repeats Tue/Thu weekly without duplicates in keys", () => {
    const now = moscowNow(10, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [2, 4],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now,
      4
    );
    const keys = occ.map((o) => o.occurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      occ.every((o) => {
        const wd = appZonedParts(o.startsAt).weekday;
        return wd === 2 || wd === 4;
      })
    ).toBe(true);
  });
});

describe("auditoria 14-day window", () => {
  it("includes boundary at exactly +14 days", () => {
    const now = moscowNow(12, 0);
    const edge = new Date(now.getTime() + AUDITORIA_UPCOMING_DAYS * 86_400_000);
    expect(isWithinUpcomingWindow(edge.toISOString(), now)).toBe(true);
  });

  it("excludes past and beyond 14 days", () => {
    const now = moscowNow(12, 0);
    const past = new Date(now.getTime() - 60_000).toISOString();
    const far = new Date(
      now.getTime() + (AUDITORIA_UPCOMING_DAYS + 1) * 86_400_000
    ).toISOString();
    expect(isWithinUpcomingWindow(past, now)).toBe(false);
    expect(isWithinUpcomingWindow(far, now)).toBe(false);
  });

  it("filterUpcomingLessonsForAuditoria keeps only planned in window", () => {
    const now = moscowNow(12, 0);
    const lessons = [
      {
        id: "a",
        startsAt: new Date(now.getTime() + 3600_000).toISOString(),
        status: "planned",
      },
      {
        id: "b",
        startsAt: new Date(now.getTime() + 20 * 86_400_000).toISOString(),
        status: "planned",
      },
      {
        id: "c",
        startsAt: new Date(now.getTime() - 3600_000).toISOString(),
        status: "planned",
      },
      {
        id: "d",
        startsAt: new Date(now.getTime() + 3600_000).toISOString(),
        status: "done",
      },
    ];
    const filtered = filterUpcomingLessonsForAuditoria(lessons, now);
    expect(filtered.map((l) => l.id)).toEqual(["a"]);
  });

  it("lists past and future occurrences in a range", () => {
    const now = moscowNow(12, 0);
    const from = fromAppDateOnly("2026-09-01");
    const to = fromAppWall(2026, 10, 28, 23, 59);
    const occ = listOccurrencesInRange(
      {
        weekdays: [2, 4],
        startTime: "17:00",
        durationMin: 60,
        activeFrom: from,
      },
      from,
      to
    );
    expect(occ.some((o) => o.startsAt.getTime() < now.getTime())).toBe(true);
    expect(occ.some((o) => o.startsAt.getTime() > now.getTime())).toBe(true);
    expect(
      occ.every((o) => {
        const wd = appZonedParts(o.startsAt).weekday;
        return wd === 2 || wd === 4;
      })
    ).toBe(true);
  });
});
