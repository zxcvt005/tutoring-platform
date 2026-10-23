import { describe, expect, it } from "vitest";

import {
  addAppDateKey,
  appDateKey,
  appTimeHm,
  appZonedParts,
  formatInAppZone,
  fromAppDateOnly,
  fromAppDateTime,
  fromAppDateTimeLocalValue,
  fromAppWall,
  parseAppInstant,
  toAppDateTimeLocalValue,
} from "@/lib/app-time";
import { DAY_END_HOUR, minutesSinceMidnight } from "@/lib/schedule";
import {
  firstUpcomingOccurrence,
  listUpcomingOccurrences,
} from "@/lib/recurring-schedule";

describe("Europe/Moscow wall time", () => {
  it("creates 23:00 Moscow as 20:00 UTC and displays 23:00", () => {
    const instant = fromAppWall(2026, 10, 22, 23, 0, 0);
    expect(instant.toISOString()).toBe("2026-10-22T20:00:00.000Z");
    expect(appDateKey(instant)).toBe("2026-10-22");
    expect(appTimeHm(instant)).toBe("23:00");
    expect(
      formatInAppZone(instant, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    ).toMatch(/23:00/);
  });

  it("round-trips datetime-local as Moscow, not the host zone", () => {
    const iso = fromAppDateTimeLocalValue("2026-10-22T23:00");
    expect(iso).toBe("2026-10-22T20:00:00.000Z");
    expect(toAppDateTimeLocalValue(iso)).toBe("2026-10-22T23:00");
  });

  it("does not shift a date-only key through toISOString", () => {
    const midnight = fromAppDateOnly("2026-10-22");
    expect(appDateKey(midnight)).toBe("2026-10-22");
    expect(parseAppInstant("2026-10-22")).toEqual(midnight);
    expect(appDateKey(parseAppInstant("2026-10-22").toISOString())).toBe(
      "2026-10-22"
    );
  });

  it("keeps 23:00 on month boundary and next day after midnight", () => {
    const late = fromAppDateTime("2026-10-31", "23:00");
    expect(appDateKey(late)).toBe("2026-10-31");
    expect(appZonedParts(late).hour).toBe(23);
    expect(addAppDateKey("2026-10-31", 1)).toBe("2026-11-01");
    const nextMorning = fromAppDateTime("2026-11-01", "00:00");
    expect(nextMorning.getTime()).toBeGreaterThan(late.getTime());
    expect(appDateKey(nextMorning)).toBe("2026-11-01");
  });

  it("shows the same Moscow clock in the formatter for a UTC instant", () => {
    const utcEvening = "2026-03-10T17:00:00.000Z";
    expect(appDateKey(utcEvening)).toBe("2026-03-10");
    expect(appTimeHm(utcEvening)).toBe("20:00");
    expect(parseAppInstant(utcEvening).toISOString()).toBe(utcEvening);
  });

  it("materializes a recurring 23:00 Moscow slot on the next matching weekday", () => {
    const now = fromAppWall(2026, 10, 14, 15, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [3],
        startTime: "23:00",
        durationMin: 60,
        activeFrom: fromAppDateOnly("2026-10-14"),
      },
      now,
      2
    );
    expect(occ.length).toBeGreaterThan(0);
    expect(appDateKey(occ[0]!.startsAt)).toBe("2026-10-14");
    expect(appZonedParts(occ[0]!.startsAt).hour).toBe(23);
    expect(occ[0]!.occurrenceKey).toBe("2026-10-14");
  });

  it("keeps schedule edit date on the chosen Moscow day", () => {
    const iso = fromAppDateTimeLocalValue("2026-10-22T10:30");
    expect(toAppDateTimeLocalValue(iso)).toBe("2026-10-22T10:30");
    const first = firstUpcomingOccurrence(
      {
        weekdays: [4],
        startTime: "10:30",
        durationMin: 60,
        activeFrom: parseAppInstant("2026-10-22"),
      },
      fromAppWall(2026, 10, 21, 12, 0)
    );
    expect(first).not.toBeNull();
    expect(appDateKey(first!.startsAt)).toBe("2026-10-22");
    expect(appTimeHm(first!.startsAt)).toBe("10:30");
  });

  it("places 21–23:00 lessons inside the 24:00 grid", () => {
    expect(DAY_END_HOUR).toBe(24);
    for (const hour of [21, 22, 23]) {
      const start = fromAppWall(2026, 10, 22, hour, 0);
      const minutes = minutesSinceMidnight(start);
      expect(minutes).toBe(hour * 60);
      expect(minutes).toBeLessThan(DAY_END_HOUR * 60);
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
    }
  });
});
