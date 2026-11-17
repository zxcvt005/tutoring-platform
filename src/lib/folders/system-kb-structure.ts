import type { MaterialFolder } from "@/lib/folders/material-folders";
import type { StudentGrade } from "@/lib/types";

export const SYSTEM_SUBJECTS = [
  { key: "physics", title: "Физика" },
  { key: "math", title: "Математика" },
] as const;

export type SystemSubjectKey = (typeof SYSTEM_SUBJECTS)[number]["key"];

export const SYSTEM_GRADES = ["7", "8", "9", "10", "11"] as const;

export type SystemGrade = (typeof SYSTEM_GRADES)[number];

export function subjectSystemKey(subject: SystemSubjectKey): string {
  return `subject:${subject}`;
}

export function gradeSystemKey(
  subject: SystemSubjectKey,
  grade: SystemGrade
): string {
  return `grade:${subject}:${grade}`;
}

export function isSystemFolderKey(systemKey: string | null | undefined): boolean {
  return Boolean(systemKey && systemKey.length > 0);
}

export function parseSubjectSystemKey(
  systemKey: string | null | undefined
): SystemSubjectKey | null {
  if (!systemKey?.startsWith("subject:")) return null;
  const key = systemKey.slice("subject:".length);
  if (key === "physics" || key === "math") return key;
  return null;
}

export function parseGradeSystemKey(
  systemKey: string | null | undefined
): { subject: SystemSubjectKey; grade: SystemGrade } | null {
  if (!systemKey?.startsWith("grade:")) return null;
  const rest = systemKey.slice("grade:".length);
  const [subject, grade] = rest.split(":");
  if (
    (subject === "physics" || subject === "math") &&
    (SYSTEM_GRADES as readonly string[]).includes(grade ?? "")
  ) {
    return { subject, grade: grade as SystemGrade };
  }
  return null;
}

/** Сопоставляет название предмета занятия / направления с системным ключом. */
export function matchSystemSubject(
  subject: string | null | undefined
): SystemSubjectKey | null {
  const raw = (subject ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (
    raw === "физика" ||
    raw === "physics" ||
    raw.includes("физик")
  ) {
    return "physics";
  }
  if (
    raw === "математика" ||
    raw === "math" ||
    raw === "математике" ||
    raw.includes("матем")
  ) {
    return "math";
  }
  return null;
}

/**
 * Предмет для фильтра БЗ: сначала slug направления (стабильный),
 * затем имя направления, затем текстовый subject занятия (legacy).
 */
export function matchSystemSubjectFromDirection(input: {
  directionSlug?: string | null;
  directionName?: string | null;
  lessonSubject?: string | null;
}): SystemSubjectKey | null {
  const slug = (input.directionSlug ?? "").trim().toLowerCase();
  if (slug === "physics" || slug === "fizika") return "physics";
  if (
    slug === "math" ||
    slug === "mathematics" ||
    slug === "matematics" ||
    slug === "matematica"
  ) {
    return "math";
  }
  return (
    matchSystemSubject(input.directionName) ??
    matchSystemSubject(input.lessonSubject)
  );
}

export function isReservedRootSubjectTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return SYSTEM_SUBJECTS.some((s) => s.title.toLowerCase() === t);
}

export function isReservedGradeTitle(title: string): boolean {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  return SYSTEM_GRADES.some(
    (g) => t === `${g} класс` || t === `${g}класс` || t === g
  );
}

export function gradeTitle(grade: SystemGrade | string): string {
  return `${grade} класс`;
}

export function allSystemFolderSpecs(): Array<{
  systemKey: string;
  title: string;
  parentSystemKey: string | null;
  sortOrder: number;
}> {
  const specs: Array<{
    systemKey: string;
    title: string;
    parentSystemKey: string | null;
    sortOrder: number;
  }> = [];
  SYSTEM_SUBJECTS.forEach((subject, si) => {
    specs.push({
      systemKey: subjectSystemKey(subject.key),
      title: subject.title,
      parentSystemKey: null,
      sortOrder: si,
    });
    SYSTEM_GRADES.forEach((grade, gi) => {
      specs.push({
        systemKey: gradeSystemKey(subject.key, grade),
        title: gradeTitle(grade),
        parentSystemKey: subjectSystemKey(subject.key),
        sortOrder: gi,
      });
    });
  });
  return specs;
}

/** Id папки класса в дереве (или null, если структура не найдена). */
export function findGradeFolderId(
  folders: readonly MaterialFolder[],
  subject: SystemSubjectKey,
  grade: string
): string | null {
  const key = gradeSystemKey(subject, grade as SystemGrade);
  return folders.find((f) => f.systemKey === key)?.id ?? null;
}

/**
 * Предмет и класс системного пути для папки (сама или ближайший предок-класс).
 */
export function resolveFolderClassPath(
  folders: readonly MaterialFolder[],
  folderId: string | null | undefined
): { subject: SystemSubjectKey; grade: SystemGrade } | null {
  if (!folderId) return null;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur = byId.get(folderId);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const parsed = parseGradeSystemKey(cur.systemKey);
    if (parsed) return parsed;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

export function collectSubtreeFolderIds(
  folders: readonly MaterialFolder[],
  rootId: string
): Set<string> {
  const byParent = new Map<string | null, MaterialFolder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of byParent.get(id) ?? []) {
      stack.push(child.id);
    }
  }
  return out;
}

export function materialMatchesStudentClass(
  folders: readonly MaterialFolder[],
  folderId: string | null | undefined,
  subject: SystemSubjectKey,
  grade: string
): boolean {
  const path = resolveFolderClassPath(folders, folderId);
  if (!path) return false;
  return path.subject === subject && path.grade === grade;
}

export function asSystemGrade(
  grade: StudentGrade | string | null | undefined
): SystemGrade | null {
  if (!grade) return null;
  return (SYSTEM_GRADES as readonly string[]).includes(grade)
    ? (grade as SystemGrade)
    : null;
}
