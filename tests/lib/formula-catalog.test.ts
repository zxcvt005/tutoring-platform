import { describe, expect, it } from "vitest";

import {
  FORMULA_CATALOG,
  FORMULA_BY_ID,
  TRAINER_GROUPS,
  groupBySectionId,
  listSubsections,
} from "@/lib/formula-trainer/catalog";

describe("formula catalog", () => {
  it("has unique stable ids and expected size", () => {
    const ids = FORMULA_CATALOG.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FORMULA_CATALOG.length).toBe(143);
    expect(FORMULA_BY_ID.size).toBe(143);
  });

  it("covers all required subsections", () => {
    const subs = new Set(FORMULA_CATALOG.map((f) => f.subsectionId));
    for (const id of [
      "kinematics",
      "rotation",
      "dynamics",
      "statics",
      "conservation",
      "oscillations",
      "mkt",
      "internal_energy",
      "humidity",
      "heat",
      "thermo",
      "electrostatics",
      "capacitors",
      "dc",
      "series_parallel",
      "joule",
      "magnetism",
      "induction",
      "inductance",
      "em_oscillations",
      "thin_lens",
      "refraction_diffraction",
      "photon",
      "photoeffect",
      "radioactive",
    ]) {
      expect(subs.has(id as never)).toBe(true);
    }
    expect(listSubsections().length).toBe(25);
  });

  it("keeps agreed notations for dynamics and optics", () => {
    expect(FORMULA_BY_ID.get("mech_dyn_FR_ma")?.expression).toBe("F_R = m*a");
    expect(FORMULA_BY_ID.get("mech_dyn_Fupr")?.expression).toBe(
      "F_upr = k*delta_x"
    );
    expect(FORMULA_BY_ID.get("mech_dyn_gravity")?.expression).toContain("G*");
    expect(FORMULA_BY_ID.get("opt_lens_thin")?.expression).toBe(
      "1/F = 1/d + 1/f"
    );
    expect(FORMULA_BY_ID.get("opt_lens_D")?.expression).toBe("D = 1/F");
    expect(FORMULA_BY_ID.get("qu_rad_decay")?.expression).toBe(
      "N = N0*2^(-t/T)"
    );
    expect(FORMULA_BY_ID.get("mag_L_def")?.expression).toBe("L = Phi/I");
  });

  it("does not contain removed cards", () => {
    const titles = FORMULA_CATALOG.map((f) => f.title);
    expect(titles.some((t) => /F_рез/i.test(t))).toBe(false);
  });

  it("maps every formula to one of four large sections", () => {
    expect(TRAINER_GROUPS.map((g) => g.title)).toEqual([
      "Механика",
      "МКТ и термодинамика",
      "Электричество",
      "Оптика и квантовая физика",
    ]);
    for (const card of FORMULA_CATALOG) {
      expect(groupBySectionId(card.sectionId).id).toBeTruthy();
    }
  });
});
