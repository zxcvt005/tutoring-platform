import type { MaterialFolder } from "@/lib/folders/material-folders";
import {
  asSystemGrade,
  matchSystemSubjectFromDirection,
  resolveFolderClassPath,
  type SystemSubjectKey,
} from "@/lib/folders/system-kb-structure";
import type {
  LearningDirection,
  Student,
  StudentDirectionBalance,
  StudentDirectionBalanceRow,
  TheoryAssignment,
  TheoryMaterial,
} from "@/lib/types";

export type StudentTheoryCatalogMaterial = Pick<
  TheoryMaterial,
  | "id"
  | "libraryScope"
  | "folderId"
  | "status"
  | "title"
  | "description"
  | "videoUrl"
  | "videoProvider"
  | "videoEmbedUrl"
  | "embedAllowed"
  | "videoWarning"
  | "hasTest"
  | "hasVideo"
  | "fileCount"
  | "currentVersionId"
  | "files"
  | "createdAt"
  | "updatedAt"
>;

/** Предметы ученика из балансов / направлений (физика, математика). */
export function studentSystemSubjects(input: {
  directionBalances?: readonly Pick<
    StudentDirectionBalance,
    "directionSlug" | "directionName" | "directionId"
  >[];
  balanceRows?: readonly StudentDirectionBalanceRow[];
  directions?: readonly Pick<LearningDirection, "id" | "slug" | "name">[];
}): SystemSubjectKey[] {
  const keys = new Set<SystemSubjectKey>();
  const directions = input.directions ?? [];

  for (const balance of input.directionBalances ?? []) {
    const direction = directions.find((d) => d.id === balance.directionId);
    const subject = matchSystemSubjectFromDirection({
      directionSlug: balance.directionSlug ?? direction?.slug,
      directionName: balance.directionName ?? direction?.name,
    });
    if (subject) keys.add(subject);
  }

  for (const row of input.balanceRows ?? []) {
    const direction = directions.find((d) => d.id === row.directionId);
    const subject = matchSystemSubjectFromDirection({
      directionSlug: direction?.slug,
      directionName: direction?.name,
    });
    if (subject) keys.add(subject);
  }

  return [...keys];
}

/**
 * Опубликованная теория школьной БЗ в папке класса ученика по его предметам.
 * Личная библиотека преподавателя сюда не входит.
 */
export function isPublishedSchoolTheoryForStudent(
  material: Pick<
    TheoryMaterial,
    "libraryScope" | "status" | "folderId"
  >,
  folders: readonly MaterialFolder[],
  opts: {
    studentGrade?: Student["grade"] | string | null;
    subjects: readonly SystemSubjectKey[];
  }
): boolean {
  if (material.libraryScope !== "school") return false;
  if (material.status !== "published") return false;
  const grade = asSystemGrade(opts.studentGrade);
  if (!grade || opts.subjects.length === 0) return false;
  const path = resolveFolderClassPath(folders, material.folderId);
  if (!path) return false;
  return path.grade === grade && opts.subjects.includes(path.subject);
}

export function filterPublishedSchoolTheoryForStudent<
  T extends Pick<TheoryMaterial, "libraryScope" | "status" | "folderId" | "id">,
>(
  materials: readonly T[],
  folders: readonly MaterialFolder[],
  opts: {
    studentGrade?: Student["grade"] | string | null;
    subjects: readonly SystemSubjectKey[];
  }
): T[] {
  return materials.filter((material) =>
    isPublishedSchoolTheoryForStudent(material, folders, opts)
  );
}

export function studentTheoryCatalogEmptyHint(input: {
  studentGrade?: Student["grade"] | string | null;
  subjects: readonly SystemSubjectKey[];
}): string {
  const grade = asSystemGrade(input.studentGrade);
  if (!grade) {
    return "Укажите класс в профиле — тогда здесь появится теория вашего класса.";
  }
  if (input.subjects.length === 0) {
    return "Пока нет направления обучения — теория появится после оформления занятий.";
  }
  const titles = input.subjects.map((s) =>
    s === "physics" ? "Физика" : "Математика"
  );
  return `В школьной базе пока нет опубликованной теории для ${titles.join(" и ")} · ${grade} класс.`;
}

/**
 * Каталог ученика: школьные материалы класса + материалы с уже сохранённым прогрессом
 * (старые назначения / история). Ссылка всегда по materialId.
 */
export function buildStudentTheoryCatalogItems(input: {
  theories: readonly StudentTheoryCatalogMaterial[];
  assignments: readonly TheoryAssignment[];
  studentId: string;
  folders: readonly MaterialFolder[];
  studentGrade?: Student["grade"] | string | null;
  subjects: readonly SystemSubjectKey[];
}): TheoryAssignment[] {
  const mine = input.assignments.filter((a) => a.studentId === input.studentId);
  const progressByMaterial = new Map(mine.map((a) => [a.materialId, a]));
  const catalogIds = new Set(
    filterPublishedSchoolTheoryForStudent(input.theories, input.folders, {
      studentGrade: input.studentGrade,
      subjects: input.subjects,
    }).map((m) => m.id)
  );

  const theoryById = new Map(input.theories.map((t) => [t.id, t]));
  const result: TheoryAssignment[] = [];
  const seen = new Set<string>();

  for (const materialId of catalogIds) {
    const progress = progressByMaterial.get(materialId);
    if (progress) {
      result.push(progress);
      seen.add(materialId);
      continue;
    }
    const theory = theoryById.get(materialId);
    if (!theory) continue;
    result.push(catalogMaterialAsAssignment(theory, input.studentId));
    seen.add(materialId);
  }

  // История: старые назначения (в т.ч. личная библиотека) остаются доступны.
  for (const progress of mine) {
    if (seen.has(progress.materialId)) continue;
    result.push(progress);
    seen.add(progress.materialId);
  }

  return result.sort(
    (a, b) =>
      new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
  );
}

function catalogMaterialAsAssignment(
  theory: StudentTheoryCatalogMaterial,
  studentId: string
): TheoryAssignment {
  return {
    id: theory.id,
    materialId: theory.id,
    versionId: theory.currentVersionId ?? theory.id,
    teacherId: "",
    studentId,
    status: "assigned",
    assignedAt: theory.updatedAt || theory.createdAt,
    viewedAt: null,
    completedAt: null,
    testAssignmentId: null,
    title: theory.title,
    description: theory.description ?? null,
    videoUrl: theory.videoUrl ?? null,
    videoProvider: theory.videoProvider ?? null,
    videoEmbedUrl: theory.videoEmbedUrl ?? null,
    embedAllowed: theory.embedAllowed,
    videoWarning: theory.videoWarning ?? null,
    hasTest: theory.hasTest,
    files: theory.files ?? [],
    testPercent: null,
    testStatus: null,
  };
}

/** Резолв карточки: сначала materialId, затем legacy assignmentId. */
export function resolveStudentTheoryItem(
  items: readonly TheoryAssignment[],
  id: string
): TheoryAssignment | undefined {
  return (
    items.find((item) => item.materialId === id) ??
    items.find((item) => item.id === id)
  );
}
