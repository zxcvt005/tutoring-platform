/**
 * Календарь и статусы демо-ученика «Александр Демонстрационный».
 * Чистые функции: без БД и без секретов.
 */
import {
  addAppDateKey,
  appDateKey,
  appZonedParts,
  fromAppDateTime,
} from "@/lib/app-time";

export const DEMO_ALEX_STUDENT_ID = "demo_alex";
export const DEMO_ALEX_USER_ID = "user_demo_alex";
export const DEMO_ALEX_EMAIL = "demo.alexandr@umba-school.test";
export const DEMO_ALEX_FULL_NAME = "Александр Демонстрационный";
export const DEMO_ALEX_SCHEDULE_ID = "demo_alex_sched";
export const DEMO_ALEX_CHAT_ID = "demo_alex_chat";

export const DEMO_ALEX_TOPICS = [
  "Кинематика",
  "Динамика",
  "Законы Ньютона",
  "Работа и энергия",
  "Импульс",
  "Столкновения",
  "Молекулярная физика",
  "Термодинамика",
  "Электрическое поле",
  "Постоянный ток",
] as const;

export type DemoLessonKind =
  | "present"
  | "excused"
  | "unexcused"
  | "cancelled"
  | "unmarked"
  | "upcoming";

/** Последние 26 занятий пн/чт — около трёх месяцев при двух занятиях в неделю. */
export const DEMO_ALEX_PAST_LESSONS = 26;

export function collectStudySlots(
  now: Date,
  startTime: string,
  weekdays: number[] = [1, 4]
): { past: string[]; future: string[] } {
  const todayKey = appDateKey(now);
  const horizonEnd = addAppDateKey(todayKey, 56);
  const windowStart = addAppDateKey(todayKey, -140);
  const past: string[] = [];
  const future: string[] = [];
  for (
    let key = windowStart;
    key <= horizonEnd;
    key = addAppDateKey(key, 1)
  ) {
    const weekday = appZonedParts(fromAppDateTime(key, "12:00")).weekday;
    if (!weekdays.includes(weekday)) continue;
    const starts = fromAppDateTime(key, startTime);
    if (starts.getTime() <= now.getTime()) past.push(key);
    else future.push(key);
  }
  return { past: past.slice(-DEMO_ALEX_PAST_LESSONS), future };
}

/**
 * На 26 прошедших слотах: два уважительных пропуска, один неуважительный,
 * одна отмена преподавателем, одно занятие без отметки, остальные — был.
 */
export function pastLessonKinds(count: number): DemoLessonKind[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 2 || index === 15) return "excused";
    if (index === 6) return "unexcused";
    if (index === 10) return "cancelled";
    if (index === count - 4) return "unmarked";
    return "present";
  });
}

export function splitTariffDebits(debitCount: number): {
  previousUsed: number;
  previousLimit: number;
  currentUsed: number;
  currentLimit: number;
  remaining: number;
} {
  const previousUsed = Math.min(12, Math.max(0, debitCount));
  const currentUsed = Math.max(0, debitCount - previousUsed);
  const remaining = 8;
  return {
    previousUsed,
    previousLimit: previousUsed,
    currentUsed,
    currentLimit: currentUsed + remaining,
    remaining,
  };
}

export type HomeworkPattern =
  | "perfect"
  | "partial"
  | "second-fix"
  | "essay-reviewed"
  | "essay-pending"
  | "blank"
  | "draft"
  | "rework"
  | "second-draft";

export type HomeworkBlueprint = {
  id: string;
  /** Индекс в массиве прошедших занятий. Для текущих — последнее присутствие. */
  pastIndex: number;
  status:
    | "assigned"
    | "in_progress"
    | "remaining_questions"
    | "attempt1_submitted"
    | "attempt2_in_progress"
    | "completed"
    | "reviewed";
  pattern: HomeworkPattern;
  variant: 0 | 1 | 2;
  /** Неполное задание на раннем занятии: следующее занятие уже прошло. */
  overdue: boolean;
};

