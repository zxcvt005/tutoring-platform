import { describe, expect, it } from "vitest";

import {
  isCatalogHomeworkPurpose,
  isHomeworkSource,
} from "@/lib/homework/source-kind";
import {
  intensiveDeadlineSummary,
  intensiveDeadlinesReady,
  intensiveProgress,
  intensiveStudentLabel,
  intensiveTestRunStatus,
  moveIntensiveTest,
} from "@/lib/intensives/progress";

describe("интенсивы", () => {
  it("считает прогресс и ближайший или просроченный дедлайн", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    expect(
      intensiveProgress([
        { status: "reviewed" },
        { status: "assigned" },
        { status: "completed" },
      ])
    ).toEqual({ done: 2, total: 3 });
    expect(
      intensiveDeadlineSummary(
        [
          { status: "assigned", dueAt: "2026-06-03T12:00:00.000Z" },
          { status: "reviewed", dueAt: "2026-05-01T12:00:00.000Z" },
        ],
        now
      )
    ).toEqual({ kind: "upcoming", dueAt: "2026-06-03T12:00:00.000Z" });
    expect(
      intensiveDeadlineSummary(
        [{ status: "assigned", dueAt: "2026-05-01T12:00:00.000Z" }],
        now
      ).kind
    ).toBe("overdue");
    expect(
      intensiveDeadlineSummary(
        [{ status: "reviewed", dueAt: "2026-05-01T12:00:00.000Z" }],
        now
      ).kind
    ).toBe("done");
  });

  it("держит кнопку отправки, пока не заполнен каждый дедлайн, и двигает порядок", () => {
    expect(intensiveDeadlinesReady(["a", "b"], { a: "2026-06-01T10:00" })).toBe(
      false
    );
    expect(
      intensiveDeadlinesReady(["a", "b"], { a: "2026-06-01T10:00", b: "2026-06-02T10:00" })
    ).toBe(true);
    expect(intensiveDeadlinesReady([], {})).toBe(true);
    expect(moveIntensiveTest(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveIntensiveTest(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("не считает тест интенсива домашним заданием", () => {
    expect(isHomeworkSource("homework")).toBe(true);
    expect(isHomeworkSource(undefined)).toBe(true);
    expect(isHomeworkSource("theory")).toBe(false);
    expect(isHomeworkSource("intensive")).toBe(false);
    expect(isCatalogHomeworkPurpose("homework")).toBe(true);
    expect(isCatalogHomeworkPurpose("intensive")).toBe(false);
    expect(isCatalogHomeworkPurpose("theory")).toBe(false);
  });

  it("показывает преподавателю ход ученика и статус каждого теста", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    expect(
      intensiveStudentLabel([{ status: "reviewed" }, { status: "assigned" }])
    ).toEqual({ label: "В процессе", done: 1, total: 2 });
    expect(intensiveStudentLabel([{ status: "completed" }, { status: "reviewed" }])).toEqual({
      label: "Готово",
      done: 2,
      total: 2,
    });
    expect(
      intensiveTestRunStatus(
        { status: "assigned", dueAt: "2026-06-03T12:00:00.000Z" },
        now
      )
    ).toBe("not_started");
    expect(
      intensiveTestRunStatus(
        { status: "in_progress", dueAt: "2026-06-03T12:00:00.000Z" },
        now
      )
    ).toBe("in_progress");
    expect(
      intensiveTestRunStatus(
        { status: "in_progress", dueAt: "2026-05-01T12:00:00.000Z" },
        now
      )
    ).toBe("overdue");
    expect(
      intensiveTestRunStatus(
        { status: "reviewed", dueAt: "2026-05-01T12:00:00.000Z" },
        now
      )
    ).toBe("done");
  });
});
