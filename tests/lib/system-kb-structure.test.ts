import { describe, expect, it } from "vitest";

import {
  filterMaterialsForStudentClass,
  filterMaterialsForStudents,
  hasMixedParticipantGrades,
  resolveLessonSystemSubject,
} from "@/lib/folders/material-class-filter";
import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  allSystemFolderSpecs,
  gradeSystemKey,
  matchSystemSubject,
  matchSystemSubjectFromDirection,
  materialMatchesStudentClass,
  subjectSystemKey,
} from "@/lib/folders/system-kb-structure";

const folders: MaterialFolder[] = [
  {
    id: "phys",
    ownerScope: "school",
    teacherId: null,
    parentId: null,
    title: "Физика",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: subjectSystemKey("physics"),
  },
  {
    id: "phys7",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "7 класс",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "7"),
  },
  {
    id: "phys7-user",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys7",
    title: "Механика",
    sortOrder: 0,
    contentKind: "topic",
  },
  {
    id: "phys10",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys",
    title: "10 класс",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: gradeSystemKey("physics", "10"),
  },
  {
    id: "phys10-user",
    ownerScope: "school",
    teacherId: null,
    parentId: "phys10",
    title: "Электричество",
    sortOrder: 0,
    contentKind: "topic",
  },
  {
    id: "math10",
    ownerScope: "school",
    teacherId: null,
    parentId: null,
    title: "10 класс",
    sortOrder: 0,
    contentKind: "shared",
    systemKey: gradeSystemKey("math", "10"),
  },
];

describe("system kb structure helpers", () => {
  it("defines 12 system folder specs", () => {
    expect(allSystemFolderSpecs()).toHaveLength(12);
  });

  it("matches subject names", () => {
    expect(matchSystemSubject("Физика")).toBe("physics");
    expect(matchSystemSubject("математика")).toBe("math");
    expect(matchSystemSubject("Химия")).toBeNull();
  });

  it("prefers direction slug over renamed direction name", () => {
    expect(
      matchSystemSubjectFromDirection({
        directionSlug: "physics",
        directionName: "Физика ЕГЭ (новое имя)",
        lessonSubject: "Что угодно",
      })
    ).toBe("physics");
    expect(
      resolveLessonSystemSubject({
        directionId: "d1",
        directions: [{ id: "d1", slug: "math", name: "Алгебра+" }],
        lessonSubject: "Физика",
      })
    ).toBe("math");
  });

  it("matches materials under grade path including nested user folders", () => {
    expect(
      materialMatchesStudentClass(folders, "phys7-user", "physics", "7")
    ).toBe(true);
    expect(
      materialMatchesStudentClass(folders, "phys7-user", "physics", "8")
    ).toBe(false);
    expect(materialMatchesStudentClass(folders, "math10", "math", "10")).toBe(
      true
    );
  });

  it("filters catalogs by student class", () => {
    const materials = [
      { id: "a", folderId: "phys7-user", subject: "Физика" },
      { id: "b", folderId: "math10", subject: "Математика" },
      { id: "c", folderId: null, subject: "Физика" },
    ];
    expect(
      filterMaterialsForStudentClass(materials, folders, {
        lessonSubject: "Физика",
        studentGrade: "7",
      }).map((m) => m.id)
    ).toEqual(["a"]);
  });

  it("does not merge catalogs for mixed grades (lessons are 1:1)", () => {
    const materials = [
      { id: "a", folderId: "phys7-user", subject: "Физика" },
      { id: "b", folderId: "phys10-user", subject: "Физика" },
    ];
    const students = [
      { id: "s1", grade: "7" as const },
      { id: "s2", grade: "10" as const },
    ];
    expect(hasMixedParticipantGrades(students)).toBe(true);
    expect(
      filterMaterialsForStudents(materials, folders, {
        directionId: "d1",
        directions: [{ id: "d1", slug: "physics", name: "Физика" }],
        students,
      })
    ).toEqual([]);
    expect(
      filterMaterialsForStudentClass(materials, folders, {
        directionId: "d1",
        directions: [{ id: "d1", slug: "physics", name: "Физика" }],
        studentGrade: "7",
      }).map((m) => m.id)
    ).toEqual(["a"]);
    expect(
      filterMaterialsForStudentClass(materials, folders, {
        directionId: "d1",
        directions: [{ id: "d1", slug: "physics", name: "Физика" }],
        studentGrade: "10",
      }).map((m) => m.id)
    ).toEqual(["b"]);
  });
});