export const HOMEWORK_BLUEPRINT: HomeworkBlueprint[] = [
  { id: "demo_alex_hw_01", pastIndex: 0, status: "reviewed", pattern: "perfect", variant: 0, overdue: false },
  { id: "demo_alex_hw_02", pastIndex: 1, status: "reviewed", pattern: "partial", variant: 2, overdue: false },
  { id: "demo_alex_hw_03", pastIndex: 3, status: "reviewed", pattern: "second-fix", variant: 0, overdue: false },
  { id: "demo_alex_hw_04", pastIndex: 4, status: "reviewed", pattern: "essay-reviewed", variant: 1, overdue: false },
  { id: "demo_alex_hw_05", pastIndex: 5, status: "reviewed", pattern: "perfect", variant: 2, overdue: false },
  { id: "demo_alex_hw_06", pastIndex: 7, status: "assigned", pattern: "perfect", variant: 0, overdue: true },
  { id: "demo_alex_hw_07", pastIndex: 8, status: "in_progress", pattern: "draft", variant: 0, overdue: true },
  { id: "demo_alex_hw_08", pastIndex: 9, status: "reviewed", pattern: "partial", variant: 0, overdue: false },
  { id: "demo_alex_hw_09", pastIndex: 11, status: "reviewed", pattern: "second-fix", variant: 2, overdue: false },
  { id: "demo_alex_hw_10", pastIndex: 12, status: "reviewed", pattern: "perfect", variant: 2, overdue: false },
  { id: "demo_alex_hw_11", pastIndex: 13, status: "reviewed", pattern: "partial", variant: 1, overdue: false },
  { id: "demo_alex_hw_12", pastIndex: 14, status: "reviewed", pattern: "essay-reviewed", variant: 1, overdue: false },
  { id: "demo_alex_hw_13", pastIndex: 16, status: "assigned", pattern: "perfect", variant: 2, overdue: true },
  { id: "demo_alex_hw_14", pastIndex: 17, status: "reviewed", pattern: "perfect", variant: 0, overdue: false },
  { id: "demo_alex_hw_15", pastIndex: 18, status: "reviewed", pattern: "second-fix", variant: 0, overdue: false },
  { id: "demo_alex_hw_16", pastIndex: 25, status: "assigned", pattern: "perfect", variant: 0, overdue: false },
  { id: "demo_alex_hw_17", pastIndex: 25, status: "assigned", pattern: "perfect", variant: 2, overdue: false },
  { id: "demo_alex_hw_18", pastIndex: 25, status: "in_progress", pattern: "draft", variant: 0, overdue: false },
  { id: "demo_alex_hw_19", pastIndex: 25, status: "attempt1_submitted", pattern: "rework", variant: 0, overdue: false },
  { id: "demo_alex_hw_20", pastIndex: 25, status: "attempt2_in_progress", pattern: "second-draft", variant: 2, overdue: false },
  { id: "demo_alex_hw_21", pastIndex: 25, status: "remaining_questions", pattern: "blank", variant: 0, overdue: false },
  { id: "demo_alex_hw_22", pastIndex: 25, status: "completed", pattern: "essay-pending", variant: 1, overdue: false },
];

/** Оценки 1–10 для посещённых занятий, которые ученик уже отметил. Две последние явки без оценки. */
export const DEMO_ALEX_RATING_SCORES = [
  6, 8, 4, 9, 7, 5, 10, 1, 3, 9, 7, 8, 6, 10, 9, 2, 8, 7, 9,
];

export function ratingComment(score: number, topic: string): string {
  if (score >= 7) {
    return score >= 9
      ? `По ${topic.toLowerCase()} всё сложилось, темп был удобный.`
      : "";
  }
  if (score <= 3) {
    return `По теме «${topic}» объяснение шло слишком быстро, не успел записать ход решения.`;
  }
  return `На занятии по теме «${topic}» остались вопросы по разбору задачи, хочу вернуться к ней на следующей встрече.`;
}
