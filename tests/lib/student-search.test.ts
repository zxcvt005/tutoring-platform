import { describe, expect, it } from "vitest";

import { filterStudentsByQuery } from "@/components/schedule/student-search-select";
import type { Student } from "@/lib/types";

const students: Student[] = [
  {
    id: "s1",
    fullName: "Иван Петров",
    status: "active",
    teacherId: "t1",
  },
  {
    id: "s2",
    fullName: "Мария Сидорова",
    status: "active",
    teacherId: "t1",
  },
  {
    id: "s3",
    fullName: "Игорь Иванов",
    status: "paused",
    teacherId: "t1",
  },
];

describe("student search select", () => {
  it("returns nothing until two characters are typed", () => {
    expect(filterStudentsByQuery(students, "")).toEqual([]);
    expect(filterStudentsByQuery(students, "И")).toEqual([]);
  });

  it("filters by first and last name after two characters", () => {
    expect(filterStudentsByQuery(students, "Ив").map((s) => s.id)).toEqual([
      "s1",
    ]);
    expect(filterStudentsByQuery(students, "сидор").map((s) => s.id)).toEqual([
      "s2",
    ]);
  });

  it("ignores inactive students and reports empty matches", () => {
    expect(filterStudentsByQuery(students, "Игор")).toEqual([]);
    expect(filterStudentsByQuery(students, "xyz")).toEqual([]);
  });
});
