import { describe, expect, it } from "vitest";

import { materialsLearningLock, studentLearningLock } from "@/lib/learning-lock";
import type { LessonOrder, StudentDirectionBalanceRow } from "@/lib/types";

describe("materialsLearningLock", () => {
  it("keeps materials open through remaining -2", () => {
    for (const remaining of [2, 1, 0, -1, -2]) {
      expect(materialsLearningLock({ remaining }).locked).toBe(false);
    }
  });

  it("locks materials at remaining -3 and below", () => {
    expect(materialsLearningLock({ remaining: -3 }).locked).toBe(true);
    expect(materialsLearningLock({ remaining: -4 }).locked).toBe(true);
    expect(materialsLearningLock({ remaining: -3 }).message).toMatch(
      /Пополните баланс/
    );
  });

  it("locks when there is no entitlement", () => {
    expect(
      materialsLearningLock({ remaining: 5, hasEntitlement: false }).locked
    ).toBe(true);
  });
});

describe("studentLearningLock", () => {
  const order = (overrides: Partial<LessonOrder> = {}): LessonOrder =>
    ({
      id: "o1",
      organizationId: "org",
      studentId: "s1",
      directionId: "d1",
      status: "paid",
      accessRevoked: false,
      featuresSnapshot: ["homework"],
      productIdsSnapshot: [],
      ...overrides,
    }) as LessonOrder;

  const balance = (
    remaining: number
  ): StudentDirectionBalanceRow =>
    ({
      studentId: "s1",
      directionId: "d1",
      remaining,
    }) as StudentDirectionBalanceRow;

  it("unlocks at -2 and locks at -3 for the same paid homework order", () => {
    const open = studentLearningLock(
      {
        lessonOrders: [order()],
        studentDirectionBalances: [balance(-2)],
      },
      "s1",
      "homework"
    );
    expect(open.locked).toBe(false);

    const locked = studentLearningLock(
      {
        lessonOrders: [order()],
        studentDirectionBalances: [balance(-3)],
      },
      "s1",
      "homework"
    );
    expect(locked.locked).toBe(true);
  });

  it("restores access when balance returns to -2", () => {
    const restored = studentLearningLock(
      {
        lessonOrders: [order()],
        studentDirectionBalances: [balance(-2)],
      },
      "s1"
    );
    expect(restored.locked).toBe(false);
  });
});
