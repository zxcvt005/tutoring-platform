import { describe, expect, it } from "vitest";

import {
  MIN_AVAILABILITY_SLOTS,
  isStudentFullyOnboarded,
  normalizeAvailabilitySlots,
  onboardingPathForStatus,
} from "@/lib/students/availability";

describe("student availability helpers", () => {
  it("normalizes and deduplicates slots", () => {
    expect(
      normalizeAvailabilitySlots([
        { weekday: 1, hourStart: 9 },
        { weekday: 1, hourStart: 9 },
        { weekday: 8, hourStart: 9 },
        { weekday: 2, hourStart: 6 },
        { weekday: 3, hourStart: 23 },
      ])
    ).toEqual([
      { weekday: 1, hourStart: 9 },
      { weekday: 3, hourStart: 23 },
    ]);
  });

  it("treats legacy/null as fully onboarded", () => {
    expect(isStudentFullyOnboarded(undefined)).toBe(true);
    expect(isStudentFullyOnboarded(null)).toBe(true);
    expect(isStudentFullyOnboarded("complete")).toBe(true);
    expect(isStudentFullyOnboarded("invited")).toBe(false);
    expect(isStudentFullyOnboarded("profile_pending")).toBe(false);
    expect(isStudentFullyOnboarded("availability_pending")).toBe(false);
  });

  it("routes unfinished onboarding to the right step", () => {
    expect(onboardingPathForStatus("complete")).toBeNull();
    expect(onboardingPathForStatus("profile_pending")).toBe(
      "/auditoria/onboarding/profile"
    );
    expect(onboardingPathForStatus("availability_pending")).toBe(
      "/auditoria/onboarding/availability"
    );
    expect(onboardingPathForStatus("invited")).toBe(
      "/auditoria/onboarding/profile"
    );
  });

  it("requires at least three slots for completion", () => {
    expect(MIN_AVAILABILITY_SLOTS).toBe(3);
  });
});
