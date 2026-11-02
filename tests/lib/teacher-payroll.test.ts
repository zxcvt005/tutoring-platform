import { describe, expect, it } from "vitest";

import {
  amountForPresentCount,
  netSlotAmount,
  teacherDebtFromTotals,
} from "@/lib/teacher-payroll";
import { summarizeLedger } from "@/lib/teacher-payroll-analytics";
import {
  countStudentsInTeacherSlot,
  MAX_SLOT_STUDENTS,
  teacherSlotKey,
  wouldExceedSlotStudentLimit,
} from "@/lib/teacher-slot";

const rates = { 1: 120_000, 2: 160_000, 3: 200_000, 4: 240_000, 5: 280_000 };

describe("teacher payroll calculation", () => {
  it("picks the rate for 1–5 present students", () => {
    expect(amountForPresentCount(rates, 1)).toEqual({
      ok: true,
      amountKopecks: 120_000,
    });
    expect(amountForPresentCount(rates, 2)).toEqual({
      ok: true,
      amountKopecks: 160_000,
    });
    expect(amountForPresentCount(rates, 3)).toEqual({
      ok: true,
      amountKopecks: 200_000,
    });
    expect(amountForPresentCount(rates, 4)).toEqual({
      ok: true,
      amountKopecks: 240_000,
    });
    expect(amountForPresentCount(rates, 5)).toEqual({
      ok: true,
      amountKopecks: 280_000,
    });
  });

  it("pays 0 when nobody is present and blocks counts above 5", () => {
    expect(amountForPresentCount(rates, 0)).toEqual({
      ok: true,
      amountKopecks: 0,
    });
    expect(amountForPresentCount(rates, 6)).toEqual({
      ok: false,
      reason: "present_count_out_of_range",
    });
  });

  it("does not guess a rate when the needed count is missing", () => {
    expect(amountForPresentCount({ 1: 120_000 }, 3)).toEqual({
      ok: false,
      reason: "rate_missing_for_count",
    });
    expect(amountForPresentCount({}, 2)).toEqual({
      ok: false,
      reason: "rates_not_configured",
    });
  });

  it("counts unique active students in a slot and enforces the cap", () => {
    const lessons = [
      {
        id: "a",
        teacherId: "t1",
        startsAt: "2026-10-26T14:00:00.000Z",
        status: "planned" as const,
        studentIds: ["s1"],
      },
      {
        id: "b",
        teacherId: "t1",
        startsAt: "2026-10-26T14:00:00.000Z",
        status: "planned" as const,
        studentIds: ["s2"],
      },
    ];
    expect(
      countStudentsInTeacherSlot(
        lessons,
        teacherSlotKey("t1", "2026-10-26T14:00:00.000Z")
      )
    ).toBe(2);
    expect(MAX_SLOT_STUDENTS).toBe(5);
    expect(
      wouldExceedSlotStudentLimit(lessons, {
        teacherId: "t1",
        startsAt: "2026-10-26T14:00:00.000Z",
        studentIds: ["s3", "s4", "s5", "s6"],
      })
    ).toBe(true);
  });

  it("keeps original accrual and adds an adjustment in the net", () => {
    expect(
      netSlotAmount([
        { type: "accrual", amountKopecks: 200_000 },
        { type: "adjustment", amountKopecks: -40_000 },
      ])
    ).toBe(160_000);
  });

  it("computes debt as accruals plus adjustments minus payouts", () => {
    expect(
      teacherDebtFromTotals({
        accruedKopecks: 80_000_00,
        adjustmentsKopecks: 0,
        paidKopecks: 70_000_00,
      })
    ).toBe(10_000_00);
  });

  it("treats period totals as distinct from current debt", () => {
    const rows = [
      {
        teacherId: "t1",
        type: "accrual" as const,
        amountKopecks: 200_000,
        presentCount: 3,
        occurredAt: "2026-01-10T10:00:00.000Z",
        createdAt: "2026-01-10T10:00:00.000Z",
      },
      {
        teacherId: "t1",
        type: "payout" as const,
        amountKopecks: 50_000,
        presentCount: null,
        occurredAt: "2026-10-01T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
      },
    ];
    const summary = summarizeLedger(rows, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.000Z",
    });
    expect(summary.accruedPeriodKopecks).toBe(0);
    expect(summary.paidPeriodKopecks).toBe(50_000);
    expect(summary.debtKopecks).toBe(150_000);
  });
});
