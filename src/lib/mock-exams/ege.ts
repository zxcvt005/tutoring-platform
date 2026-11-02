import { primaryToTestScore } from "@/lib/mock-exams/scale";

export type Part1Rule = "exact" | "positional" | "multiset" | "unordered-exact";

export type Part1Task = {
  number: number;
  maxScore: 1 | 2;
  rule: Part1Rule;
};

export const PART1_TASKS: readonly Part1Task[] = [
  { number: 1, maxScore: 1, rule: "exact" },
  { number: 2, maxScore: 1, rule: "exact" },
  { number: 3, maxScore: 1, rule: "exact" },
  { number: 4, maxScore: 1, rule: "exact" },
  { number: 5, maxScore: 2, rule: "multiset" },
  { number: 6, maxScore: 2, rule: "positional" },
  { number: 7, maxScore: 1, rule: "exact" },
  { number: 8, maxScore: 1, rule: "exact" },
  { number: 9, maxScore: 2, rule: "multiset" },
  { number: 10, maxScore: 2, rule: "positional" },
  { number: 11, maxScore: 1, rule: "exact" },
  { number: 12, maxScore: 1, rule: "exact" },
  { number: 13, maxScore: 1, rule: "exact" },
  { number: 14, maxScore: 2, rule: "multiset" },
  { number: 15, maxScore: 2, rule: "positional" },
  { number: 16, maxScore: 1, rule: "exact" },
  { number: 17, maxScore: 2, rule: "positional" },
  { number: 18, maxScore: 2, rule: "multiset" },
  { number: 19, maxScore: 1, rule: "exact" },
  { number: 20, maxScore: 1, rule: "unordered-exact" },
];

export const PART2_TASKS = [
  { number: 21, maxScore: 3 },
  { number: 22, maxScore: 2 },
  { number: 23, maxScore: 2 },
  { number: 24, maxScore: 3 },
  { number: 25, maxScore: 3 },
  { number: 26, maxScore: 4 },
] as const;

export const PART1_MAX = PART1_TASKS.reduce((sum, task) => sum + task.maxScore, 0);
export const PART2_MAX = PART2_TASKS.reduce((sum, task) => sum + task.maxScore, 0);
export const PRIMARY_MAX = PART1_MAX + PART2_MAX;

function symbols(value: string): string[] {
  return Array.from(value);
}

function multisetDiff(expected: readonly string[], given: readonly string[]) {
  const expectedCount = new Map<string, number>();
  const givenCount = new Map<string, number>();
  for (const symbol of expected) {
    expectedCount.set(symbol, (expectedCount.get(symbol) ?? 0) + 1);
  }
  for (const symbol of given) {
    givenCount.set(symbol, (givenCount.get(symbol) ?? 0) + 1);
  }
  const alphabet = new Set([...expectedCount.keys(), ...givenCount.keys()]);
  let extra = 0;
  let missing = 0;
  for (const symbol of alphabet) {
    const left = expectedCount.get(symbol) ?? 0;
    const right = givenCount.get(symbol) ?? 0;
    if (right > left) extra += right - left;
    if (left > right) missing += left - right;
  }
  return { extra, missing };
}

export function scorePart1Task(
  taskNumber: number,
  reference: string,
  answer: string
): number | null {
  const task = PART1_TASKS.find((item) => item.number === taskNumber);
  if (!task) return null;
  const expected = symbols(reference.trim());
  const given = symbols(answer.trim());
  if (expected.length === 0 || given.length === 0) return null;

  if (task.rule === "exact") {
    return reference.trim() === answer.trim() ? 1 : 0;
  }

  if (task.rule === "unordered-exact") {
    const diff = multisetDiff(expected, given);
    return diff.extra === 0 && diff.missing === 0 ? 1 : 0;
  }

  if (task.rule === "positional") {
    if (given.length > expected.length) return 0;
    let mismatches = 0;
    for (let index = 0; index < expected.length; index += 1) {
      if (given[index] !== expected[index]) mismatches += 1;
    }
    if (mismatches === 0) return 2;
    if (mismatches === 1) return 1;
    return 0;
  }

  const diff = multisetDiff(expected, given);
  const distance = Math.max(diff.extra, diff.missing);
  if (distance === 0) return 2;
  if (distance === 1) return 1;
  return 0;
}

