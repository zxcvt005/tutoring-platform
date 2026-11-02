import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { nextPart1AnswerIndex } from "@/lib/mock-exams/answer-navigation";
import { parseEgeDraft, serializeEgeDraft } from "@/lib/mock-exams/draft";
import { EGE_PHYSICS_SCALE } from "@/lib/mock-exams/scale";
import {
  compareMockExams,
  MOCK_EXAM_EMPTY_TEXT,
  MOCK_EXAM_EMPTY_TITLE,
  parseExamDate,
  parseTestScore,
  studentMockExamSeries,
} from "@/lib/mock-exams/records";

describe("пробники", () => {
  it("принимает вторичный балл только как целое от 0 до 100", () => {
    expect(parseTestScore(0)).toEqual({ ok: true, value: 0 });
    expect(parseTestScore(100)).toEqual({ ok: true, value: 100 });
    expect(parseTestScore(" 82 ")).toEqual({ ok: true, value: 82 });
    for (const value of [-1, 101, 1.5, "12.0", "abc", "07", "", null, false]) {
      expect(parseTestScore(value).ok).toBe(false);
    }
  });

  it("переводит Enter к следующему ответу и останавливается на последнем", () => {
    expect(nextPart1AnswerIndex(0)).toBe(1);
    expect(nextPart1AnswerIndex(18)).toBe(19);
    expect(nextPart1AnswerIndex(19)).toBeNull();
    expect(nextPart1AnswerIndex(20)).toBeNull();
    expect(nextPart1AnswerIndex(-1)).toBeNull();
  });

  it("миграция переводит старые первичные баллы той же шкалой", () => {
    const sql = readFileSync(
      "drizzle/0028_mock_exam_test_scores.sql",
      "utf8"
    );
    EGE_PHYSICS_SCALE.forEach((testScore, primary) => {
      expect(sql).toContain(`WHEN ${primary} THEN ${testScore}`);
    });
  });

  it("отклоняет несуществующую дату", () => {
    expect(parseExamDate("2026-11-02").ok).toBe(true);
    expect(parseExamDate("2026-02-31").ok).toBe(false);
    expect(parseExamDate("02.11.2026").ok).toBe(false);
  });

  it("сортирует пробники по дате", () => {
    const exams = [
      { id: "c", date: "2026-03-01", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", date: "2026-01-15", createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "b", date: "2026-01-15", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(exams.slice().sort(compareMockExams).map((exam) => exam.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("строит пустую серию и хронологический график только своих результатов", () => {
    expect(MOCK_EXAM_EMPTY_TITLE).toBe("Пока нет результатов пробников");
    expect(MOCK_EXAM_EMPTY_TEXT).toContain("преподаватель");

    const empty = studentMockExamSeries([], [], "s1");
    expect(empty.points).toEqual([]);
    expect(empty.latestTestScore).toBeNull();
    expect(empty.delta).toBeNull();

    const series = studentMockExamSeries(
      [
        { id: "late", title: "Март", date: "2026-03-01" },
        { id: "early", title: "Январь", date: "2026-01-10" },
        { id: "other", title: "Чужой", date: "2026-02-01" },
      ],
      [
        { mockExamId: "late", studentId: "s1", testScore: 82 },
        { mockExamId: "early", studentId: "s1", testScore: 73 },
        { mockExamId: "other", studentId: "s2", testScore: 100 },
      ],
      "s1"
    );
    expect(series.points.map((point) => point.examId)).toEqual(["early", "late"]);
    expect(series.points[0]).toMatchObject({ testScore: 73 });
    expect(series.points[1]?.testScore).toBe(82);
    expect(series.latestTestScore).toBe(82);
    expect(series.delta).toBe(9);
  });

  it("восстанавливает черновик проверки и отбрасывает мусор", () => {
    const raw = serializeEgeDraft({
      mode: "references",
      references: ["15"],
      answers: ["16"],
      part2: [3, 9, null, null, null, null],
    });
    const draft = parseEgeDraft(raw);
    expect(draft.mode).toBe("references");
    expect(draft.references[0]).toBe("15");
    expect(draft.references).toHaveLength(20);
    expect(draft.answers[0]).toBe("16");
    expect(draft.part2[0]).toBe(3);
    expect(draft.part2[1]).toBeNull();
    expect(parseEgeDraft("{")).toMatchObject({ mode: "check" });
    expect(parseEgeDraft(null).references.every((item) => item === "")).toBe(true);
  });
});
