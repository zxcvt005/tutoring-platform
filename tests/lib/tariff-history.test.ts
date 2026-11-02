import { describe, expect, it } from "vitest";

import { STUDENT_CHECKOUT_PATH } from "@/lib/payment-checkout";
import {
  assignmentHistoryStatus,
  buildTariffHistoryItems,
  remainingLooksExhausted,
  showsLastDebtAvailableCopy,
  tariffDaysLeftLabel,
  tariffHistoryStatusLabel,
  tariffTermView,
} from "@/lib/tariff-history";
import { tariffBalanceAlert } from "@/lib/tariff-warnings";
import type { PaymentRecord, StudentTariffAssignment } from "@/lib/types";

function asg(
  partial: Partial<StudentTariffAssignment> &
    Pick<StudentTariffAssignment, "id" | "studentId">
): StudentTariffAssignment {
  return {
    tariffId: "t1",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-11-01T00:00:00.000Z",
    priceSnapshot: 8000,
    currency: "RUB",
    status: "active",
    paymentStatus: "paid",
    lessonsLimitSnapshot: 8,
    tariffName: "Стандарт",
    lessonsRemaining: 4,
    ...partial,
  };
}

function pay(
  partial: Partial<PaymentRecord> & Pick<PaymentRecord, "id" | "assignmentId">
): PaymentRecord {
  return {
    studentId: "s1",
    amount: 8000,
    currency: "RUB",
    status: "paid",
    provider: "manual",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function historyFor(assignments: StudentTariffAssignment[]) {
  return buildTariffHistoryItems(
    assignments,
    assignments.map((a) => pay({ id: `p-${a.id}`, assignmentId: a.id })),
    "s1"
  );
}

describe("tariff history statuses", () => {
  it("keeps remaining-2 as current with expiring mark, not expired", () => {
    const current = asg({
      id: "a1",
      studentId: "s1",
      lessonsRemaining: 2,
    });
    const queued = asg({
      id: "a2",
      studentId: "s1",
      status: "queued",
      startsAt: "2026-10-20T00:00:00.000Z",
    });
    const items = historyFor([current, queued]);
    const cur = items.find((i) => i.id === "a1");
    const q = items.find((i) => i.id === "a2");
    expect(cur?.displayStatus).toBe("current");
    expect(tariffHistoryStatusLabel[cur!.displayStatus]).toBe("Текущий");
    expect(cur?.expiring).toBe(true);
    expect(q?.displayStatus).toBe("queued");
    expect(tariffHistoryStatusLabel[q!.displayStatus]).toBe("В очереди");
    expect(tariffBalanceAlert(2).showRenewCta).toBe(true);
    expect(STUDENT_CHECKOUT_PATH).toBe("/auditoria/pay/checkout");
  });

  it("keeps remaining-1 as current with expiring mark", () => {
    const items = historyFor([
      asg({ id: "a1", studentId: "s1", lessonsRemaining: 1 }),
    ]);
    expect(items[0]?.displayStatus).toBe("current");
    expect(items[0]?.expiring).toBe(true);
    expect(tariffHistoryStatusLabel[items[0]!.displayStatus]).toBe("Текущий");
    const alert = tariffBalanceAlert(1);
    expect(alert.tone).toBe("warn1");
    expect(alert.showRenewCta).toBe(true);
    expect(alert.message).toMatch(/последнее занятие/i);
  });

  it("shows remaining 0 as expired without last-debt copy", () => {
    const current = asg({
      id: "a1",
      studentId: "s1",
      lessonsRemaining: 0,
      packageStatus: "exhausted",
    });
    expect(remainingLooksExhausted(current)).toBe(true);
    expect(assignmentHistoryStatus(current, pay({ id: "p1", assignmentId: "a1" }))).toBe(
      "expired"
    );
    expect(tariffHistoryStatusLabel.expired).toBe("Истёк");
    expect(showsLastDebtAvailableCopy(0)).toBe(false);
    expect(tariffBalanceAlert(0).message).not.toMatch(/в долг/);
  });

  it("shows remaining -1 as expired without debt warning in the status", () => {
    const current = asg({
      id: "a1",
      studentId: "s1",
      lessonsRemaining: -1,
      packageStatus: "debt",
    });
    expect(remainingLooksExhausted(current)).toBe(true);
    expect(assignmentHistoryStatus(current, pay({ id: "p1", assignmentId: "a1" }))).toBe(
      "expired"
    );
    expect(tariffHistoryStatusLabel.expired).toBe("Истёк");
    expect(tariffHistoryStatusLabel.expired).not.toMatch(/в долг/);
    const alert = tariffBalanceAlert(-1);
    expect(alert.allowsLearning).toBe(false);
    expect(alert.allowsDebit).toBe(false);
  });

  it("shows a paid queued tariff as queued even when the old package is exhausted", () => {
    const current = asg({
      id: "a1",
      studentId: "s1",
      lessonsRemaining: 0,
      packageStatus: "exhausted",
    });
    const queued = asg({
      id: "a2",
      studentId: "s1",
      status: "queued",
      lessonsRemaining: 8,
      startsAt: "2026-10-20T00:00:00.000Z",
    });
    const items = historyFor([current, queued]);
    expect(items.find((i) => i.id === "a1")?.displayStatus).toBe("expired");
    expect(items.find((i) => i.id === "a2")?.displayStatus).toBe("queued");
  });

  it("shows rejected payment in history", () => {
    const items = buildTariffHistoryItems(
      [
        asg({
          id: "a1",
          studentId: "s1",
          status: "cancelled",
          paymentStatus: "unpaid",
        }),
      ],
      [
        pay({
          id: "p1",
          assignmentId: "a1",
          status: "rejected",
        }),
      ],
      "s1"
    );
    expect(items[0]?.displayStatus).toBe("rejected");
  });

  it("keeps repeated purchases of the same tariff as separate rows", () => {
    const items = historyFor([
      asg({
        id: "old",
        studentId: "s1",
        startsAt: "2026-04-01T00:00:00.000Z",
        endsAt: "2026-05-01T00:00:00.000Z",
        status: "expired",
        lessonsRemaining: 0,
      }),
      asg({
        id: "mid",
        studentId: "s1",
        startsAt: "2026-06-01T00:00:00.000Z",
        endsAt: "2026-07-01T00:00:00.000Z",
        status: "expired",
        lessonsRemaining: 0,
      }),
      asg({
        id: "new",
        studentId: "s1",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-10-28T00:00:00.000Z",
      }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["new", "mid", "old"]);
    expect(items.every((item) => item.title === "Стандарт")).toBe(true);
    expect(items[0]?.endsAt).toBe("2026-10-28T00:00:00.000Z");
  });
});

describe("tariff term progress", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("hides the bar when dates are missing or reversed", () => {
    expect(tariffTermView({ startsAt: null, endsAt: null, now }).state).toBe(
      "unknown"
    );
    expect(
      tariffTermView({
        startsAt: "2026-10-20T00:00:00.000Z",
        endsAt: "2026-10-01T00:00:00.000Z",
        now,
      }).state
    ).toBe("unknown");
  });

  it("counts remaining calendar days and never goes below zero", () => {
    const soon = tariffTermView({
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-22T00:00:00.000Z",
      now,
    });
    expect(soon.state).toBe("active");
    if (soon.state === "active") {
      expect(soon.daysLeft).toBe(2);
      expect(soon.endsToday).toBe(false);
      expect(soon.tone).toBe("soon");
      expect(soon.progress).toBeGreaterThan(0);
      expect(soon.progress).toBeLessThan(1);
      expect(tariffDaysLeftLabel(soon.daysLeft, soon.endsToday)).toBe("2 дня");
    }
    const today = tariffTermView({
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-20T18:00:00.000Z",
      now,
    });
    expect(today.state).toBe("active");
    if (today.state === "active") {
      expect(today.endsToday).toBe(true);
      expect(today.daysLeft).toBe(0);
      expect(tariffDaysLeftLabel(today.daysLeft, today.endsToday)).toBe(
        "Сегодня"
      );
    }
    const ended = tariffTermView({
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-10-19T12:00:00.000Z",
      now,
    });
    expect(ended).toEqual({ state: "ended", progress: 1, tone: "ended" });
  });
});