export function normalizePart2Score(
  taskNumber: number,
  value: unknown
): number | null {
  const task = PART2_TASKS.find((item) => item.number === taskNumber);
  if (!task) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > task.maxScore) return null;
  return value;
}

export type EgeTaskScore = {
  number: number;
  maxScore: number;
  score: number | null;
};

export type EgeSummary = {
  tasks: EgeTaskScore[];
  part1Score: number;
  part1Max: number;
  part1Checked: number;
  part2Score: number;
  part2Max: number;
  part2Checked: number;
  primaryScore: number;
  primaryMax: number;
  checkedCount: number;
  complete: boolean;
  testScore: number | null;
};

export function summarizeEge(input: {
  references: readonly string[];
  answers: readonly string[];
  part2: readonly unknown[];
}): EgeSummary {
  const tasks: EgeTaskScore[] = PART1_TASKS.map((task, index) => ({
    number: task.number,
    maxScore: task.maxScore,
    score: scorePart1Task(
      task.number,
      input.references[index] ?? "",
      input.answers[index] ?? ""
    ),
  }));
  PART2_TASKS.forEach((task, index) => {
    tasks.push({
      number: task.number,
      maxScore: task.maxScore,
      score: normalizePart2Score(task.number, input.part2[index]),
    });
  });

  const part1 = tasks.slice(0, PART1_TASKS.length);
  const part2 = tasks.slice(PART1_TASKS.length);
  const sum = (items: EgeTaskScore[]) =>
    items.reduce((total, item) => total + (item.score ?? 0), 0);
  const checked = (items: EgeTaskScore[]) =>
    items.filter((item) => item.score != null).length;
  const part1Checked = checked(part1);
  const part2Checked = checked(part2);
  const complete =
    part1Checked === PART1_TASKS.length && part2Checked === PART2_TASKS.length;
  const primaryScore = sum(part1) + sum(part2);

  return {
    tasks,
    part1Score: sum(part1),
    part1Max: PART1_MAX,
    part1Checked,
    part2Score: sum(part2),
    part2Max: PART2_MAX,
    part2Checked,
    primaryScore,
    primaryMax: PRIMARY_MAX,
    checkedCount: part1Checked + part2Checked,
    complete,
    testScore: complete ? primaryToTestScore(primaryScore) : null,
  };
}

export function partScoreLabel(score: number, max: number, checked: number): string {
  if (checked === 0) return `— / ${max}`;
  return `${score} / ${max}`;
}

export function taskScoreLabel(score: number | null): string {
  return score == null ? "—" : String(score);
}

export function formatEgeSummary(summary: EgeSummary): string {
  const line = (tasks: EgeTaskScore[]) =>
    tasks
      .map((task) => `${task.number}: ${taskScoreLabel(task.score)}`)
      .join(" | ");
  const lines = ["Результат пробного ЕГЭ"];
  if (!summary.complete) lines.push("Проверка не завершена");
  lines.push(
    "",
    `Первая часть: ${partScoreLabel(summary.part1Score, summary.part1Max, summary.part1Checked)}`,
    `Вторая часть: ${partScoreLabel(summary.part2Score, summary.part2Max, summary.part2Checked)}`,
    `Первичный балл: ${partScoreLabel(summary.primaryScore, summary.primaryMax, summary.checkedCount)}`,
    `Вторичный балл: ${summary.testScore == null ? "—" : String(summary.testScore)}`,
    "",
    line(summary.tasks.slice(0, PART1_TASKS.length)),
    line(summary.tasks.slice(PART1_TASKS.length))
  );
  return lines.join("\n");
}
