import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  asSystemGrade,
  matchSystemSubject,
  matchSystemSubjectFromDirection,
  materialMatchesStudentClass,
  type SystemSubjectKey,
} from "@/lib/folders/system-kb-structure";
import type { LearningDirection, Student, StudentGrade } from "@/lib/types";

export type ClassScopedMaterial = {
  id: string;
  folderId?: string | null;
  subject?: string | null;
};

export type LessonSubjectContext = {
  lessonSubject?: string | null;
  directionId?: string | null;
  directions?: readonly Pick<LearningDirection, "id" | "slug" | "name">[];
};

export function resolveLessonSystemSubject(
  ctx: LessonSubjectContext
): SystemSubjectKey | null {
  const direction = ctx.directionId
    ? ctx.directions?.find((d) => d.id === ctx.directionId)
    : undefined;
  return matchSystemSubjectFromDirection({
    directionSlug: direction?.slug,
    directionName: direction?.name,
    lessonSubject: ctx.lessonSubject,
  });
}

function participantGrades(
  students: readonly Pick<Student, "grade">[]
): string[] {
  return [
    ...new Set(
      students
        .map((s) => asSystemGrade(s.grade))
        .filter((g): g is NonNullable<typeof g> => Boolean(g))
    ),
  ];
}

export function hasMixedParticipantGrades(
  students: readonly Pick<Student, "grade">[]
): boolean {
  return participantGrades(students).length > 1;
}

/**
 * Материалы, подходящие предмету занятия и классу ученика
 * (только внутри системного пути Предмет → N класс).
 */
export function filterMaterialsForStudentClass<T extends ClassScopedMaterial>(
  materials: readonly T[],
  folders: readonly MaterialFolder[],
  opts: LessonSubjectContext & {
    studentGrade?: StudentGrade | string | null;
    /** Явный subject key, если уже вычислен. */
    subjectKey?: SystemSubjectKey | null;
  }
): T[] {
  const subject = opts.subjectKey ?? resolveLessonSystemSubject(opts);
  const grade = asSystemGrade(opts.studentGrade);
  if (!subject || !grade) return [];
  return materials.filter((m) => {
    if (
      m.subject &&
      matchSystemSubject(m.subject) &&
      matchSystemSubject(m.subject) !== subject
    ) {
      return false;
    }
    return materialMatchesStudentClass(folders, m.folderId, subject, grade);
  });
}

/**
 * @deprecated Занятия строго 1:1 — используйте filterMaterialsForStudentClass.
 * Оставлен как тонкая обёртка: при >1 классе возвращает [].
 */
export function filterMaterialsForStudents<T extends ClassScopedMaterial>(
  materials: readonly T[],
  folders: readonly MaterialFolder[],
  opts: LessonSubjectContext & {
    students: readonly Pick<Student, "id" | "grade">[];
  }
): T[] {
  const subject = resolveLessonSystemSubject(opts);
  if (!subject || opts.students.length === 0) return [];
  const grades = participantGrades(opts.students);
  if (grades.length === 0) return [];
  if (grades.length > 1) return [];
  return filterMaterialsForStudentClass(materials, folders, {
    ...opts,
    subjectKey: subject,
    studentGrade: grades[0],
  });
}

export function describeClassFilterEmpty(
  opts: LessonSubjectContext & {
    students: readonly Pick<Student, "grade">[];
    studentGrade?: StudentGrade | string | null;
  }
): string {
  const subject = resolveLessonSystemSubject(opts);
  const grade =
    asSystemGrade(opts.studentGrade) ??
    participantGrades(opts.students)[0] ??
    null;
  if (!subject) {
    return "Укажите направление занятия (Физика или Математика), чтобы увидеть материалы.";
  }
  if (!grade) {
    return "У ученика не указан класс — материалы класса недоступны.";
  }
  const title = subject === "physics" ? "Физика" : "Математика";
  return `В папке «${title} → ${grade} класс» пока нет подходящих материалов.`;
}

export type { SystemSubjectKey };
