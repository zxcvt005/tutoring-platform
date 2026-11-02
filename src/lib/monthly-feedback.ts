import { appZonedParts, formatInAppZone, fromAppWall } from "@/lib/app-time";
import { isHomeworkComplete } from "@/lib/homework-missed";
import type { AttendanceStatus, HomeworkAssignmentStatus } from "@/lib/types";

export const FEEDBACK_PRESS_STATUSES = [
  "pending",
  "in_progress",
  "processed",
] as const;
export type FeedbackPressStatus = (typeof FEEDBACK_PRESS_STATUSES)[number];

export const FEEDBACK_FILL_STATUSES = [
  "empty",
  "draft",
  "submitted",
] as const;
export type FeedbackFillStatus = (typeof FEEDBACK_FILL_STATUSES)[number];

export const feedbackFillStatusLabel: Record<FeedbackFillStatus, string> = {
  empty: "Не заполнена",
  draft: "Черновик",
  submitted: "Отправлена",
};

export const feedbackPressStatusLabel: Record<FeedbackPressStatus, string> = {
  pending: "Ожидает обработки",
  in_progress: "В работе",
  processed: "Обработана",
};

export type FeedbackHomeworkScore = {
  title: string;
  attempt1Percent: number | null;
  attempt2Percent: number | null;
  usedPercent: number | null;
};

export type MonthlyFeedbackMetrics = {
  computedAt: string;
  period: {
    year: number;
    month: number;
    from: string;
    toExclusive: string;
  };
  lessons: {
    available: boolean;
    scheduled: number;
    cancelled: number;
    rescheduled: number;
    occurred: number;
    present: number;
    absentExcused: number;
    absentUnexcused: number;
    unmarked: number;
    plannedRemaining: number;
  };
  homework: {
    available: boolean;
    assigned: number;
    completed: number;
    overdue: number;
    inProgress: number;
    scores: FeedbackHomeworkScore[];
    averagePercent: number | null;
    previousAveragePercent: number | null;
    previousComparable: boolean;
  };
  topics: {
    available: boolean;
    titles: string[];
  };
  theory: {
    available: boolean;
    assigned: number;
    completed: number;
  };
};

export type FeedbackLessonInput = {
  id: string;
  startsAt: Date;
  status: "planned" | "done" | "cancelled" | string;
};

export type FeedbackAttendanceInput = {
  lessonId: string;
  status: AttendanceStatus | string;
};

export type FeedbackTopicInput = {
  lessonId: string;
  title: string;
};

export type FeedbackHomeworkInput = {
  id: string;
  lessonId: string | null;
  createdAt: Date;
  status: HomeworkAssignmentStatus | string;
  attempt1Percent: unknown;
  attempt2Percent: unknown;
  title: string;
};

export type FeedbackTheoryInput = {
  createdAt: Date;
  status: string;
};

export type FeedbackMetricsSource = {
  now: Date;
  year: number;
  month: number;
  from: Date;
  toExclusive: Date;
  lessons: FeedbackLessonInput[];
  attendances: FeedbackAttendanceInput[];
  topics: FeedbackTopicInput[];
  homework: FeedbackHomeworkInput[];
  previousHomework: FeedbackHomeworkInput[];
  theory: FeedbackTheoryInput[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export function feedbackMonthRange(year: number, month: number): {
  from: Date;
  toExclusive: Date;
} {
  return {
    from: fromAppWall(year, month, 1, 0, 0, 0),
    toExclusive: fromAppWall(year, month + 1, 1, 0, 0, 0),
  };
}

export function currentFeedbackPeriod(now = new Date()): {
  year: number;
  month: number;
} {
  const parts = appZonedParts(now);
  return { year: parts.year, month: parts.month };
}

export function formatFeedbackPeriod(year: number, month: number): string {
  return formatInAppZone(fromAppWall(year, month, 1, 12, 0, 0), {
    month: "long",
    year: "numeric",
  });
}

export function feedbackPeriodKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function parseFeedbackPeriod(input: {
  year?: unknown;
  month?: unknown;
  period?: unknown;
  now?: Date;
}): { year: number; month: number } {
  const period =
    typeof input.period === "string" ? input.period.trim() : "";
  if (/^\d{4}-\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    assertFeedbackPeriod(year, month);
    return { year, month };
  }
  if (input.year != null && input.month != null && input.year !== "" && input.month !== "") {
    const year = Number(input.year);
    const month = Number(input.month);
    assertFeedbackPeriod(year, month);
    return { year, month };
  }
  return currentFeedbackPeriod(input.now ?? new Date());
}

export function assertFeedbackPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error("Некорректный отчётный год");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Некорректный отчётный месяц");
  }
}

