/**
 * Замена символов, которых нет в WIN1251 (частый случай Windows + embedded PG).
 * Кириллица сохраняется. На UTF8 (Linux / Timeweb) вызывать не нужно.
 */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/⁰/g, "^0"],
  [/¹/g, "^1"],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/⁴/g, "^4"],
  [/⁵/g, "^5"],
  [/⁶/g, "^6"],
  [/⁷/g, "^7"],
  [/⁸/g, "^8"],
  [/⁹/g, "^9"],
  [/ⁿ/g, "^n"],
  [/⁻/g, "-"],
  [/ˣ/g, "x"],
  [/ℝ/g, "R"],
  [/Δ/g, "d"],
  [/δ/g, "d"],
  [/α/g, "a"],
  [/β/g, "b"],
  [/γ/g, "g"],
  [/π/g, "pi"],
  [/ρ/g, "rho"],
  [/λ/g, "lambda"],
  [/ν/g, "nu"],
  [/ω/g, "omega"],
  [/φ/g, "phi"],
  [/Φ/g, "Phi"],
  [/ε/g, "eps"],
  [/η/g, "eta"],
  [/μ/g, "mu"],
  [/σ/g, "sigma"],
  [/τ/g, "tau"],
  [/°/g, " deg"],
  [/≈/g, "~"],
  [/∼/g, "~"],
  [/⊥/g, "perp"],
  [/√/g, "sqrt"],
  [/∞/g, "inf"],
  [/×/g, "x"],
  [/÷/g, "/"],
  [/±/g, "+-"],
  [/⇒/g, "=>"],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↔/g, "<->"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "!="],
  [/∈/g, "in"],
  [/−/g, "-"],
  [/−/g, "-"], // U+2212 minus
  [/·/g, "*"],
  [/—/g, "-"],
  [/–/g, "-"],
  [/…/g, "..."],
];

export function toWin1251SafeString(input: string): string {
  let out = input;
  for (const [re, replacement] of REPLACEMENTS) {
    out = out.replace(re, replacement);
  }
  // Всё, чего нет в ASCII/кириллице WIN1251, выкидываем — jsonb на Windows-PG иначе падает.
  out = out.replace(/[^\t\n\r\x20-\x7EЁёА-Яа-я]/g, "");
  return out;
}

export function deepWin1251Safe<T>(value: T): T {
  if (typeof value === "string") {
    return toWin1251SafeString(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepWin1251Safe(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepWin1251Safe(v);
    }
    return out as T;
  }
  return value;
}
