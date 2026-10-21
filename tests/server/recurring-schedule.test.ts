import { describe, it, expect } from "vitest";

import {
  AUDITORIA_UPCOMING_DAYS,
  filterUpcomingLessonsForAuditoria,
  firstUpcomingOccurrence,
  isWithinUpcomingWindow,
  listUpcomingOccurrences,
} from "@/lib/recurring-schedule";

/** Фиксированная «среда» 2026-10-14 15:00 локально (среда). */
function fixedNow(h = 15, m = 0) {
  return new Date(2026, 9, 14, h, m, 0, 0);
}

describe("recurring schedule occurrences", () => {
  it("skips weekday already passed this week", () => {
    // Сейчас среда 15:00; слот вт 17:00 → следующий вторник 20.10
    const now = fixedNow(15, 0);
    const occ = listUpcomingOccurrences(
      {
        weekdays: [2], // вт
        startTime: "17:00",
        durationMin: 60,
        activeFrom: now,
      },
      now,
      3
    );
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0].startsAt.getDay()).toBe(2); // JS Tuesday
    expect(occ[0].startsAt.getDate()).toBe(20);
    expect(occ[0].startsAt.getMonth()).toBe(9);
  });

  it("skips today if lesson time already passed", () => {
    // Среда 18:00; слот ср 17:00 уже прошёл
    const now = fixedNow(18, 0);
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
    expect(occ[0].startsAt.getDate()).toBe(21); // следующая среда
    expect(occ.every((o) => o.startsAt.getTime() > now.getTime())).toBe(true);
  });

  it("includes today if time is still in the future", () => {
    const now = fixedNow(14, 0);
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
    expect(first!.startsAt.getDate()).toBe(14);
    expect(first!.startsAt.getHours()).toBe(17);
  });

  it("does not backfill past weeks when activeFrom is now", () => {
    const now = fixedNow(12, 0);
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
    // Не должно быть слотов до «сегодня»
    expect(occ.some((o) => o.startsAt.getDate() < 14 && o.startsAt.getMonth() === 9)).toBe(
      false
    );
  });

  it("repeats Tue/Thu weekly without duplicates in keys", () => {
    const now = fixedNow(10, 0);
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
    // чередование вт/чт
    const weekdays = occ.map((o) => o.startsAt.getDay());
    expect(weekdays.every((d) => d === 2 || d === 4)).toBe(true);
  });
});

describe("auditoria 14-day window", () => {
  it("includes boundary at exactly +14 days", () => {
    const now = fixedNow(12, 0);
    const edge = new Date(now.getTime() + AUDITORIA_UPCOMING_DAYS * 86_400_000);
    expect(isWithinUpcomingWindow(edge.toISOString(), now)).toBe(true);
  });

  it("excludes past and beyond 14 days", () => {
    const now = fixedNow(12, 0);
    const past = new Date(now.getTime() - 60_000).toISOString();
    const far = new Date(
      now.getTime() + (AUDITORIA_UPCOMING_DAYS + 1) * 86_400_000
    ).toISOString();
    expect(isWithinUpcomingWindow(past, now)).toBe(false);
    expect(isWithinUpcomingWindow(far, now)).toBe(false);
  });

  it("filterUpcomingLessonsForAuditoria keeps only planned in window", () => {
    const now = fixedNow(12, 0);
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
});
