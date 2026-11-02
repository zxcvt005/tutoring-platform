import katex from "katex";
import { describe, expect, it } from "vitest";

import {
  FORMULA_MATH_WRAP_CLASS,
  FORMULA_OPTION_BUTTON_CLASS,
} from "@/components/formula-trainer/formula-option-styles";
import { FORMULA_CATALOG } from "@/lib/formula-trainer/catalog";
import { buildChoiceOptions } from "@/lib/formula-trainer/distractors";
import {
  expressionToLatex,
  expressionToPlain,
  greekNamesToWords,
} from "@/lib/formula-trainer/expression-to-latex";

function render(latex: string) {
  return katex.renderToString(latex, {
    throwOnError: true,
    strict: "ignore",
  });
}

const GREEK_WORD_LATEX = /\\text\{(альфа|бета|гамма|дельта|эпсилон|лямбда|ню|пи|ро|фи|омега)\}/;

describe("expressionToLatex", () => {
  it("renders multi-index identifiers instead of raw DSL", () => {
    const latex = expressionToLatex("p = 2*n*E_k_avg/3");
    expect(latex).not.toContain("E_k_avg");
    expect(latex).not.toContain("mathrm{avg}");
    expect(latex).toContain("\\langle E_{k}\\rangle");
    expect(latex).toContain("\\frac");
    expect(() => render(latex)).not.toThrow();
  });

  it("renders greek letters as mathematical symbols, not russian words", () => {
    const latex = expressionToLatex("omega = 2*pi*nu");
    expect(latex).toContain("\\omega");
    expect(latex).toContain("\\pi");
    expect(latex).toContain("\\nu");
    expect(latex).not.toMatch(GREEK_WORD_LATEX);
    expect(render(latex)).not.toContain("katex-error");
    expect(render(latex)).toContain("ω");
    expect(render(latex)).toContain("π");
    expect(render(latex)).toContain("ν");
  });

  it("renders greek symbols inside subscripts", () => {
    const latex = expressionToLatex("F = k*delta_x");
    expect(latex).toContain("\\delta_{x}");
    expect(latex).not.toMatch(GREEK_WORD_LATEX);
    expect(render(latex)).not.toContain("katex-error");
  });

  it("keeps greek letter names as words in explanatory plain text", () => {
    expect(expressionToPlain("F = k*delta_x")).toContain("дельта");
    expect(greekNamesToWords("Нужна формула для omega, а не для nu")).toContain(
      "омега"
    );
    expect(greekNamesToWords("Нужна формула для omega, а не для nu")).toContain(
      "ню"
    );
  });

  it("renders subscripts, powers, fractions, roots and trig", () => {
    expect(expressionToLatex("F_R = m*a")).toContain("F_{R}");
    expect(expressionToLatex("a_c = v^2/R")).toContain("a_{c}");
    expect(expressionToLatex("a_c = v^2/R")).toContain("\\frac");
    expect(expressionToLatex("T = 2*pi*sqrt(l/g)")).toContain("\\sqrt");
    expect(expressionToLatex("A = F*s*cos(alpha)")).toContain("\\alpha");
    expect(expressionToLatex("A = F*s*cos(alpha)")).not.toContain("\\text{альфа}");
    expect(expressionToLatex("1/F = 1/d + 1/f")).toContain("\\frac{1}{F}");
  });

  it("renders the screenshot oscillation formulas with symbols and roots", () => {
    const cases = [
      {
        expression: "T = pi*sqrt(m/k)",
        tokens: ["\\pi", "\\sqrt", "\\frac"],
      },
      {
        expression: "T = omega*A",
        tokens: ["\\omega"],
      },
      {
        expression: "T = 2*pi*sqrt(l/g)",
        tokens: ["\\pi", "\\sqrt", "\\frac"],
      },
    ];
    for (const item of cases) {
      const latex = expressionToLatex(item.expression);
      expect(latex, item.expression).not.toMatch(GREEK_WORD_LATEX);
      for (const token of item.tokens) {
        expect(latex, item.expression).toContain(token);
      }
      const html = render(latex);
      expect(html, item.expression).not.toContain("katex-error");
    }
  });

  it("renders the kinetic-pressure card and its choice options", () => {
    const card = FORMULA_CATALOG.find((f) => f.id === "mol_mkt_p_Ek")!;
    expect(card.title).toBe(
      "Давление через среднюю кинетическую энергию молекул"
    );
    const built = buildChoiceOptions(card, FORMULA_CATALOG, 11);
    expect(built).not.toBeNull();
    expect(built!.options).toHaveLength(4);
    const pressureLatex = expressionToLatex(card.expression);
    expect(pressureLatex).toContain("\\langle E_{k}\\rangle");
    expect(pressureLatex).not.toContain("mathrm{avg}");
    for (const opt of built!.options) {
      const latex = expressionToLatex(opt.expression);
      expect(latex).not.toMatch(/E_k_avg(?![}])/);
      if (opt.expression.includes("E_k_avg")) {
        expect(latex).toContain("\\langle E_{k}\\rangle");
        expect(latex).not.toContain("mathrm{avg}");
      }
      expect(latex).not.toMatch(GREEK_WORD_LATEX);
      const html = render(latex);
      expect(html).not.toContain("katex-error");
    }
  });

  it("renders mean values with angle brackets and keeps rms distinct", () => {
    expect(expressionToLatex("E_k_avg = 3*k*T/2")).toContain(
      "\\langle E_{k}\\rangle"
    );
    expect(expressionToLatex("E_k_avg = m0*mean(v^2)/2")).toContain(
      "\\langle v^{2}\\rangle"
    );
    const rms = expressionToLatex("p = m0*n*v_rms^2/3");
    expect(rms).toContain("v_{\\mathrm{rms}}");
    expect(rms).not.toContain("\\langle");
  });

  it("renders every catalog formula with katex symbols", () => {
    for (const card of FORMULA_CATALOG) {
      const latex = expressionToLatex(card.expression);
      expect(latex, card.expression).not.toMatch(GREEK_WORD_LATEX);
      expect(() => render(latex), card.expression).not.toThrow();
      const html = render(latex);
      expect(html, card.expression).not.toContain("katex-error");
    }
  });
});

describe("formula option layout classes", () => {
  it("does not fix option height or create a math scrollport", () => {
    expect(FORMULA_OPTION_BUTTON_CLASS).toMatch(/\bmin-h-12\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).toMatch(/\boverflow-visible\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/\boverflow-x-auto\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/\boverflow-y-auto\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/\boverflow-auto\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/\boverflow-hidden\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/\boverflow-scroll\b/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/(?:^|\s)max-h-/);
    expect(FORMULA_OPTION_BUTTON_CLASS).not.toMatch(/(?:^|\s)h-\d+(?:\s|$)/);
    expect(FORMULA_MATH_WRAP_CLASS).toMatch(/\boverflow-visible\b/);
    expect(FORMULA_MATH_WRAP_CLASS).not.toMatch(/\boverflow-x-auto\b/);
    expect(FORMULA_MATH_WRAP_CLASS).not.toMatch(/\boverflow-y-auto\b/);
    expect(FORMULA_MATH_WRAP_CLASS).not.toMatch(/\boverflow-auto\b/);
    expect(FORMULA_MATH_WRAP_CLASS).not.toMatch(/\boverflow-scroll\b/);
  });
});
