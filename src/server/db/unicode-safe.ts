/**
 * Замена символов, которых нет в WIN1251 (частый случай Windows + embedded PG).
 * Кириллица сохраняется. На UTF8 (Linux / Timeweb) вызывать не нужно.
 */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/¹/g, "^1"],
  [/ⁿ/g, "^n"],
  [/⁻/g, "-"],
  [/ˣ/g, "x"],
  [/ℝ/g, "R"],
  [/Δ/g, "d"],
  [/δ/g, "d"],
  [/α/g, "a"],
  [/β/g, "b"],
  [/π/g, "pi"],
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
