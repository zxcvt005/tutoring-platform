import { describe, expect, it } from "vitest";

import {
  STUDENT_TOUR_BASE_PATH,
  STUDENT_TOUR_STORAGE_KEY,
  STUDENT_TOUR_STORAGE_VERSION,
  STUDENT_TOUR_STUDENT_ID,
  STUDENT_TOUR_TEACHER_ID,
} from "@/lib/student-tour/constants";
import {
  filterTourProblems,
  TOUR_PROBLEM_SECTIONS,
  TOUR_PROBLEMS,
} from "@/lib/student-tour/problems";
import {
  createStudentTourExtras,
  createStudentTourSeed,
} from "@/lib/student-tour/seed";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";

describe("student tour seed", () => {
  it("builds a rich Artyom / physics cabinet snapshot", () => {
    const data = createStudentTourSeed();
    const extras = createStudentTourExtras();

    expect(data.currentStudentId).toBe(STUDENT_TOUR_STUDENT_ID);
    expect(data.currentTeacherId).toBe(STUDENT_TOUR_TEACHER_ID);
    expect(data.students).toHaveLength(1);
    expect(data.students[0]?.fullName).toBe("Артём");
    expect(data.teachers[0]?.subjects).toContain("Физика");

    expect(data.lessons.length).toBeGreaterThanOrEqual(15);
    expect(data.homeworkAssignments.length).toBeGreaterThanOrEqual(10);
    expect(data.homeworkAssignments.some((a) => a.status === "assigned")).toBe(
      true
    );
    expect(data.homeworkAssignments.some((a) => a.status === "in_progress")).toBe(
      true
    );
    expect(data.homeworkAssignments.some((a) => a.status === "completed")).toBe(
      true
    );
    expect(data.homeworkAssignments.some((a) => a.status === "reviewed")).toBe(
      true
    );

    expect(data.theoryAssignments.length).toBeGreaterThanOrEqual(12);
    expect(data.intensiveAssignments.length).toBeGreaterThanOrEqual(5);
    expect(data.mockExamResults.length).toBeGreaterThanOrEqual(4);
    expect(data.availableProductSlugs).toContain(FORMULA_TRAINER_PRODUCT_SLUG);

    expect(extras.calls.length).toBeGreaterThanOrEqual(15);
    expect(extras.notifications.length).toBeGreaterThan(0);
    expect(extras.trainerHistory.length).toBeGreaterThan(0);

    for (const hw of data.homeworks) {
      expect(hw.questions).toEqual([]);
    }
    for (const a of data.homeworkAssignments) {
      expect(a.revealKeys).toBe(false);
      expect(a.testSnapshot?.questions ?? []).toEqual([]);
    }
  });

  it("keeps tour storage and routes isolated from real cabinets", () => {
    expect(STUDENT_TOUR_BASE_PATH).toBe("/demo/student");
    expect(STUDENT_TOUR_STORAGE_KEY).toBe("neodin.student-tour.v2");
    expect(STUDENT_TOUR_STORAGE_VERSION).toBe(2);
    expect(STUDENT_TOUR_BASE_PATH.startsWith("/auditoria")).toBe(false);
  });
});

describe("student tour problem bank", () => {
  it("covers required physics sections with verified answers", () => {
    expect(TOUR_PROBLEM_SECTIONS.length).toBeGreaterThanOrEqual(12);
    expect(TOUR_PROBLEMS.length).toBeGreaterThanOrEqual(20);

    for (const problem of TOUR_PROBLEMS) {
      expect(problem.options.some((o) => o.id === problem.correctOptionId)).toBe(
        true
      );
      expect(problem.explanation.length).toBeGreaterThan(5);
    }

    const kinematics = filterTourProblems({
      sectionId: "kinematics",
      topicId: "all",
      difficulty: "any",
      limit: 10,
    });
    expect(kinematics.length).toBeGreaterThan(0);
  });
});
