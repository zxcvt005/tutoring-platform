import { describe, expect, it } from "vitest";

import {
  LESSON_BALANCE_DEBT_FLOOR,
  manualDebitViolatesDebtFloor,
} from "@/lib/lesson-balance-rules";

describe("manualDebitViolatesDebtFloor", () => {
  it("allows credits", () => {
    expect(manualDebitViolatesDebtFloor(-2, 4)).toBe(false);
  });

  it("allows debit down to debt floor", () => {
    expect(manualDebitViolatesDebtFloor(0, -2)).toBe(false);
    expect(manualDebitViolatesDebtFloor(-1, -1)).toBe(false);
  });

  it("blocks debit below debt floor without override", () => {
    expect(manualDebitViolatesDebtFloor(-1, -2)).toBe(true);
    expect(manualDebitViolatesDebtFloor(0, -3)).toBe(true);
    expect(manualDebitViolatesDebtFloor(LESSON_BALANCE_DEBT_FLOOR, -1)).toBe(
      true
    );
  });

  it("allows below floor with explicit admin flag", () => {
    expect(manualDebitViolatesDebtFloor(-1, -2, true)).toBe(false);
    expect(manualDebitViolatesDebtFloor(0, -5, true)).toBe(false);
  });
});
