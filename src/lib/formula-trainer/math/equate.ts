import {
  create,
  all,
  type MathNode,
  type MathJsStatic,
} from "mathjs";

import type { EquivalenceStatus } from "../types";
import { splitEquals, toMathjsSource } from "./preprocess";

const math: MathJsStatic = create(all, {
  // без произвольного кода
}) as MathJsStatic;

export type EquateResult = {
  status: EquivalenceStatus;
  detail?: string;
};

function isEmpty(raw: string): boolean {
  return !raw.trim();
}

/** Запрещённые конструкции — защита от выполнения кода. */
const FORBIDDEN = /(?:^|[^A-Za-z_])(?:eval|Function|import|require|constructor|__proto__|prototype)\b|[\[\];{}]|=>/;

export function isSuspiciousInput(raw: string): boolean {
  return FORBIDDEN.test(raw);
}

function parseNode(source: string): MathNode {
  return math.parse(source);
}

function trySimplify(node: MathNode): MathNode {
  try {
    return math.simplify(node, {}, { exactFractions: true });
  } catch {
    return node;
  }
}

/**
 * Структурное сравнение после simplify + symbolicEqual.
 * true — надёжно эквивалентны; false — не доказано / не равны.
 */
function nodesEquivalent(a: MathNode, b: MathNode): boolean | null {
  try {
    const sa = trySimplify(a);
    const sb = trySimplify(b);
    if (sa.toString() === sb.toString()) return true;
    // symbolicEqual: true надёжен; false не доказательство неравенства
    const eq = (math as MathJsStatic & {
      symbolicEqual: (x: MathNode, y: MathNode) => boolean;
    }).symbolicEqual(sa, sb);
    if (eq) return true;
    // разность → 0
    try {
      const diff = trySimplify(math.simplify(`(${sa.toString()})-(${sb.toString()})`));
      if (diff.toString() === "0") return true;
    } catch {
      /* ignore */
    }
    return false;
  } catch {
    return null;
  }
}

function parseSides(raw: string): { ok: true; parts: string[] } | { ok: false; status: EquivalenceStatus; detail: string } {
  if (isEmpty(raw)) {
    return { ok: false, status: "invalid", detail: "empty" };
  }
  if (isSuspiciousInput(raw)) {
    return { ok: false, status: "invalid", detail: "forbidden" };
  }
  const parts = splitEquals(toMathjsSource(raw));
  if (parts.length === 0) {
    return { ok: false, status: "invalid", detail: "empty" };
  }
  for (const p of parts) {
    try {
      parseNode(p);
    } catch {
      return { ok: false, status: "invalid", detail: "syntax" };
    }
  }
  return { ok: true, parts };
}

/**
 * Проверяет, что ответ ученика математически соответствует эталону.
 * Для уравнений принимает:
 * - полную запись с тем же набором сторон (порядок сторон уравнения может отличаться);
 * - только правую часть, если эталон вида `L = R` и L совпадает с targetQuantity.
 */
export function equateExpressions(
  studentRaw: string,
  referenceRaw: string,
  options?: {
    acceptedForms?: string[];
    targetQuantity?: string | null;
    symbolicCheck?: boolean;
  }
): EquateResult {
  const refs = [
    referenceRaw,
    ...(options?.acceptedForms ?? []),
  ];

  for (const ref of refs) {
    const result = equateOne(studentRaw, ref, options);
    if (result.status === "equivalent") return result;
    if (result.status === "invalid") return result;
  }

  // среди ref ни один не совпал — берём статус первого
  return equateOne(studentRaw, referenceRaw, options);
}

