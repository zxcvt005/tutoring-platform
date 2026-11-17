import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  asSystemGrade,
  matchSystemSubject,
  matchSystemSubjectFromDirection,
  resolveFolderClassPath,
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
 * Материалы, подходящие предмету занятия и классу ученика.
 * Внутри системного пути «Предмет → N класс» — строгий фильтр.
 * Вне системного дерева (личная папка преподавателя и т.п.) — не скрываем
 * (как на сервере в completeLesson / assignHomework).
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
  return materials.filter((m) => {
    if (
      m.subject &&
      matchSystemSubject(m.subject) &&
      subject &&
      matchSystemSubject(m.subject) !== subject
    ) {
      return false;
    }
    const path = resolveFolderClassPath(folders, m.folderId);
    if (!path) return true;
    if (!subject || !grade) return false;
    return path.subject === subject && path.grade === grade;
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
