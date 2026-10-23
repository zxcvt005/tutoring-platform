import { describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import {
  buildCurrentTariffOverview,
  buildMonthSummaries,
  calendarDaysUntil,
  countStudentsAtMonthEnd,
  filterIncomePayments,
  isRevenuePayment,
  monthKeyFromInstant,
  pickCurrentPaidAssignment,
} from "@/lib/income-analytics";
import type { StudentTariffAssignment } from "@/lib/types";

function asg(
  partial: Partial<StudentTariffAssignment> &
    Pick<StudentTariffAssignment, "id" | "studentId" | "tariffId">
): StudentTariffAssignment {
  return {
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-10-31T21:00:00.000Z",
    priceSnapshot: 10000,
    currency: "RUB",
    status: "active",
    paymentStatus: "paid",
    tariffName: "Стандарт",
    lessonsRemaining: 4,
    packageStatus: "active",
    ...partial,
  };
}

describe("income month grouping", () => {
  it("groups paid revenue by Moscow calendar month of paidAt", () => {
    const octPaid = fromAppWall(2026, 10, 5, 12, 0, 0).toISOString();
    const sepPaid = fromAppWall(2026, 9, 20, 12, 0, 0).toISOString();
    const months = buildMonthSummaries({
      payments: [
        {
          id: "p1",
          studentId: "s1",
          assignmentId: "a1",
          amount: 12000,
          status: "paid",
          paidAt: octPaid,
          createdAt: octPaid,
        },
        {
          id: "p2",
          studentId: "s2",
          assignmentId: "a2",
          amount: 8000,
          status: "paid",
          paidAt: octPaid,
          createdAt: octPaid,
        },
        {
          id: "p3",
          studentId: "s1",
          assignmentId: "a3",
          amount: 5000,
          status: "paid",
          paidAt: sepPaid,
          createdAt: sepPaid,
        },
        {
          id: "p4",
          studentId: "s3",
          assignmentId: "a4",
          amount: 9000,
          status: "pending",
          paidAt: null,
          createdAt: octPaid,
        },
        {
          id: "p5",
          studentId: "s3",
          assignmentId: "a5",
          amount: 9000,
          status: "cancelled",
          paidAt: null,
          createdAt: octPaid,
        },
      ],
      students: [
        {
          id: "s1",
          fullName: "Алиса",
          createdAt: fromAppWall(2026, 8, 1).toISOString(),
        },
        {
          id: "s2",
          fullName: "Борис",
          createdAt: fromAppWall(2026, 10, 1).toISOString(),
        },
        {
          id: "s3",
          fullName: "Вика",
          createdAt: fromAppWall(2026, 11, 1).toISOString(),
        },
      ],
      assignments: [
        { id: "a1", tariffName: "Стандарт" },
        { id: "a2", tariffName: "Интенсив" },
        { id: "a3", tariffName: "Стандарт" },
        { id: "a4", tariffName: "Стандарт" },
        { id: "a5", tariffName: "Стандарт" },
      ],
    });

    const oct = months.find((m) => m.monthKey === "2026-10");
    expect(oct).toBeTruthy();
    expect(oct!.purchasedTariffs).toBe(2);
    expect(oct!.revenue).toBe(20000);
    expect(oct!.averagePurchaseAmount).toBe(10000);
    // s1 + s2 созданы к концу октября; s3 — в ноябре
    expect(oct!.studentsAtMonthEnd).toBe(2);
    expect(oct!.studentsAtMonthEndReliable).toBe(false);

    const sep = months.find((m) => m.monthKey === "2026-09");
    expect(sep!.purchasedTariffs).toBe(1);
    expect(sep!.revenue).toBe(5000);
    expect(sep!.studentsAtMonthEnd).toBe(1);
  });

  it("empty month shows zero revenue and null average", () => {
    const months = buildMonthSummaries({
      payments: [],
      students: [],
      assignments: [],
    });
    const current = monthKeyFromInstant(new Date());
    const m = months.find((x) => x.monthKey === current);
    expect(m).toBeTruthy();
    expect(m!.revenue).toBe(0);
    expect(m!.purchasedTariffs).toBe(0);
    expect(m!.averagePurchaseAmount).toBeNull();
  });

  it("does not count unpaid or cancelled as revenue", () => {
    expect(
      isRevenuePayment({ status: "pending", paidAt: "2026-10-01" })
    ).toBe(false);
    expect(isRevenuePayment({ status: "paid", paidAt: null })).toBe(false);
    expect(
      isRevenuePayment({ status: "cancelled", paidAt: "2026-10-01" })
    ).toBe(false);
    expect(
      isRevenuePayment({ status: "paid", paidAt: "2026-10-01T00:00:00.000Z" })
    ).toBe(true);
  });

  it("historical student count does not grow when later students appear", () => {
    const monthKey = "2026-09";
    const early = countStudentsAtMonthEnd(
      [
        {
          createdAt: fromAppWall(2026, 9, 15).toISOString(),
        },
      ],
      monthKey
    );
    const withLater = countStudentsAtMonthEnd(
      [
        {
          createdAt: fromAppWall(2026, 9, 15).toISOString(),
        },
        {
          createdAt: fromAppWall(2026, 10, 5).toISOString(),
        },
      ],
      monthKey
    );
    expect(early.count).toBe(1);
    expect(withLater.count).toBe(1);
  });

  it("filters payments by student name and status", () => {
    const rows = filterIncomePayments(
      [
        {
          id: "1",
          studentId: "s1",
          studentName: "Анна Петрова",
          assignmentId: "a1",
          tariffName: "A",
          amount: 1,
          status: "paid",
          at: "x",
          createdAt: "x",
        },
        {
          id: "2",
          studentId: "s2",
          studentName: "Иван",
          assignmentId: "a2",
          tariffName: "B",
          amount: 2,
          status: "pending",
          at: "x",
          createdAt: "x",
        },
      ],
      { query: "петр", status: "paid" }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("1");
  });
});

describe("current tariff monitoring", () => {
  it("does not duplicate current assignments per student", () => {
    const overview = buildCurrentTariffOverview({
      students: [{ id: "s1", fullName: "Алиса" }],
      assignments: [
        asg({
          id: "old",
          studentId: "s1",
          tariffId: "t1",
          startsAt: "2026-08-01T00:00:00.000Z",
          endsAt: fromAppWall(2026, 9, 1).toISOString(),
          tariffName: "Старый",
        }),
        asg({
          id: "new",
          studentId: "s1",
          tariffId: "t2",
          startsAt: "2026-10-01T00:00:00.000Z",
          endsAt: fromAppWall(2026, 11, 15).toISOString(),
          tariffName: "Новый",
        }),
      ],
      now: fromAppWall(2026, 10, 22, 12, 0, 0),
    });
    expect(overview.activeCount + overview.expiredCount).toBe(1);
    expect(overview.byTariff).toHaveLength(1);
    expect(overview.byTariff[0]!.tariffName).toBe("Новый");
  });

  it("lists expired before soon endings", () => {
    const now = fromAppWall(2026, 10, 22, 12, 0, 0);
    const overview = buildCurrentTariffOverview({
      students: [
        { id: "s1", fullName: "Просрочен" },
        { id: "s2", fullName: "Скоро" },
      ],
      assignments: [
        asg({
          id: "a1",
          studentId: "s1",
          tariffId: "t1",
          endsAt: fromAppWall(2026, 10, 10).toISOString(),
          tariffName: "A",
        }),
        asg({
          id: "a2",
          studentId: "s2",
          tariffId: "t1",
          endsAt: fromAppWall(2026, 10, 24).toISOString(),
          tariffName: "A",
        }),
      ],
      now,
    });
    expect(overview.attention[0]!.studentName).toBe("Просрочен");
    expect(overview.attention[0]!.urgency).toBe("expired");
    expect(overview.attention[1]!.urgency).toBe("soon_3");
  });

  it("treats exhausted lessons as expired even if endsAt is future", () => {
    const overview = buildCurrentTariffOverview({
      students: [{ id: "s1", fullName: "Алиса" }],
      assignments: [
        asg({
          id: "a1",
          studentId: "s1",
          tariffId: "t1",
          endsAt: fromAppWall(2026, 12, 1).toISOString(),
          lessonsRemaining: 0,
          packageStatus: "exhausted",
        }),
      ],
      now: fromAppWall(2026, 10, 22, 12, 0, 0),
    });
    expect(overview.expiredCount).toBe(1);
    expect(overview.attention[0]!.urgencyLabel).toBe("Истёк");
  });

  it("uses Moscow calendar days for countdown", () => {
    const now = fromAppWall(2026, 10, 22, 23, 30, 0);
    const ends = fromAppWall(2026, 10, 25, 10, 0, 0);
    expect(calendarDaysUntil(ends, now)).toBe(3);
    expect(monthKeyFromInstant(fromAppWall(2026, 10, 1, 0, 30, 0))).toBe(
      "2026-10"
    );
  });

  it("pickCurrentPaidAssignment ignores unpaid and cancelled", () => {
    const picked = pickCurrentPaidAssignment(
      [
        asg({
          id: "unpaid",
          studentId: "s1",
          tariffId: "t1",
          status: "pending_payment",
          paymentStatus: "unpaid",
        }),
        asg({
          id: "paid",
          studentId: "s1",
          tariffId: "t2",
          startsAt: "2026-09-01T00:00:00.000Z",
        }),
      ],
      "s1"
    );
    expect(picked?.id).toBe("paid");
  });
});
