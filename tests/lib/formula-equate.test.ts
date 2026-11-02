import { describe, expect, it } from "vitest";

import { equateExpressions } from "@/lib/formula-trainer/math/equate";
import { explainMistake } from "@/lib/formula-trainer/math/explain";

describe("formula equivalence", () => {
  it("accepts factor permutation and alternate fractions", () => {
    expect(
      equateExpressions("E_k = m*v^2/2", "E_k = m*v^2/2").status
    ).toBe("equivalent");
    expect(
      equateExpressions("E_k = 1/2*m*v^2", "E_k = m*v^2/2", {
        acceptedForms: ["E_k = 1/2*m*v^2"],
      }).status
    ).toBe("equivalent");
    expect(equateExpressions("m*v^2/2", "E_k = m*v^2/2").status).toBe(
      "equivalent"
    );
    expect(equateExpressions("(a*b)/c", "a*(b/c)").status).toBe("equivalent");
    expect(equateExpressions("v*t", "t*v").status).toBe("equivalent");
  });

  it("accepts parentheses variants", () => {
    expect(
      equateExpressions("s = (v0 + v)*t/2", "s = ((v0 + v)/2)*t", {
        acceptedForms: ["s = (v0 + v)*t/2"],
      }).status
    ).toBe("equivalent");
  });

  it("accepts powers and roots", () => {
    expect(
      equateExpressions("v = sqrt(2*E_k/m)", "v = sqrt(2*E_k/m)").status
    ).toBe("equivalent");
    expect(equateExpressions("a_c = v^2/R", "a_c = v^2/R").status).toBe(
      "equivalent"
    );
  });

  it("rejects wrong sign, power, and multiply/divide swap", () => {
    expect(
      equateExpressions("a = (v0 - v)/t", "a = (v - v0)/t").status
    ).toBe("not_equivalent");
    expect(equateExpressions("a_c = v/R", "a_c = v^2/R").status).toBe(
      "not_equivalent"
    );
    expect(equateExpressions("s = v/t", "s = v*t").status).toBe(
      "not_equivalent"
    );
  });

  it("does not accept another quantity expression as correct", () => {
    expect(
      equateExpressions("v = s/t", "s = v*t", { targetQuantity: "s" }).status
    ).toBe("not_equivalent");
  });

  it("handles empty and invalid input safely", () => {
    expect(equateExpressions("", "s = v*t").status).toBe("invalid");
    expect(equateExpressions("s = (", "s = v*t").status).toBe("invalid");
    expect(equateExpressions("s = v/0*0", "s = v*t").status).not.toBe(
      "equivalent"
    );
  });

  it("explains without inventing when unclear", () => {
    const text = explainMistake("s = a*t", "s = v*t");
    expect(text.length).toBeGreaterThan(0);
  });
});
