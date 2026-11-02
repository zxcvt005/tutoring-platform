export const MOCK_EXAM_EMPTY_TITLE = "Пока нет результатов пробников";
export const MOCK_EXAM_EMPTY_TEXT =
  "Результаты появятся после того, как преподаватель внесёт их в систему.";

export const TEST_SCORE_MAX = 100;

const SCORE_MESSAGE = "Вторичный балл должен быть целым числом от 0 до 100";
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

export type ParseOk<T> = { ok: true; value: T };
export type ParseFail = { ok: false; message: string };

export function parseTestScore(value: unknown): ParseOk<number> | ParseFail {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > TEST_SCORE_MAX) {
      return { ok: false, message: SCORE_MESSAGE };
    }
    return { ok: true, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
      return { ok: false, message: SCORE_MESSAGE };
    }
    const parsed = Number(trimmed);
    if (parsed > TEST_SCORE_MAX) return { ok: false, message: SCORE_MESSAGE };
    return { ok: true, value: parsed };
  }
  return { ok: false, message: SCORE_MESSAGE };
}

export function parseExamTitle(value: unknown): ParseOk<string> | ParseFail {
  if (typeof value !== "string") {
    return { ok: false, message: "Укажите название пробника" };
  }
  const title = value.trim();
  if (!title) return { ok: false, message: "Укажите название пробника" };
  if (title.length > TITLE_MAX) {
    return { ok: false, message: "Название длиннее 120 символов" };
  }
  return { ok: true, value: title };
}

export function parseExamDate(value: unknown): ParseOk<string> | ParseFail {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, message: "Укажите дату проведения" };
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || year < 2000 || year > 2100) {
    return { ok: false, message: "Некорректная дата" };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, message: "Некорректная дата" };
  }
  return { ok: true, value };
}

export function parseExamDescription(
  value: unknown
): ParseOk<string | null> | ParseFail {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, message: "Некорректный комментарий" };
  }
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > DESCRIPTION_MAX) {
    return { ok: false, message: "Комментарий длиннее 2000 символов" };
  }
  return { ok: true, value: text };
}

export type MockExamOrder = {
  id: string;
  date: string;
  createdAt?: string;
};

export function compareMockExams(a: MockExamOrder, b: MockExamOrder): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const createdA = a.createdAt ?? "";
  const createdB = b.createdAt ?? "";
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function formatExamDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[3])}.${match[2]}.${match[1]}`;
}

export type MockExamPointSource = {
  id: string;
  title: string;
  date: string;
  createdAt?: string;
};

export type MockExamScoreSource = {
  mockExamId: string;
  studentId: string;
  testScore: number;
  updatedAt?: string;
};

export type MockExamChartPoint = {
  examId: string;
  title: string;
  date: string;
  axisLabel: string;
  testScore: number;
};

export type MockExamSeries = {
  points: MockExamChartPoint[];
  latestTestScore: number | null;
  delta: number | null;
};

function shortDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[3])}.${match[2]}`;
}

function axisLabel(title: string, date: string, duplicate: boolean): string {
  const label = shortDate(date);
  if (!duplicate) return label;
  const trimmed = title.trim();
  const short =
    Array.from(trimmed).length > 8
      ? `${Array.from(trimmed).slice(0, 8).join("")}…`
      : trimmed;
  return short ? `${label} ${short}` : label;
}

export function studentMockExamSeries(
  exams: readonly MockExamPointSource[],
  results: readonly MockExamScoreSource[],
  studentId: string
): MockExamSeries {
  const byExam = new Map<string, MockExamScoreSource>();
  for (const result of results) {
    if (result.studentId !== studentId) continue;
    const previous = byExam.get(result.mockExamId);
    if (!previous || (result.updatedAt ?? "") >= (previous.updatedAt ?? "")) {
      byExam.set(result.mockExamId, result);
    }
  }

  const linked = exams
    .filter((exam) => byExam.has(exam.id))
    .slice()
    .sort(compareMockExams);
  const dateCount = new Map<string, number>();
  for (const exam of linked) {
    dateCount.set(exam.date, (dateCount.get(exam.date) ?? 0) + 1);
  }

  const points: MockExamChartPoint[] = [];
  for (const exam of linked) {
    const result = byExam.get(exam.id);
    if (!result) continue;
    const parsed = parseTestScore(result.testScore);
    if (!parsed.ok) continue;
    points.push({
      examId: exam.id,
      title: exam.title,
      date: exam.date,
      axisLabel: axisLabel(
        exam.title,
        exam.date,
        (dateCount.get(exam.date) ?? 0) > 1
      ),
      testScore: parsed.value,
    });
  }

  const latest = points.at(-1) ?? null;
  const previous = points.at(-2) ?? null;
  return {
    points,
    latestTestScore: latest?.testScore ?? null,
    delta:
      latest && previous ? latest.testScore - previous.testScore : null,
  };
}

export function formatScoreDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}
