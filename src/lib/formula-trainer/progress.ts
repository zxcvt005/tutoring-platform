import { FORMULA_CATALOG, formulasInSubsections } from "./catalog";
import {
  MASTERY_STREAK_REQUIRED,
  type FormulaProgressRow,
  type FormulaSubsectionId,
  type MasteryStatus,
  type SectionStats,
} from "./types";

const REVIEW_DAYS = [1, 3, 7, 14];

export function applyAttempt(
  prev: FormulaProgressRow | null | undefined,
  formulaId: string,
  correct: boolean,
  now = new Date()
): FormulaProgressRow {
  const base: FormulaProgressRow = prev ?? {
    formulaId,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    status: "new",
    streak: 0,
    lastAttemptAt: null,
    nextReviewAt: null,
  };

  const attempts = base.attempts + 1;
  const correctCount = base.correctCount + (correct ? 1 : 0);
  const wrongCount = base.wrongCount + (correct ? 0 : 1);
  const streak = correct ? base.streak + 1 : 0;

  // Освоение — только три верных ответа подряд по этой формуле.
  // Короткий остаток серии не сохраняет прежний статус mastered.
  const status: MasteryStatus =
    correct && streak >= MASTERY_STREAK_REQUIRED ? "mastered" : "needs_review";

  // после ошибки с mastered → needs_review уже выставлено
  let nextReviewAt: string | null = null;
  if (correct) {
    const dayIdx = Math.min(streak - 1, REVIEW_DAYS.length - 1);
    const days = REVIEW_DAYS[Math.max(0, dayIdx)]!;
    nextReviewAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  } else {
    nextReviewAt = now.toISOString();
  }

  return {
    formulaId,
    attempts,
    correctCount,
    wrongCount,
    status,
    streak,
    lastAttemptAt: now.toISOString(),
    nextReviewAt,
  };
}

export function emptyProgress(formulaId: string): FormulaProgressRow {
  return {
    formulaId,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    status: "new",
    streak: 0,
    lastAttemptAt: null,
    nextReviewAt: null,
  };
}

export function buildSectionStats(
  progress: Map<string, FormulaProgressRow>,
  subsectionFilter?: FormulaSubsectionId[] | null
): SectionStats[] {
  const cards = formulasInSubsections(subsectionFilter ?? null);
  const bySub = new Map<FormulaSubsectionId, typeof cards>();
  for (const c of cards) {
    const list = bySub.get(c.subsectionId) ?? [];
    list.push(c);
    bySub.set(c.subsectionId, list);
  }

  const result: SectionStats[] = [];

  // по подразделам
  for (const [subsectionId, list] of bySub) {
    result.push(statsForGroup(list, progress, subsectionId, list[0]!.subsectionTitle));
  }

  // агрегаты по разделам
  const bySec = new Map<string, typeof cards>();
  for (const c of cards) {
    const list = bySec.get(c.sectionId) ?? [];
    list.push(c);
    bySec.set(c.sectionId, list);
  }
  for (const [sectionId, list] of bySec) {
    result.push({
      ...statsForGroup(list, progress, null, list[0]!.sectionTitle),
      sectionId: sectionId as SectionStats["sectionId"],
      subsectionId: null,
    });
  }

  return result;
}

function statsForGroup(
  list: typeof FORMULA_CATALOG,
  progress: Map<string, FormulaProgressRow>,
  subsectionId: FormulaSubsectionId | null,
  title: string
): SectionStats {
  let mastered = 0;
  let newer = 0;
  let needsReview = 0;
  let attempts = 0;
  let correctCount = 0;
  let wrongCount = 0;
  for (const f of list) {
    const p = progress.get(f.id);
    if (!p || p.attempts === 0) {
      newer += 1;
      continue;
    }
    attempts += p.attempts;
    correctCount += p.correctCount;
    wrongCount += p.wrongCount;
    if (p.status === "mastered") mastered += 1;
    else if (p.status === "needs_review") needsReview += 1;
    else newer += 1;
  }
  return {
    sectionId: list[0]!.sectionId,
    subsectionId,
    title,
    total: list.length,
    mastered,
    newer,
    needsReview,
    attempts,
    correctCount,
    wrongCount,
    accuracy: attempts === 0 ? null : correctCount / attempts,
  };
}
