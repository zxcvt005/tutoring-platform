import { describe, expect, it } from "vitest";

import {
  computeExpenseTotals,
  formatExpenseAmountRub,
  formatExpenseDateDisplay,
  moscowCalendarDate,
} from "@/lib/expenses";

describe("expenses lib", () => {
  it("formats date and amount for the table", () => {
    expect(formatExpenseDateDisplay("2026-09-02")).toBe("02.09");
    expect(formatExpenseAmountRub(5000).replace(/\s/g, " ")).toBe("5 000 ₽");
  });

  it("computes category totals from monthly rows", () => {
    const { totalAmountRub, categoryTotals } = computeExpenseTotals([
      {
        id: "1",
        category: "Авито",
        comment: "",
        expenseDate: "2026-09-01",
        amountRub: 5000,
        source: "avito",
        externalId: "2026-09-01",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        category: "Налоги",
        comment: "",
        expenseDate: "2026-09-02",
        amountRub: 100000,
        source: "manual",
        externalId: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "3",
        category: "Авито",
        comment: "",
        expenseDate: "2026-09-03",
        amountRub: 2000,
        source: "manual",
        externalId: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    expect(totalAmountRub).toBe(107000);
    expect(categoryTotals.find((c) => c.category === "Авито")!.amountRub).toBe(
      7000
    );
    expect(categoryTotals.find((c) => c.category === "Налоги")!.amountRub).toBe(
      100000
    );
  });

  it("formats Moscow calendar dates without UTC drift", () => {
    // 2026-11-01 22:30 UTC → 2026-11-02 in Moscow (UTC+3)
    expect(moscowCalendarDate(new Date("2026-11-01T22:30:00.000Z"))).toBe(
      "2026-11-02"
    );
  });
});
