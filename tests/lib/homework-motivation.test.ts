import { describe, expect, it } from "vitest";

import {
  homeworkMotivation,
  homeworkMotivationLevel,
} from "@/lib/homework-motivation";
import { homeworkBoardForStudent } from "@/lib/homework-list";
import type { HomeworkAssignment } from "@/lib/types";

describe("homework motivation levels", () => {
  it("stays neutral when there is no reliable average", () => {
    expect(homeworkMotivationLevel(null)).toBeNull();
    expect(homeworkMotivationLevel(undefined)).toBeNull();
    expect(homeworkMotivationLevel(Number.NaN)).toBeNull();
    expect(homeworkMotivation(null).title).toBe("Твой прогресс начинается здесь");
    expect(homeworkMotivation(null).level).toBeNull();
  });

  it("maps the average of completed work onto five ranges", () => {
    expect(homeworkMotivationLevel(0)).toBe(1);
    expect(homeworkMotivationLevel(49)).toBe(1);
    expect(homeworkMotivationLevel(49.9)).toBe(1);
    expect(homeworkMotivationLevel(50)).toBe(2);
    expect(homeworkMotivationLevel(69.9)).toBe(2);
    expect(homeworkMotivationLevel(70)).toBe(3);
    expect(homeworkMotivationLevel(79.9)).toBe(3);
    expect(homeworkMotivationLevel(80)).toBe(4);
    expect(homeworkMotivationLevel(89.9)).toBe(4);
    expect(homeworkMotivationLevel(90)).toBe(5);
    expect(homeworkMotivationLevel(100)).toBe(5);
  });

  it("uses supportive copy and does not scold a low score", () => {
    const low = homeworkMotivation(20);
    expect(low.badge).toBe("Начало пути");
    expect(low.title).toBe("Каждый шаг имеет значение");
    expect(low.text.toLowerCase()).not.toMatch(/плох|отста|стара/);
    expect(homeworkMotivation(96).title).toBe("Отличный результат!");
  });
});

describe("homework board sections", () => {
  function hw(
    id: string,
    status: HomeworkAssignment["status"],
    extra: Partial<HomeworkAssignment> = {}
  ): HomeworkAssignment {
    return {
      id,
      homeworkId: "h1",
      teacherId: "t1",
      studentId: "s1",
      status,
      ...extra,
    };
  }

  it("keeps in-progress work inside assigned and reviewed work inside completed", () => {
    const board = homeworkBoardForStudent([
      hw("late", "in_progress", { missedNextLesson: true }),
      hw("fresh", "assigned"),
      hw("draft", "attempt2_in_progress"),
      hw("done", "reviewed"),
      hw("pending", "completed"),
    ]);
    expect(board.overdue.map((a) => a.id)).toEqual(["late"]);
    expect(board.assigned.map((a) => a.id)).toEqual(["fresh", "draft", "pending"]);
    expect(board.completed.map((a) => a.id)).toEqual(["done"]);
  });
});
