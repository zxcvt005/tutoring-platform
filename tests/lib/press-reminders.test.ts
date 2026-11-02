import { describe, expect, it } from "vitest";

import { appDateKey, fromAppWall } from "@/lib/app-time";
import {
  daysInMonth,
  nextReminderOccurrenceAfter,
  reminderCompletionProgress,
  reminderOccurrenceAt,
} from "@/lib/press-reminders";

describe("press reminder recurrence", () => {
  it("keeps daily and weekly wall-clock in Moscow", () => {
    const start = fromAppWall(2026, 10, 27, 9, 30);
    const nextDay = reminderOccurrenceAt(start, "daily", 1);
    expect(appDateKey(nextDay)).toBe("2026-10-28");
    expect(nextDay.getTime()).toBe(fromAppWall(2026, 10, 28, 9, 30).getTime());

    const nextWeek = reminderOccurrenceAt(start, "weekly", 1);
    expect(appDateKey(nextWeek)).toBe("2026-11-03");
  });

  it("clamps monthly 31st to the last day of shorter months", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    const start = fromAppWall(2026, 1, 31, 10, 0);
    const february = reminderOccurrenceAt(start, "monthly", 1);
    expect(appDateKey(february)).toBe("2026-02-28");
    const march = reminderOccurrenceAt(start, "monthly", 2);
    expect(appDateKey(march)).toBe("2026-03-31");
  });

  it("computes daily progress without dividing by zero", () => {
    expect(reminderCompletionProgress([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    });
    expect(
      reminderCompletionProgress([
        { completedAt: "x" },
        { completedAt: null },
        { completedAt: "y" },
      ])
    ).toEqual({ completed: 2, total: 3, percent: 67 });
  });

  it("advances from a clamped February date back to the original 31st", () => {
    const start = fromAppWall(2026, 1, 31, 18, 0);
    const feb = reminderOccurrenceAt(start, "monthly", 1);
    const afterFeb = nextReminderOccurrenceAfter(start, "monthly", feb);
    expect(appDateKey(afterFeb)).toBe("2026-03-31");
  });
});
