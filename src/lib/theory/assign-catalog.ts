import {
  describeClassFilterEmpty,
  filterMaterialsForStudentClass,
  type LessonSubjectContext,
} from "@/lib/folders/material-class-filter";
import type {
  LearningDirection,
  Student,
  StudentDirectionBalanceRow,
  TheoryMaterial,
} from "@/lib/types";
import type { MaterialFolder } from "@/lib/folders/material-folders";

export type TheoryDirectionOption = {
  id: string;
  name: string;
};

/** Направления ученика для фильтра теории (как у тем/ДЗ). */
export function theoryDirectionOptionsForStudent(
  student: Pick<Student, "id" | "directionBalances">,
  balances: readonly StudentDirectionBalanceRow[],
  directions: readonly Pick<LearningDirection, "id" | "name" | "slug">[]
): TheoryDirectionOption[] {
  const fromCard = student.directionBalances ?? [];
  if (fromCard.length > 0) {
    return fromCard.map((b) => ({
      id: b.directionId,
      name:
        b.directionName?.trim() ||
        directions.find((d) => d.id === b.directionId)?.name ||
        "Направление",
    }));
  }
  return balances
    .filter((b) => b.studentId === student.id)
    .map((b) => {
      const d = directions.find((x) => x.id === b.directionId);
      return {
        id: b.directionId,
        name: d?.name?.trim() || "Направление",
      };
    });
}

export function filterTheoryCatalogForStudent(
  materials: readonly TheoryMaterial[],
  folders: readonly MaterialFolder[],
  opts: LessonSubjectContext & {
    studentGrade?: Student["grade"];
  }
): TheoryMaterial[] {
  return filterMaterialsForStudentClass(materials, folders, opts);
}

export function theoryCatalogEmptyHint(
  opts: LessonSubjectContext & {
    student: Pick<Student, "grade"> | null;
  }
): string {
  return describeClassFilterEmpty({
    ...opts,
    students: opts.student ? [opts.student] : [],
    studentGrade: opts.student?.grade,
  });
}
