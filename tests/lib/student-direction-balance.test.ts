import { describe, expect, it } from "vitest";

import {
  directionBalancesLabel,
  formatRubAmount,
  minDirectionBalance,
  packageStatusFromBalance,
} from "@/lib/student-direction-balance";

describe("student-direction-balance helpers", () => {
  it("treats empty balances as missing data, not zero", () => {
    expect(minDirectionBalance({})).toBeNull();
    expect(minDirectionBalance({ directionBalances: [] })).toBeNull();
    expect(directionBalancesLabel({ directionBalances: [] })).toBe("—");
    expect(packageStatusFromBalance(null)).toBe("none");
  });

  it("maps debt and exhausted from ledger remaining", () => {
    expect(packageStatusFromBalance(3)).toBe("active");
    expect(packageStatusFromBalance(0)).toBe("exhausted");
    expect(packageStatusFromBalance(-1)).toBe("debt");
    expect(
      minDirectionBalance({
        directionBalances: [
          { directionId: "a", balance: 5 },
          { directionId: "b", balance: 1 },
        ],
      })
    ).toBe(1);
  });

  it("formats rub amounts like director income", () => {
    expect(formatRubAmount(12000)).toMatch(/12[\u00a0\u202f ]?000 ₽/);
    expect(formatRubAmount(-500)).toBe("−500 ₽");
  });
});
