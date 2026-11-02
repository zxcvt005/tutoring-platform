import { describe, expect, it } from "vitest";

import {
  formatEgeSummary,
  PART1_MAX,
  PART1_TASKS,
  PART2_MAX,
  PART2_TASKS,
  PRIMARY_MAX,
  summarizeEge,
} from "@/lib/mock-exams/ege";
import { EGE_PHYSICS_SCALE, primaryToTestScore } from "@/lib/mock-exams/scale";

const SCALE = [
  0, 5, 9, 14, 18, 23, 27, 32, 36, 39, 41, 43, 44, 46, 48, 49, 51, 53, 54, 56,
  58, 59, 61, 62, 64, 65, 67, 68, 70, 71, 73, 74, 76, 77, 79, 80, 82, 84, 86,
  88, 90, 92, 94, 96, 98, 100,
];

function fullPaper(part2: number[]) {
  return summarizeEge({
    references: PART1_TASKS.map(() => "12"),
    answers: PART1_TASKS.map(() => "12"),
    part2,
  });
}

describe("итоговая сводка ЕГЭ", () => {
  it("держит максимумы 28, 17 и 45", () => {
    expect(PART1_MAX).toBe(28);
    expect(PART2_MAX).toBe(17);
    expect(PRIMARY_MAX).toBe(45);
    expect(PART1_TASKS).toHaveLength(20);
    expect(PART2_TASKS.map((task) => task.maxScore)).toEqual([3, 2, 2, 3, 3, 4]);
  });

  it("суммирует первую часть отдельно от второй", () => {
    const summary = summarizeEge({
      references: PART1_TASKS.map((task) => (task.maxScore === 1 ? "7" : "12")),
      answers: PART1_TASKS.map((task) => (task.number === 1 ? "8" : task.maxScore === 1 ? "7" : "12")),
      part2: [3, 2, 2, 1, 0, 0],
    });
    expect(summary.part1Score).toBe(27);
    expect(summary.part2Score).toBe(8);
    expect(summary.primaryScore).toBe(35);
    expect(summary.complete).toBe(true);
    expect(summary.testScore).toBe(80);
  });

  it("переводит полностью проверенную работу по таблице", () => {
    const perfect = fullPaper([3, 2, 2, 3, 3, 4]);
    expect(perfect.part1Score).toBe(28);
    expect(perfect.part2Score).toBe(17);
    expect(perfect.primaryScore).toBe(45);
    expect(perfect.testScore).toBe(100);

    const primary36 = fullPaper([3, 2, 2, 1, 0, 0]);
    expect(primary36.primaryScore).toBe(36);
    expect(primary36.testScore).toBe(82);

    const zero = summarizeEge({
      references: PART1_TASKS.map(() => "12"),
      answers: PART1_TASKS.map(() => "34"),
      part2: [0, 0, 0, 0, 0, 0],
    });
    expect(zero.primaryScore).toBe(0);
    expect(zero.complete).toBe(true);
    expect(zero.testScore).toBe(0);
  });

  it("переводит каждый первичный балл строго по таблице", () => {
    expect(EGE_PHYSICS_SCALE).toEqual(SCALE);
    for (let primary = 0; primary <= 45; primary += 1) {
      expect(primaryToTestScore(primary)).toBe(SCALE[primary]);
    }
    expect(primaryToTestScore(1.5)).toBeNull();
    expect(primaryToTestScore(-1)).toBeNull();
    expect(primaryToTestScore(46)).toBeNull();
  });

  it("не показывает непроверенное задание как ноль", () => {
    const summary = summarizeEge({
      references: ["7", ...PART1_TASKS.slice(1).map(() => "")],
      answers: ["7", ...PART1_TASKS.slice(1).map(() => "")],
      part2: [],
    });
    expect(summary.tasks[0]?.score).toBe(1);
    expect(summary.tasks[1]?.score).toBeNull();
    expect(summary.tasks[20]?.score).toBeNull();
    expect(summary.complete).toBe(false);
    expect(summary.testScore).toBeNull();
    expect(summary.part1Checked).toBe(1);
    expect(summary.part2Checked).toBe(0);

    const text = formatEgeSummary(summary);
    expect(text).toContain("Проверка не завершена");
    expect(text).toContain("1: 1");
    expect(text).toContain("2: —");
    expect(text).toContain("21: —");
    expect(text).toContain("Вторая часть: — / 17");
    expect(text).toContain("Вторичный балл: —");
    expect(text).not.toMatch(/(^|\| )2: 0( \||$)/);
    expect(text).not.toMatch(/(^|\| )21: 0( \||$)/);
  });

  it("отличает явный ноль от непроверенного задания во второй части", () => {
    const summary = summarizeEge({
      references: PART1_TASKS.map(() => ""),
      answers: PART1_TASKS.map(() => ""),
      part2: [0, null, null, null, null, null],
    });
    expect(summary.tasks[20]?.score).toBe(0);
    expect(summary.tasks[21]?.score).toBeNull();
    expect(summary.part2Score).toBe(0);
    expect(summary.part2Checked).toBe(1);
    const text = formatEgeSummary(summary);
    expect(text).toContain("21: 0");
    expect(text).toContain("22: —");
  });
});