function equateOne(
  studentRaw: string,
  referenceRaw: string,
  options?: {
    targetQuantity?: string | null;
    symbolicCheck?: boolean;
  }
): EquateResult {
  const student = parseSides(studentRaw);
  if (!student.ok) return { status: student.status, detail: student.detail };
  const reference = parseSides(referenceRaw);
  if (!reference.ok) {
    return { status: "unverifiable", detail: "bad_reference" };
  }

  const symbolic = options?.symbolicCheck !== false;

  // Цепочки с несколькими '=' : все части эталона должны быть попарно эквивалентны
  // соответствующему представлению ответа.
  if (reference.parts.length >= 2 && student.parts.length >= 2) {
    const chain = equateEquationChains(student.parts, reference.parts, symbolic);
    if (chain) return chain;
  }

  // Ответ — только выражение (одна часть), эталон — L = R
  if (student.parts.length === 1 && reference.parts.length === 2) {
    const [lhs, rhs] = reference.parts;
    const target = options?.targetQuantity
      ? toMathjsSource(options.targetQuantity)
      : lhs;
    // если ученик ввёл ту же левую часть — это не ответ
    const only = student.parts[0]!;
    if (structuralOrSymbolic(only, target, symbolic) === true) {
      return { status: "not_equivalent", detail: "quantity_only" };
    }
    const vsRhs = structuralOrSymbolic(only, rhs!, symbolic);
    if (vsRhs === true) return { status: "equivalent" };
    if (vsRhs === null) return { status: "unverifiable", detail: "compare_failed" };
    return { status: "not_equivalent" };
  }

  // Эталон — одно выражение, ответ — уравнение: сравниваем RHS или обе стороны
  if (student.parts.length === 2 && reference.parts.length === 1) {
    const vs = structuralOrSymbolic(student.parts[1]!, reference.parts[0]!, symbolic);
    if (vs === true) return { status: "equivalent" };
    if (vs === null) return { status: "unverifiable" };
    return { status: "not_equivalent" };
  }

  // Одинаковое число частей — попарно
  if (student.parts.length === reference.parts.length) {
    // Прямой порядок
    let allOk = true;
    let anyUnverifiable = false;
    for (let i = 0; i < student.parts.length; i++) {
      const r = structuralOrSymbolic(student.parts[i]!, reference.parts[i]!, symbolic);
      if (r === null) anyUnverifiable = true;
      else if (r === false) {
        allOk = false;
        break;
      }
    }
    if (allOk && !anyUnverifiable) return { status: "equivalent" };

    // Для A=B допускаем перестановку сторон, если обе пары согласованы
    if (student.parts.length === 2 && reference.parts.length === 2) {
      const s0 = student.parts[0]!;
      const s1 = student.parts[1]!;
      const r0 = reference.parts[0]!;
      const r1 = reference.parts[1]!;
      const swap =
        structuralOrSymbolic(s0, r1, symbolic) === true &&
        structuralOrSymbolic(s1, r0, symbolic) === true;
      if (swap) return { status: "equivalent" };
      // L совпал, R сравнить
      if (structuralOrSymbolic(s0, r0, symbolic) === true) {
        const rhs = structuralOrSymbolic(s1, r1, symbolic);
        if (rhs === true) return { status: "equivalent" };
        if (rhs === null) return { status: "unverifiable" };
        return { status: "not_equivalent" };
      }
    }

    if (anyUnverifiable && allOk) return { status: "unverifiable" };
    return { status: "not_equivalent" };
  }

  // Цепочка Gamma = H/h = f/d: ответ может быть подцепочкой из acceptedForms
  if (reference.parts.length > 2 && student.parts.length === 2) {
    for (let i = 0; i < reference.parts.length - 1; i++) {
      for (let j = i + 1; j < reference.parts.length; j++) {
        const sub = `${reference.parts[i]} = ${reference.parts[j]}`;
        const subResult = equateOne(studentRaw, sub, options);
        if (subResult.status === "equivalent") return subResult;
      }
    }
  }

  return { status: "not_equivalent" };
}

function equateEquationChains(
  studentParts: string[],
  referenceParts: string[],
  symbolic: boolean
): EquateResult | null {
  // Все части ответа должны быть эквивалентны какой-то части эталона,
  // и все соседние равенства эталона должны сохраняться.
  if (studentParts.length !== referenceParts.length) return null;
  let ok = true;
  let unverifiable = false;
  for (let i = 0; i < studentParts.length; i++) {
    const r = structuralOrSymbolic(studentParts[i]!, referenceParts[i]!, symbolic);
    if (r === null) unverifiable = true;
    else if (!r) {
      ok = false;
      break;
    }
  }
  if (ok && !unverifiable) return { status: "equivalent" };
  if (ok && unverifiable) return { status: "unverifiable" };
  return null;
}

function structuralOrSymbolic(
  aSrc: string,
  bSrc: string,
  symbolic: boolean
): boolean | null {
  try {
    const a = parseNode(aSrc);
    const b = parseNode(bSrc);
    if (!symbolic) {
      // Только строгая simplify-строка и перестановка множителей через simplify
      const sa = trySimplify(a).toString();
      const sb = trySimplify(b).toString();
      if (sa === sb) return true;
      return false;
    }
    return nodesEquivalent(a, b);
  } catch {
    return null;
  }
}

/** Проверка, что distractor не эквивалентен эталону. */
export function isSafeDistractor(
  distractor: string,
  reference: string,
  acceptedForms: string[] = []
): boolean {
  const against = [reference, ...acceptedForms];
  for (const ref of against) {
    const r = equateExpressions(distractor, ref, { symbolicCheck: true });
    if (r.status === "equivalent") return false;
    if (r.status === "unverifiable") return false;
  }
  // distractor сам должен парситься
  const parsed = parseSides(distractor);
  return parsed.ok;
}

export { math };
