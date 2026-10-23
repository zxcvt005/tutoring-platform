import { describe, expect, it } from "vitest";

import {
  auditoriaNavItems,
  direkciyaNavItems,
  kafedraNavItems,
} from "@/lib/cabinet-nav";

describe("cabinet navigation", () => {
  it("renames payments tab to Доходы and keeps route", () => {
    const payments = direkciyaNavItems.find(
      (i) => i.href === "/direkciya/payments"
    );
    expect(payments?.label).toBe("Доходы");
  });

  it("does not show Auditoria schedule tab", () => {
    expect(auditoriaNavItems.map((i) => i.href)).not.toContain(
      "/auditoria/schedule"
    );
    expect(auditoriaNavItems.map((i) => i.label)).not.toContain("Расписание");
  });

  it("does not show Kafedra results tab", () => {
    expect(kafedraNavItems.map((i) => i.href)).not.toContain("/kafedra/results");
    expect(kafedraNavItems.map((i) => i.label)).not.toContain("Результаты");
  });

  it("adds Theory to teacher and student cabinets", () => {
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/theory",
      label: "Теория",
    });
    expect(auditoriaNavItems).toContainEqual({
      href: "/auditoria/theory",
      label: "Теория",
    });
  });
});