export function shiftFeedbackPeriod(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const absolute = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(absolute / 12),
    month: (absolute % 12) + 1,
  };
}

export function teacherFillStatus(input: {
  submittedAt: string | Date | null;
  teacherComment: string | null;
}): FeedbackFillStatus {
  if (input.submittedAt) return "submitted";
  if ((input.teacherComment ?? "").trim()) return "draft";
  return "empty";
}

export function parseNumericPercent(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function bestHomeworkPercent(input: {
  attempt1Percent: unknown;
  attempt2Percent: unknown;
}): number | null {
  const second = parseNumericPercent(input.attempt2Percent);
  if (second != null) return second;
  return parseNumericPercent(input.attempt1Percent);
}

function inRange(at: Date, from: Date, toExclusive: Date): boolean {
  const t = at.getTime();
  return t >= from.getTime() && t < toExclusive.getTime();
}

export function homeworkBelongsToPeriod(
  assignment: { lessonId: string | null; createdAt: Date },
  lessonStartsAt: Map<string, Date>,
  from: Date,
  toExclusive: Date
): boolean {
  if (assignment.lessonId) {
    const startsAt = lessonStartsAt.get(assignment.lessonId);
    if (startsAt) return inRange(startsAt, from, toExclusive);
  }
  return inRange(assignment.createdAt, from, toExclusive);
}

function lessonOccurred(
  lesson: FeedbackLessonInput,
  attendance: FeedbackAttendanceInput | undefined,
  now: Date
): boolean {
  if (lesson.status === "cancelled") return false;
  if (attendance?.status === "cancelled" || attendance?.status === "rescheduled") {
    return false;
  }
  if (lesson.status === "done") return true;
  if (
    attendance?.status === "present" ||
    attendance?.status === "absent_excused" ||
    attendance?.status === "absent_unexcused"
  ) {
    return true;
  }
  return lesson.startsAt.getTime() <= now.getTime();
}

function averagePercents(scores: FeedbackHomeworkScore[]): number | null {
  const values = scores
    .map((s) => s.usedPercent)
    .filter((n): n is number => n != null);
  if (values.length === 0) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function toScores(rows: FeedbackHomeworkInput[]): FeedbackHomeworkScore[] {
  return rows.map((row) => {
    const attempt1Percent = parseNumericPercent(row.attempt1Percent);
    const attempt2Percent = parseNumericPercent(row.attempt2Percent);
    return {
      title: row.title.trim() || "Домашнее задание",
      attempt1Percent,
      attempt2Percent,
      usedPercent: bestHomeworkPercent(row),
    };
  });
}

export function computeMonthlyFeedbackMetrics(
  source: FeedbackMetricsSource
): MonthlyFeedbackMetrics {
  const { from, toExclusive, now, year, month } = source;
  const attendanceByLesson = new Map(
    source.attendances.map((a) => [a.lessonId, a])
  );

  const scheduled = source.lessons.length;
  let cancelled = 0;
  let rescheduled = 0;
  let occurred = 0;
  let present = 0;
  let absentExcused = 0;
  let absentUnexcused = 0;
  let unmarked = 0;
  let plannedRemaining = 0;
  const occurredIds = new Set<string>();

  for (const lesson of source.lessons) {
    const attendance = attendanceByLesson.get(lesson.id);
    if (lesson.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (attendance?.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (attendance?.status === "rescheduled") {
      rescheduled += 1;
      continue;
    }
    if (lessonOccurred(lesson, attendance, now)) {
      occurred += 1;
      occurredIds.add(lesson.id);
      if (attendance?.status === "present") present += 1;
      else if (attendance?.status === "absent_excused") absentExcused += 1;
      else if (attendance?.status === "absent_unexcused") absentUnexcused += 1;
      else unmarked += 1;
      continue;
    }
    if (lesson.status === "planned" && lesson.startsAt.getTime() > now.getTime()) {
      plannedRemaining += 1;
    }
  }

  const homework = source.homework;
  const previousHomework = source.previousHomework;
  const scores = toScores(homework);
  const previousScores = toScores(previousHomework);
  const completed = homework.filter((row) =>
    isHomeworkComplete(row.status as HomeworkAssignmentStatus)
  ).length;
  const overdue = homework.filter((row) => row.status === "overdue").length;
  const inProgress = homework.length - completed - overdue;

  const topicTitles: string[] = [];
  const seenTopics = new Set<string>();
  for (const topic of source.topics) {
    if (!occurredIds.has(topic.lessonId)) continue;
    const title = topic.title.trim();
    if (!title) continue;
    const key = title.toLocaleLowerCase("ru");
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    topicTitles.push(title);
  }

  const theoryAssigned = source.theory.length;
  const theoryCompleted = source.theory.filter(
    (row) => row.status === "completed"
  ).length;

  const averagePercent = averagePercents(scores);
  const previousAveragePercent = averagePercents(previousScores);

  return {
    computedAt: now.toISOString(),
    period: {
      year,
      month,
      from: from.toISOString(),
      toExclusive: toExclusive.toISOString(),
    },
    lessons: {
      available: scheduled > 0,
      scheduled,
      cancelled,
      rescheduled,
      occurred,
      present,
      absentExcused,
      absentUnexcused,
      unmarked,
      plannedRemaining,
    },
    homework: {
      available: homework.length > 0,
      assigned: homework.length,
      completed,
      overdue,
      inProgress: inProgress < 0 ? 0 : inProgress,
      scores,
      averagePercent,
      previousAveragePercent,
      previousComparable:
        averagePercent != null && previousAveragePercent != null,
    },
    topics: {
      available: topicTitles.length > 0,
      titles: topicTitles,
    },
    theory: {
      available: theoryAssigned > 0,
      assigned: theoryAssigned,
      completed: theoryCompleted,
    },
  };
}

export function countAvailableFeedbackMetrics(
  metrics: MonthlyFeedbackMetrics
): number {
  let n = 0;
  if (metrics.lessons.available) n += 1;
  if (metrics.homework.available) n += 1;
  if (metrics.topics.available) n += 1;
  if (metrics.theory.available) n += 1;
  return n;
}

export function feedbackMetricsSummary(metrics: MonthlyFeedbackMetrics): string {
  const parts: string[] = [];
  if (metrics.lessons.available) {
    parts.push(
      `посещено ${metrics.lessons.present} из ${metrics.lessons.occurred} проведённых`
    );
  }
  if (metrics.homework.available) {
    parts.push(
      `ДЗ ${metrics.homework.completed} из ${metrics.homework.assigned}`
    );
  }
  if (metrics.topics.available) {
    parts.push(
      metrics.topics.titles.length === 1
        ? "1 тема"
        : `${metrics.topics.titles.length} тем`
    );
  }
  if (metrics.theory.available) {
    parts.push(
      `теория ${metrics.theory.completed} из ${metrics.theory.assigned}`
    );
  }
  if (parts.length === 0) return "Недостаточно данных за этот месяц";
  return parts.join(" · ");
}

export function emptyMonthlyFeedbackMetrics(
  year: number,
  month: number,
  now = new Date()
): MonthlyFeedbackMetrics {
  const { from, toExclusive } = feedbackMonthRange(year, month);
  return computeMonthlyFeedbackMetrics({
    now,
    year,
    month,
    from,
    toExclusive,
    lessons: [],
    attendances: [],
    topics: [],
    homework: [],
    previousHomework: [],
    theory: [],
  });
}
