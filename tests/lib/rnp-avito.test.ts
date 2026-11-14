import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  aggregateManualTrialsByCreatedAppDay,
  buildMonthDayShell,
  computeRnpAvitoDerived,
  daysInMonth,
  formatDayHeader,
  formatMonthTitle,
  formatRnpNumber,
  resolveTrialDayFields,
  shiftMonth,
  sumMetric,
  totalsFromDays,
} from "@/lib/rnp-avito";

describe("rnp-avito helpers", () => {
  it("builds day columns for a month", () => {
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    const days = buildMonthDayShell(2026, 11);
    expect(days).toHaveLength(30);
    expect(days[0]!.date).toBe("2026-11-01");
    expect(days[29]!.date).toBe("2026-11-30");
    expect(formatDayHeader("2026-11-01")).toBe("01.11");
    expect(formatMonthTitle(2026, 11)).toBe("Ноябрь 2026");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("sums absolute metrics and derives ratios from monthly totals", () => {
    const days = buildMonthDayShell(2026, 11).map((d, i) => {
      if (i === 0) {
        return {
          ...d,
          budgetSpentRub: 10000,
          impressions: 1000,
          views: 200,
          contacts: 40,
          trialsScheduled: 5,
          trialsCompleted: 4,
        };
      }
      if (i === 1) {
        return {
          ...d,
          budgetSpentRub: 6000,
          impressions: 500,
          views: 100,
          contacts: 10,
          trialsScheduled: 1,
          trialsCompleted: 1,
        };
      }
      return d;
    });

    expect(sumMetric(days, "budgetSpentRub")).toBe(16000);
    expect(sumMetric(days, "impressions")).toBe(1500);
    const totals = totalsFromDays(days);
    const derived = computeRnpAvitoDerived(totals);
    expect(derived.costPerTrial).toBe(16000 / 5);
    expect(derived.impressionsToViews).toBeCloseTo((300 / 1500) * 100);
    expect(derived.viewsToContacts).toBeCloseTo((50 / 300) * 100);
    expect(derived.contactsToTrials).toBeCloseTo((5 / 50) * 100);
  });

  it("keeps derived cells empty when denominator is zero or missing", () => {
    const derived = computeRnpAvitoDerived({
      budgetSpentRub: 1000,
      impressions: null,
      views: 10,
      contacts: 0,
      trialsScheduled: null,
      trialsCompleted: 0,
    });
    expect(derived.costPerTrial).toBeNull();
    expect(derived.impressionsToViews).toBeNull();
    expect(derived.viewsToContacts).toBe(0);
    expect(derived.contactsToTrials).toBeNull();
  });

  it("formats money and percent for display", () => {
    expect(formatRnpNumber(16000, "money")).toBe("16\u00a0000 ₽");
    expect(formatRnpNumber(12.34, "percent")).toBe("12,3%");
    expect(formatRnpNumber(null, "int")).toBe("");
  });

  it("resolves independent manual overrides per trial cell", () => {
    const auto = resolveTrialDayFields(null, { scheduled: 5, completed: 3 });
    expect(auto).toEqual({
      trialsScheduled: 5,
      trialsCompleted: 3,
      trialsScheduledSource: "automatic",
      trialsCompletedSource: "automatic",
    });
    const mixed = resolveTrialDayFields(
      {
        trialsScheduled: 4,
        trialsCompleted: 99,
        trialsScheduledIsManual: true,
        trialsCompletedIsManual: false,
      },
      { scheduled: 5, completed: 3 }
    );
    expect(mixed).toEqual({
      trialsScheduled: 4,
      trialsCompleted: 3,
      trialsScheduledSource: "manual",
      trialsCompletedSource: "automatic",
    });
  });

  it("aggregates assigned/completed trials by Moscow createdAt day", () => {
    const rows = [
      { createdAt: fromAppWall(2026, 11, 5, 10, 0, 0), attended: false },
      { createdAt: fromAppWall(2026, 11, 12, 15, 0, 0), attended: true },
      { createdAt: fromAppWall(2026, 11, 18, 9, 0, 0), attended: true },
      { createdAt: fromAppWall(2026, 12, 2, 11, 0, 0), attended: false },
      { createdAt: fromAppWall(2026, 12, 31, 23, 30, 0), attended: true },
      { createdAt: fromAppWall(2027, 1, 1, 0, 30, 0), attended: false },
    ];
    const nov = aggregateManualTrialsByCreatedAppDay(rows, 2026, 11);
    expect(nov.get("2026-11-05")).toEqual({ scheduled: 1, completed: 0 });
    expect(nov.get("2026-11-12")).toEqual({ scheduled: 1, completed: 1 });
    expect(nov.get("2026-11-18")).toEqual({ scheduled: 1, completed: 1 });
    expect([...nov.values()].reduce((s, v) => s + v.scheduled, 0)).toBe(3);
    expect([...nov.values()].reduce((s, v) => s + v.completed, 0)).toBe(2);

    const dec = aggregateManualTrialsByCreatedAppDay(rows, 2026, 12);
    expect([...dec.values()].reduce((s, v) => s + v.scheduled, 0)).toBe(2);
    expect([...dec.values()].reduce((s, v) => s + v.completed, 0)).toBe(1);

    const jan = aggregateManualTrialsByCreatedAppDay(rows, 2027, 1);
    expect(jan.get("2027-01-01")).toEqual({ scheduled: 1, completed: 0 });
  });
});
