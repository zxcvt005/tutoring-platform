import { describe, expect, it } from "vitest";

import {
  MANUAL_TRIAL_SOURCES,
  computeManualTrialSumRub,
  formatManualTrialSumRub,
} from "@/lib/manual-trial-lessons";

describe("manual trial lessons helpers", () => {
  it("reuses the Base source catalog", () => {
    expect(MANUAL_TRIAL_SOURCES).toEqual([
      "Профи",
      "Авито",
      "Реклама",
      "Сарафан",
      "Блог",
    ]);
  });

  it("computes monthly sum as hours × rate × 4", () => {
    expect(computeManualTrialSumRub(2, 2000)).toBe(16000);
    expect(computeManualTrialSumRub(3, 2000)).toBe(24000);
    expect(computeManualTrialSumRub(null, 2000)).toBeNull();
    expect(computeManualTrialSumRub(2, null)).toBeNull();
    expect(computeManualTrialSumRub(-1, 2000)).toBeNull();
  });

  it("formats sum in rubles with thousand separators", () => {
    expect(formatManualTrialSumRub(16000)).toBe("16\u00a0000 ₽");
    expect(formatManualTrialSumRub(null)).toBe("");
  });
});
