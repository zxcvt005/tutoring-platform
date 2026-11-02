import { describe, expect, it } from "vitest";

import {
  CALL_WITHOUT_LESSON_MESSAGE,
  callDurationMs,
  callMonthKey,
  callMonthOptions,
  defaultCallMonth,
  formatCallDuration,
  totalKnownCallDurationMs,
} from "@/lib/video/call-history";

describe("student call history display", () => {
  it("reads duration only from created and ended timestamps", () => {
    expect(
      callDurationMs("2026-10-30T11:00:00.000Z", "2026-10-30T11:45:00.000Z")
    ).toBe(45 * 60_000);
    expect(callDurationMs("2026-10-30T11:00:00.000Z", null)).toBeNull();
    expect(
      callDurationMs("2026-10-30T11:45:00.000Z", "2026-10-30T11:00:00.000Z")
    ).toBeNull();
  });

  it("formats minutes and hours without inventing a zero for unknown duration", () => {
    expect(formatCallDuration(45 * 60_000)).toBe("45 мин");
    expect(formatCallDuration((28 * 60 + 15) * 60_000)).toBe("28 ч 15 мин");
    expect(formatCallDuration(2 * 60 * 60_000)).toBe("2 ч");
    expect(formatCallDuration(null)).toBe("—");
  });

  it("sums only calls that actually ended", () => {
    const total = totalKnownCallDurationMs([
      {
        createdAt: "2026-10-30T11:00:00.000Z",
        endedAt: "2026-10-30T11:45:00.000Z",
      },
      { createdAt: "2026-10-30T12:00:00.000Z", endedAt: null },
      {
        createdAt: "2026-10-30T13:00:00.000Z",
        endedAt: "2026-10-30T13:15:00.000Z",
      },
    ]);
    expect(total).toBe(60 * 60_000);
    expect(
      totalKnownCallDurationMs([
        { createdAt: "2026-10-30T12:00:00.000Z", endedAt: null },
      ])
    ).toBeNull();
  });

  it("groups months in the app timezone and keeps the current month available", () => {
    const october = "2026-10-30T10:00:00.000Z";
    expect(callMonthKey(october)).toBe("2026-10");
    const options = callMonthOptions(
      [october],
      new Date("2026-11-01T10:00:00.000Z")
    );
    expect(options.map((item) => item.key)).toEqual(["2026-11", "2026-10"]);
    expect(defaultCallMonth([october], new Date("2026-11-01T10:00:00.000Z"))).toBe(
      "2026-10"
    );
    expect(
      defaultCallMonth([october], new Date("2026-10-31T10:00:00.000Z"))
    ).toBe("2026-10");
  });

  it("explains that a call is not linked to a lesson", () => {
    expect(CALL_WITHOUT_LESSON_MESSAGE).toMatch(/не привязан к занятию/);
  });
});
