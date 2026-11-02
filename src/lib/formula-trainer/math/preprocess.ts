/**
 * Преобразование DSL каталога / ответа ученика в форму, пригодную для mathjs.
 * Не выполняет код — только безопасные текстовые замены и токенизацию.
 */

const PERCENT_RE = /100%/g;

/** Убирает знак процента как единицу (оставляет числовой множитель 100). */
export function stripPercent(raw: string): string {
  return raw.replace(PERCENT_RE, "100");
}

/**
 * Нормализует пробелы и неявное умножение вида `2pi`, `2(x)`, `)(` .
 * Не трогает имена функций и идентификаторы.
 */
export function insertImplicitMultiply(input: string): string {
  let s = input.replace(/\s+/g, "");
  // number or ) followed by letter or (
  s = s.replace(/(\d)([A-Za-z_(])/g, "$1*$2");
  s = s.replace(/(\))(\()/g, "$1*$2");
  s = s.replace(/(\))([A-Za-z_])/g, "$1*$2");
  // closing paren / identifier before (
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)(\()/g, (full, name: string, paren: string) => {
    const fns = new Set([
      "sin",
      "cos",
      "tan",
      "sqrt",
      "abs",
      "mean",
      "log",
      "ln",
      "exp",
    ]);
    if (fns.has(name)) return full;
    return `${name}*${paren}`;
  });
  return s;
}

/** Разбивает выражение с несколькими `=` на цепочку частей. */
export function splitEquals(raw: string): string[] {
  return raw
    .split("=")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function preprocessExpression(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return insertImplicitMultiply(stripPercent(trimmed));
}

/**
 * Готовит одну сторону уравнения / выражение для parse.
 * `^` уже поддерживается mathjs; заменяем unicode минус и т.п.
 */
export function toMathjsSource(raw: string): string {
  let s = preprocessExpression(raw);
  s = s.replace(/[−–—]/g, "-");
  s = s.replace(/·|×/g, "*");
  s = s.replace(/÷/g, "/");
  // MathLive / LaTeX leftovers that may appear in manual answers if converted poorly
  s = s.replace(/\\cdot/g, "*");
  s = s.replace(/\\times/g, "*");
  return s;
}
