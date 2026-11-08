/**
 * Разбор смешанного текста с LaTeX-фрагментами \(...\) и \[...\].
 * Не исполняет HTML/JS из исходника: plain-часть экранируется.
 */

export type RichTextSegment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

const MATH_RE =
  /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$(?!\$)([\s\S]+?)\$/g;

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Разбивает строку на текст и математику. Непарные куски остаются текстом. */
export function splitRichTextMath(source: string): RichTextSegment[] {
  const input = source ?? "";
  if (!input) return [{ kind: "text", value: "" }];

  const segments: RichTextSegment[] = [];
  let last = 0;
  MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MATH_RE.exec(input)) != null) {
    if (match.index > last) {
      segments.push({ kind: "text", value: input.slice(last, match.index) });
    }
    if (match[1] != null) {
      segments.push({ kind: "math", value: match[1].trim(), display: true });
    } else if (match[2] != null) {
      segments.push({ kind: "math", value: match[2].trim(), display: false });
    } else if (match[3] != null) {
      segments.push({ kind: "math", value: match[3].trim(), display: true });
    } else if (match[4] != null) {
      segments.push({ kind: "math", value: match[4].trim(), display: false });
    }
    last = match.index + match[0].length;
  }
  if (last < input.length) {
    segments.push({ kind: "text", value: input.slice(last) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", value: input }];
}

export function textSegmentToHtml(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

export const EMPTY_EXPLANATION_MESSAGE = "Тут пока ничего нет :(";

/** Номера заданий ЕГЭ по физике: список для выбора, без жёсткой привязки к версии КИМ. */
export const KIM_NUMBER_OPTIONS = Array.from({ length: 32 }, (_, i) => i + 1);

export function normalizeKimNumber(
  value: unknown
): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 99) return undefined;
  return n;
}

export function formatKimNumber(value: number | null | undefined): string {
  if (value == null) return "Без номера КИМ";
  return `№ ${value}`;
}
