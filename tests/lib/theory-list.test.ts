import { describe, expect, it } from "vitest";

import {
  groupStudentTheories,
  incompleteTheoryCount,
  newestIncompleteTheory,
  studentTheoryComponentSummary,
  studentTheoryMaterialChips,
  studentTheorySection,
  theoryNeedsStudyMark,
  theoryPackageCountLabel,
  theoryQuestionCountLabel,
} from "@/lib/theory/list";
import { gradeWorkLabel } from "@/lib/theory/work-kind";
import type { TheoryAssignment } from "@/lib/types";

function item(
  id: string,
  status: TheoryAssignment["status"],
  assignedAt: string
): TheoryAssignment {
  return {
    id,
    materialId: "m1",
    versionId: "v1",
    teacherId: "t1",
    studentId: "s1",
    status,
    assignedAt,
    title: id,
    videoUrl: "https://vk.com/video-1_1",
    embedAllowed: true,
    hasTest: false,
    files: [],
  };
}

describe("student theory list", () => {
  it("groups by actual status, not only send date", () => {
    const grouped = groupStudentTheories([
      item("old-open", "in_progress", "2026-01-01T00:00:00.000Z"),
      item("new", "assigned", "2026-10-01T00:00:00.000Z"),
      item("done", "completed", "2026-02-01T00:00:00.000Z"),
      item("review", "awaiting_review", "2026-03-01T00:00:00.000Z"),
    ]);
    expect(grouped.map((g) => g.key)).toEqual([
      "new",
      "in_progress",
      "awaiting_review",
      "completed",
    ]);
    expect(grouped.find((g) => g.key === "completed")?.title).toBe("Изучено");
    expect(incompleteTheoryCount(grouped.flatMap((g) => g.items))).toBe(3);
  });

  it("keeps unfinished theory visible regardless of date", () => {
    const latest = newestIncompleteTheory([
      item("done", "completed", "2026-10-20T00:00:00.000Z"),
      item("old", "viewed", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(latest?.id).toBe("old");
  });

  it("shows a new-theory mark until study is finished, including after opening", () => {
    expect(theoryNeedsStudyMark(item("a", "assigned", "2026-01-01T00:00:00.000Z"))).toBe(
      true
    );
    expect(theoryNeedsStudyMark(item("v", "viewed", "2026-01-01T00:00:00.000Z"))).toBe(
      true
    );
    expect(
      theoryNeedsStudyMark(item("p", "in_progress", "2026-01-01T00:00:00.000Z"))
    ).toBe(true);
    expect(
      theoryNeedsStudyMark(item("r", "awaiting_review", "2026-01-01T00:00:00.000Z"))
    ).toBe(false);
    expect(
      theoryNeedsStudyMark(item("c", "completed", "2026-01-01T00:00:00.000Z"))
    ).toBe(false);
  });

  it("keeps the mark after a reload because it follows persisted status", () => {
    const opened = item("open", "viewed", "2026-01-01T00:00:00.000Z");
    const reloaded = { ...opened };
    expect(theoryNeedsStudyMark(opened)).toBe(true);
    expect(theoryNeedsStudyMark(reloaded)).toBe(true);
    const finished = { ...opened, status: "completed" as const };
    expect(theoryNeedsStudyMark(finished)).toBe(false);
  });

  it("labels theory and homework differently in grades", () => {
    expect(gradeWorkLabel("theory", "Поле")).toBe("Теория — Поле");
    expect(gradeWorkLabel("homework", "Ньютон")).toBe("ДЗ — Ньютон");
  });

  it("shows only components that exist on a student assignment", () => {
    const base = item("x", "assigned", "2026-01-01T00:00:00.000Z");
    expect(
      studentTheoryComponentSummary({ ...base, files: [], hasTest: false })
    ).toEqual(["Видео"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        videoUrl: null,
        files: [{ id: "f1", originalName: "n.pdf", mimeType: "application/pdf", sizeBytes: 1 }],
        hasTest: false,
      })
    ).toEqual(["Конспект"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        videoUrl: null,
        files: [],
        hasTest: true,
      })
    ).toEqual(["Тест"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        files: [{ id: "f1", originalName: "n.pdf", mimeType: "application/pdf", sizeBytes: 1 }],
        hasTest: false,
      })
    ).toEqual(["Видео", "Конспект"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        files: [],
        hasTest: true,
        testPercent: 80,
      })
    ).toEqual(["Видео", "Тест", "результат 80%"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        videoUrl: null,
        files: [
          { id: "f1", originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1 },
          { id: "f2", originalName: "b.pdf", mimeType: "application/pdf", sizeBytes: 1 },
        ],
        hasTest: true,
      })
    ).toEqual(["Конспектов: 2", "Тест"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        files: [{ id: "f1", originalName: "n.pdf", mimeType: "application/pdf", sizeBytes: 1 }],
        hasTest: true,
      })
    ).toEqual(["Видео", "Конспект", "Тест"]);
    expect(
      studentTheoryComponentSummary({
        ...base,
        videoUrl: null,
        files: [],
        hasTest: false,
      })
    ).toEqual([]);
  });

  it("builds material chips only for parts that exist", () => {
    const pdf = {
      id: "f1",
      originalName: "field.pdf",
      mimeType: "application/pdf",
    };
    expect(
      studentTheoryMaterialChips({
        videoUrl: "https://vk.com/video",
        hasTest: true,
        files: [pdf],
        questionCount: 5,
      }).map((chip) => [chip.title, chip.detail])
    ).toEqual([
      ["Видео", null],
      ["Мини-тест", "5 вопросов"],
      ["PDF-конспект", null],
    ]);
    expect(
      studentTheoryMaterialChips({
        videoUrl: "https://vk.com/video",
        hasTest: false,
        files: [],
      }).map((chip) => chip.title)
    ).toEqual(["Видео"]);
    expect(
      studentTheoryMaterialChips({
        videoUrl: "  ",
        hasTest: false,
        files: [pdf],
        questionCount: 0,
      }).map((chip) => chip.title)
    ).toEqual(["PDF-конспект"]);
    expect(theoryQuestionCountLabel(0)).toBeNull();
    expect(theoryQuestionCountLabel(1)).toBe("1 вопрос");
  });

  it("lists every file when a package has several of the same kind", () => {
    const chips = studentTheoryMaterialChips({
      videoUrl: null,
      hasTest: false,
      files: [
        { id: "a", originalName: "a.pdf", mimeType: "application/pdf" },
        { id: "b", originalName: "b.pdf", mimeType: "application/pdf" },
      ],
    });
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.detail)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("counts packages and treats only unopened assignments as new", () => {
    expect(theoryPackageCountLabel(1)).toBe("1 пакет");
    expect(theoryPackageCountLabel(3)).toBe("3 пакета");
    expect(theoryPackageCountLabel(5)).toBe("5 пакетов");
    expect(theoryPackageCountLabel(11)).toBe("11 пакетов");
    expect(studentTheorySection("assigned")).toBe("new");
    expect(studentTheorySection("viewed")).toBe("in_progress");
  });
});
