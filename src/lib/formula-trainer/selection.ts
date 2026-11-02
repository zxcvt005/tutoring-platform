import { formulasInSubsections } from "./catalog";
import { createRng, pickIndex, type Rng } from "./rng";
import type {
  FormulaCard,
  FormulaProgressRow,
  FormulaSubsectionId,
  QuestionKind,
} from "./types";

export const WEAK_TOPIC_CLEAR_STREAK = 2;

export type SelectionInput = {
  subsectionIds: FormulaSubsectionId[];
  progress: Map<string, FormulaProgressRow>;
  weakSpotsOnly: boolean;
  /** Не влияет на вероятность. Оставлено, чтобы старые вызовы не ломались. */
  recentFormulaIds?: string[];
  now?: Date;
  seed?: number;
  rng?: Rng;
};

export type SelectionResult =
  | { ok: true; formula: FormulaCard; kind: QuestionKind }
  | { ok: false; reason: string };

function rowOf(
  id: string,
  progress: Map<string, FormulaProgressRow>
): FormulaProgressRow | undefined {
  return progress.get(id);
}

/**
 * Формула сама по себе ещё не закрыла слабую тему:
 * ошибка была, а двух верных ответов подряд сейчас нет.
 * Исторический wrongCount при серии от двух тему не держит.
 */
export function formulaIsWeak(
  progress: FormulaProgressRow | null | undefined
): boolean {
  if (!progress) return false;
  return progress.wrongCount > 0 && progress.streak < WEAK_TOPIC_CLEAR_STREAK;
}

/**
 * Тема слабая, только если в ней уже была ошибка и ещё не по каждой
 * формуле набрано два верных ответа подряд. Формулы без попыток сами
 * тему слабой не делают, но мешают выйти из слабых, если ошибка уже была.
 */
export function subsectionIsWeak(
  formulas: readonly { id: string }[],
  progress: Map<string, FormulaProgressRow>
): boolean {
  if (formulas.length === 0) return false;
  let hadError = false;
  let allCleared = true;
  for (const formula of formulas) {
    const row = rowOf(formula.id, progress);
    if ((row?.wrongCount ?? 0) > 0) hadError = true;
    if ((row?.streak ?? 0) < WEAK_TOPIC_CLEAR_STREAK) allCleared = false;
  }
  return hadError && !allCleared;
}

export function listWeakSubsectionIds(
  formulas: readonly FormulaCard[],
  progress: Map<string, FormulaProgressRow>
): FormulaSubsectionId[] {
  const bySub = new Map<FormulaSubsectionId, FormulaCard[]>();
  for (const formula of formulas) {
    const list = bySub.get(formula.subsectionId) ?? [];
    list.push(formula);
    bySub.set(formula.subsectionId, list);
  }
  const ids: FormulaSubsectionId[] = [];
  for (const [id, group] of bySub) {
    if (subsectionIsWeak(group, progress)) ids.push(id);
  }
  return ids;
}

/** Равномерная последовательность с возвращением. Прогресс на индексы не влияет. */
export function drawUniformFormulas(
  pool: readonly FormulaCard[],
  count: number,
  rng: Rng
): FormulaCard[] {
  if (pool.length === 0 || count <= 0) return [];
  const drawn: FormulaCard[] = [];
  for (let i = 0; i < count; i++) {
    drawn.push(pool[pickIndex(rng, pool.length)]!);
  }
  return drawn;
}

function poolForSelection(input: SelectionInput): FormulaCard[] {
  let candidates = formulasInSubsections(input.subsectionIds);
  if (!input.weakSpotsOnly) return candidates;
  const weak = new Set(listWeakSubsectionIds(candidates, input.progress));
  candidates = candidates.filter((formula) => weak.has(formula.subsectionId));
  return candidates;
}

/**
 * Один вопрос из пула. У каждой формулы пула одинаковая вероятность.
 * Статусы, ошибки, серии и сроки повторения вес не меняют.
 */
export function selectNextQuestion(input: SelectionInput): SelectionResult {
  const rng = input.rng ?? createRng(input.seed ?? Date.now());
  const candidates = poolForSelection(input);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: input.weakSpotsOnly
        ? "Пока нет слабых тем. Начните обычную тренировку."
        : "Нет формул в выбранных разделах",
    };
  }
  return {
    ok: true,
    formula: candidates[pickIndex(rng, candidates.length)]!,
    kind: "choice",
  };
}
