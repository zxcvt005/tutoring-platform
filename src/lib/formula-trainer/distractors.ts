import { getFormula } from "./catalog";
import { isSafeDistractor } from "./math/equate";
import { createRng, shuffleInPlace, type Rng } from "./rng";
import type { FormulaCard } from "./types";

export type BuiltChoiceOptions = {
  options: { id: string; expression: string }[];
  correctOptionId: string;
} | null;

const GENERIC_FALLBACKS = [
  "a = b*c",
  "a = b/c",
  "a = b + c",
  "a = b - c",
  "a = b^2/c",
  "a = b*c^2",
];

function collectCandidates(card: FormulaCard, pool: FormulaCard[]): string[] {
  const out: string[] = [...card.distractorTemplates];
  for (const other of pool) {
    if (other.id === card.id) continue;
    if (other.subsectionId !== card.subsectionId) continue;
    out.push(other.expression);
    // правая часть чужой формулы с нашей левой
    const otherRhs = other.expression.split("=")[1]?.trim();
    const myLhs = card.expression.split("=")[0]?.trim();
    if (otherRhs && myLhs && other.expression.includes("=")) {
      out.push(`${myLhs} = ${otherRhs}`);
    }
  }
  return out;
}

/**
 * Строит ровно 4 варианта: 1 правильный + 3 безопасных неправильных.
 * Возвращает null, если невозможно гарантировать корректность.
 */
export function buildChoiceOptions(
  card: FormulaCard,
  pool: FormulaCard[],
  seed: number
): BuiltChoiceOptions {
  const rng = createRng(seed);
  const accepted = [card.expression, ...card.acceptedForms];
  const candidates = collectCandidates(card, pool);
  shuffleInPlace(candidates, rng);

  const wrong: string[] = [];
  const seen = new Set<string>(accepted.map(normKey));

  for (const c of candidates) {
    if (wrong.length >= 3) break;
    const key = normKey(c);
    if (seen.has(key)) continue;
    if (!isSafeDistractor(c, card.expression, card.acceptedForms)) continue;
    seen.add(key);
    wrong.push(c);
  }

  if (wrong.length < 3) {
    for (const fb of GENERIC_FALLBACKS) {
      if (wrong.length >= 3) break;
      const lhs = card.targetQuantity ?? card.expression.split("=")[0]?.trim() ?? "a";
      const crafted = fb.includes("=")
        ? fb.replace(/^a/, lhs)
        : `${lhs} = ${fb}`;
      const key = normKey(crafted);
      if (seen.has(key)) continue;
      if (!isSafeDistractor(crafted, card.expression, card.acceptedForms)) continue;
      seen.add(key);
      wrong.push(crafted);
    }
  }

  if (wrong.length < 3) return null;

  const correctId = `opt_${seed.toString(36)}_c`;
  const options = [
    { id: correctId, expression: card.expression },
    ...wrong.slice(0, 3).map((expression, i) => ({
      id: `opt_${seed.toString(36)}_w${i}`,
      expression,
    })),
  ];
  shuffleInPlace(options, rng);
  return { options, correctOptionId: correctId };
}

function normKey(expr: string): string {
  return expr.replace(/\s+/g, "").toLowerCase();
}

export function buildChoiceOptionsById(
  formulaId: string,
  pool: FormulaCard[],
  seed: number
): BuiltChoiceOptions {
  const card = getFormula(formulaId);
  if (!card) return null;
  return buildChoiceOptions(card, pool, seed);
}

/** Для тестов: зафиксированный rng. */
export function buildChoiceOptionsWithRng(
  card: FormulaCard,
  pool: FormulaCard[],
  rng: Rng
): BuiltChoiceOptions {
  const seed = Math.floor(rng() * 1e9);
  return buildChoiceOptions(card, pool, seed);
}
