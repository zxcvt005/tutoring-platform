import { describe, expect, it } from "vitest";

import {
  MIN_AVAILABILITY_SLOTS,
  isStudentFullyOnboarded,
  isStudentListedInDirectory,
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

  it("lists students only after questionnaire (complete / legacy availability_pending)", () => {
    expect(isStudentListedInDirectory(undefined)).toBe(true);
    expect(isStudentListedInDirectory(null)).toBe(true);
    expect(isStudentListedInDirectory("complete")).toBe(true);
    expect(isStudentListedInDirectory("availability_pending")).toBe(true);
    expect(isStudentListedInDirectory("invited")).toBe(false);
    expect(isStudentListedInDirectory("profile_pending")).toBe(false);
    // alias keeps same semantics for roster visibility
    expect(isStudentFullyOnboarded("availability_pending")).toBe(true);
    expect(isStudentFullyOnboarded("invited")).toBe(false);
  });

  it("does not force availability step after questionnaire", () => {
    expect(onboardingPathForStatus("complete")).toBeNull();
    expect(onboardingPathForStatus("availability_pending")).toBeNull();
    expect(onboardingPathForStatus("profile_pending")).toBe(
      "/auditoria/onboarding/profile"
    );
    expect(onboardingPathForStatus("invited")).toBe(
      "/auditoria/onboarding/profile"
    );
  });

  it("keeps suggested minimum for optional availability UI", () => {
    expect(MIN_AVAILABILITY_SLOTS).toBe(3);
  });
});
