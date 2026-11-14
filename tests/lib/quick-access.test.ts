import { describe, expect, it } from "vitest";

import {
  QUICK_ACCESS_ACTIONS,
  QUICK_ACCESS_TYPES,
  isQuickAccessType,
  quickAccessPath,
} from "@/lib/quick-access";

describe("quick access helpers", () => {
  it("covers four table types with dedicated actions", () => {
    expect(QUICK_ACCESS_TYPES).toEqual([
      "baza",
      "rnp-avito",
      "probnye-uroki",
      "rashody",
    ]);
    for (const type of QUICK_ACCESS_TYPES) {
      expect(isQuickAccessType(type)).toBe(true);
      expect(QUICK_ACCESS_ACTIONS[type].length).toBeGreaterThan(0);
      expect(quickAccessPath(type, "tok")).toBe(`/quick-access/${type}/tok`);
    }
    expect(isQuickAccessType("salaries")).toBe(false);
  });

  it("keeps table actions isolated", () => {
    expect(QUICK_ACCESS_ACTIONS.baza).not.toContain("listExpenses");
    expect(QUICK_ACCESS_ACTIONS.rashody).not.toContain("listBaseLeads");
    expect(QUICK_ACCESS_ACTIONS["rnp-avito"]).toContain("syncRnpAvitoMonth");
  });
});
