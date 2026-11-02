import { formatIdentPlain, greekNamesToWords } from "../expression-to-latex";
import { equateExpressions } from "./equate";
import { splitEquals, toMathjsSource } from "./preprocess";

const NEUTRAL =
  "Проверь расположение величин и математические операции";

/**
 * Короткое объяснение ошибки на основе различий эталона и ответа.
 * Не выдумывает диагноз, если разница неоднозначна.
 */
export function explainMistake(
  studentRaw: string,
  referenceRaw: string,
  options?: { acceptedForms?: string[]; targetQuantity?: string | null }
): string {
  const check = equateExpressions(studentRaw, referenceRaw, {
    acceptedForms: options?.acceptedForms,
    targetQuantity: options?.targetQuantity,
  });
  if (check.status === "equivalent") return "";
  if (check.status === "invalid") {
    if (check.detail === "empty") return "Ответ не введен";
    if (check.detail === "forbidden") return "Выражение содержит недопустимые конструкции";
    return "Не удалось разобрать формулу. Проверь синтаксис";
  }
  if (check.status === "unverifiable") return NEUTRAL;

  const studentParts = splitEquals(toMathjsSource(studentRaw));
  const refParts = splitEquals(toMathjsSource(referenceRaw));

  if (studentParts.length === 0) return "Ответ не введен";

  // Ответ — выражение другой величины из связанного закона (левая часть другая)
  if (
    studentParts.length >= 2 &&
    refParts.length >= 2 &&
    studentParts[0] !== refParts[0]
  ) {
    const lhsEq = equateExpressions(studentParts[0]!, refParts[0]!, {
      symbolicCheck: true,
    });
    if (lhsEq.status === "not_equivalent") {
      return `Нужна формула для ${formatIdentPlain(refParts[0]!)}, а не для ${formatIdentPlain(studentParts[0]!)}`;
    }
  }

  // Только RHS
  const studentExpr =
    studentParts.length === 1 ? studentParts[0]! : studentParts[1]!;
  const refExpr = refParts.length === 1 ? refParts[0]! : refParts[1]!;

  const hints = detectSimpleDiff(studentExpr, refExpr);
  if (hints) return greekNamesToWords(hints);

  return NEUTRAL;
}

function detectSimpleDiff(student: string, reference: string): string | null {
  const s = student.replace(/\s+/g, "");
  const r = reference.replace(/\s+/g, "");

  // знак
  if (s.replace(/-/g, "") === r.replace(/-/g, "") && s !== r) {
    return "Перепутан знак в выражении";
  }

  // степень: a^2 vs a
  const powerStudent = [...s.matchAll(/\^(\d+)/g)].map((m) => m[1]);
  const powerRef = [...r.matchAll(/\^(\d+)/g)].map((m) => m[1]);
  if (
    powerStudent.join(",") !== powerRef.join(",") &&
    s.replace(/\^\d+/g, "") === r.replace(/\^\d+/g, "")
  ) {
    return "Неверно поставлена степень";
  }

  // деление / умножение
  if (s.includes("/") && r.includes("*") && !r.includes("/")) {
    return "Вместо умножения использовано деление (или наоборот)";
  }
  if (s.includes("*") && r.includes("/") && !s.includes("/")) {
    return "Вместо деления использовано умножение (или наоборот)";
  }

  // числитель и знаменатель
  const sFrac = s.match(/^(.+)\/(.+)$/);
  const rFrac = r.match(/^(.+)\/(.+)$/);
  if (sFrac && rFrac && sFrac[1] === rFrac[2] && sFrac[2] === rFrac[1]) {
    return "Перепутаны числитель и знаменатель";
  }

  // пропущен множитель 2 или 1/2
  if (
    equateExpressions(`2*(${s})`, r).status === "equivalent" ||
    equateExpressions(`(${s})/2`, r).status === "equivalent"
  ) {
    return "Пропущен или лишний числовой коэффициент";
  }

  return null;
}

export function explainChoiceDiff(
  selectedExpression: string,
  correctExpression: string
): string {
  return explainMistake(selectedExpression, correctExpression);
}
