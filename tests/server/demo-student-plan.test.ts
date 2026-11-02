import { describe, expect, it } from "vitest";

import { fromAppDateTime } from "@/lib/app-time";
import {
  HOMEWORK_BLUEPRINT,
  collectStudySlots,
  pastLessonKinds,
  splitTariffDebits,
} from "@/server/db/demo-student-plan";

describe("demo student plan", () => {
  it("берёт последние 26 понедельников и четвергов до воскресенья 1 ноября 2026", () => {
    const now = fromAppDateTime("2026-11-01", "15:00");
    const slots = collectStudySlots(now, "19:30");
    expect(slots.past).toHaveLength(26);
    expect(slots.past[slots.past.length - 1]).toBe("2026-10-29");
    expect(slots.future[0]! > "2026-11-01").toBe(true);
    expect(slots.future.length).toBeGreaterThan(4);
  });

  it("раскладывает посещаемость и остаток тарифа без отменённых списаний", () => {
    const kinds = pastLessonKinds(26);
    expect(kinds.filter((kind) => kind === "present")).toHaveLength(21);
    expect(kinds.filter((kind) => kind === "excused")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "unexcused")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "cancelled")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "unmarked")).toHaveLength(1);
    expect(kinds[25]).toBe("present");
    const debitable = kinds.filter(
      (kind) => kind === "present" || kind === "unexcused"
    ).length;
    expect(splitTariffDebits(debitable)).toEqual({
      previousUsed: 12,
      previousLimit: 12,
      currentUsed: 10,
      currentLimit: 18,
      remaining: 8,
    });
  });

  it("покрывает состояния домашних заданий", () => {
    expect(HOMEWORK_BLUEPRINT).toHaveLength(22);
    const statuses = new Set(HOMEWORK_BLUEPRINT.map((item) => item.status));
    for (const status of [
      "assigned",
      "in_progress",
      "remaining_questions",
      "attempt1_submitted",
      "attempt2_in_progress",
      "completed",
      "reviewed",
    ]) {
      expect(statuses.has(status as never)).toBe(true);
    }
    expect(HOMEWORK_BLUEPRINT.some((item) => item.overdue)).toBe(true);
    expect(
      HOMEWORK_BLUEPRINT.filter((item) => item.pastIndex === 25 && !item.overdue)
        .length
    ).toBeGreaterThan(3);
  });
});
