import { describe, expect, it } from "vitest";

import {
  mergeAvitoDayMetrics,
  parseAvitoDayKey,
  parseItemStatsByDay,
  parseSpendingsByDay,
} from "@/server/avito/parse-stats";

describe("avito parse-stats", () => {
  it("parses day keys without timezone drift", () => {
    expect(parseAvitoDayKey("2026-11-05")).toBe("2026-11-05");
    expect(parseAvitoDayKey(20261105)).toBe("2026-11-05");
    expect(parseAvitoDayKey("2026-11-05T23:00:00Z")).toBe("2026-11-05");
  });

  it("parses spendings by day preferring promotion slug", () => {
    const map = parseSpendingsByDay({
      result: {
        timestamp: 1,
        groupings: [
          {
            date: "2026-11-01",
            type: "day",
            spendings: [
              { slug: "promotion", value: 1500.4, services: [] },
              { slug: "presence", value: 200, services: [] },
            ],
          },
          {
            date: "2026-11-02",
            type: "day",
            spendings: [{ slug: "presence", value: 99.6, services: [] }],
          },
        ],
      },
    });
    expect(map.get("2026-11-01")).toBe(1500);
    expect(map.get("2026-11-02")).toBe(100);
  });

  it("aggregates item stats for the same day across rows", () => {
    const map = parseItemStatsByDay({
      result: {
        dataTotalCount: 2,
        groupings: [
          {
            id: 20261101,
            type: "day",
            metrics: [
              { slug: "impressions", value: 100 },
              { slug: "views", value: 40 },
              { slug: "contacts", value: 5 },
            ],
          },
          {
            id: 20261101,
            type: "day",
            metrics: [
              { slug: "impressions", value: 50 },
              { slug: "views", value: 10 },
              { slug: "contacts", value: 2 },
            ],
          },
          {
            id: 20261102,
            type: "day",
            metrics: [
              { slug: "impressions", value: 10 },
              { slug: "views", value: 3 },
              { slug: "contacts", value: 1 },
            ],
          },
        ],
      },
    });
    expect(map.get("2026-11-01")).toEqual({
      impressions: 150,
      views: 50,
      contacts: 7,
    });
    expect(map.get("2026-11-02")).toEqual({
      impressions: 10,
      views: 3,
      contacts: 1,
    });
  });

  it("merges spendings and item counters without inventing zeros for missing sources", () => {
    const spendings = new Map([
      ["2026-11-01", 2000],
      ["2026-11-03", 500],
    ]);
    const items = new Map([
      ["2026-11-01", { impressions: 10, views: 4, contacts: 1 }],
      ["2026-11-02", { impressions: 5, views: 2, contacts: 0 }],
    ]);
    const merged = mergeAvitoDayMetrics(
      ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
      spendings,
      items
    );
    expect(merged.get("2026-11-01")).toEqual({
      budgetSpentRub: 2000,
      impressions: 10,
      views: 4,
      contacts: 1,
      hasBudget: true,
      hasItems: true,
    });
    // Items without spendings → budget null (not 0) — regress first-day budget bug
    expect(merged.get("2026-11-02")).toEqual({
      budgetSpentRub: null,
      impressions: 5,
      views: 2,
      contacts: 0,
      hasBudget: false,
      hasItems: true,
    });
    expect(merged.get("2026-11-03")).toEqual({
      budgetSpentRub: 500,
      impressions: null,
      views: null,
      contacts: null,
      hasBudget: true,
      hasItems: false,
    });
    expect(merged.has("2026-11-04")).toBe(false);
  });

  it("rejects unknown spendings payload shape", () => {
    expect(() => parseSpendingsByDay({ ok: true })).toThrow(/неожиданный формат/);
  });
});
