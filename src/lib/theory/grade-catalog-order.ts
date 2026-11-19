import { asSystemGrade } from "@/lib/folders/system-kb-structure";

export const THEORY_PREVIEW_GRADES = ["7", "8", "9", "10", "11"] as const;

export type TheoryPreviewGrade = (typeof THEORY_PREVIEW_GRADES)[number];

export function isTheoryPreviewGrade(
  value: string | null | undefined
): value is TheoryPreviewGrade {
  return THEORY_PREVIEW_GRADES.includes(value as TheoryPreviewGrade);
}

export function normalizeTheoryCatalogOrderIds(
  orderedMaterialIds: readonly string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of orderedMaterialIds) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function assertTheoryPreviewGrade(grade: string): TheoryPreviewGrade {
  const normalized = asSystemGrade(grade);
  if (!normalized || !isTheoryPreviewGrade(normalized)) {
    throw new Error("Класс должен быть от 7 до 11");
  }
  return normalized;
}
