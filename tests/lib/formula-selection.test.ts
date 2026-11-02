import { describe, expect, it } from "vitest";

import {
  FORMULA_CATALOG,
  subsectionsForGroup,
} from "@/lib/formula-trainer/catalog";
import { buildChoiceOptions } from "@/lib/formula-trainer/distractors";
import { applyAttempt, emptyProgress } from "@/lib/formula-trainer/progress";
import { selectNextQuestion } from "@/lib/formula-trainer/selection";
import { MASTERY_STREAK_REQUIRED } from "@/lib/formula-trainer/types";
import { isSafeDistractor } from "@/lib/formula-trainer/math/equate";

describe("choice options", () => {
  it("builds four unique options with one correct", () => {
    const card = FORMULA_CATALOG.find((f) => f.id === "mech_cons_Ek")!;
    const built = buildChoiceOptions(card, FORMULA_CATALOG, 42);
    expect(built).not.toBeNull();
    expect(built!.options).toHaveLength(4);
    const ids = new Set(built!.options.map((o) => o.id));
    expect(ids.size).toBe(4);
    expect(built!.options.some((o) => o.id === built!.correctOptionId)).toBe(
      true
    );
    for (const opt of built!.options) {
      if (opt.id === built!.correctOptionId) continue;
      expect(
        isSafeDistractor(opt.expression, card.expression, card.acceptedForms)
      ).toBe(true);
    }
  });
});

describe("modes and selection", () => {
  it("questions stay inside the selected large section", () => {
    const subsectionIds = subsectionsForGroup("optics_quantum");
    for (let seed = 1; seed <= 20; seed++) {
      const res = selectNextQuestion({
        subsectionIds,
        progress: new Map(),
        weakSpotsOnly: false,
        seed,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(["optics", "quantum"]).toContain(res.formula.sectionId);
      expect(res.kind).toBe("choice");
    }
  });

  it("picks each formula in the pool with equal weight and ignores progress", () => {
    const subsectionIds = subsectionsForGroup("optics_quantum");
    const pool = FORMULA_CATALOG.filter((formula) =>
      subsectionIds.includes(formula.subsectionId)
    );
    const progress = new Map();
    const erred = pool[0]!;
    let wrong = applyAttempt(emptyProgress(erred.id), erred.id, false);
    wrong = applyAttempt(wrong, erred.id, false);
    progress.set(erred.id, wrong);
    const mastered = pool[1]!;
    let row = emptyProgress(mastered.id);
    for (let i = 0; i < MASTERY_STREAK_REQUIRED; i++) {
      row = applyAttempt(row, mastered.id, true);
    }
    progress.set(mastered.id, row);

    const pick = (value: number, source: Map<string, typeof row>) =>
      selectNextQuestion({
        subsectionIds,
        progress: source,
        weakSpotsOnly: false,
        rng: () => value,
      });

    expect(pick(0, progress)).toEqual(pick(0, new Map()));
    expect(pick(0.5, progress)).toEqual(pick(0.5, new Map()));
    const first = pick(0, progress);
    const middle = pick(0.5, progress);
    expect(first.ok && first.formula.id).toBe(pool[0]!.id);
    expect(middle.ok && middle.formula.id).toBe(
      pool[Math.floor(0.5 * pool.length) % pool.length]!.id
    );
  });

  it("keeps a formula streak when another formula is answered", () => {
    let first = emptyProgress("formula-a");
    first = applyAttempt(first, "formula-a", true);
    first = applyAttempt(first, "formula-a", true);
    const other = applyAttempt(emptyProgress("formula-b"), "formula-b", false);
    first = applyAttempt(first, "formula-a", true);
    expect(first.status).toBe("mastered");
    expect(first.streak).toBe(3);
    expect(other.streak).toBe(0);
    expect(other.formulaId).toBe("formula-b");
  });

  it("mastery requires streak and error resets", () => {
    let p = emptyProgress("x");
    p = applyAttempt(p, "x", true);
    expect(p.status).not.toBe("mastered");
    p = applyAttempt(p, "x", true);
    p = applyAttempt(p, "x", true);
    expect(p.status).toBe("mastered");
    p = applyAttempt(p, "x", false);
    expect(p.status).toBe("needs_review");
  });
});
