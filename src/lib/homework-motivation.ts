export type HomeworkMotivationLevel = 1 | 2 | 3 | 4 | 5;

export type HomeworkMotivation = {
  level: HomeworkMotivationLevel | null;
  title: string;
  text: string;
  badge: string | null;
};

const LEVELS: Record<
  HomeworkMotivationLevel,
  { title: string; text: string; badge: string | null }
> = {
  1: {
    badge: "Начало пути",
    title: "Каждый шаг имеет значение",
    text: "Ты уже начал разбираться в сложных темах. Постепенно ошибки превращаются в опыт, а опыт — в результат.",
  },
  2: {
    badge: null,
    title: "Первые уверенные результаты",
    text: "Ты уже освоил значительную часть материала. Продолжай практиковаться — регулярная работа поможет двигаться дальше.",
  },
  3: {
    badge: null,
    title: "Хороший темп!",
    text: "Ты уверенно справляешься со многими заданиями. Сейчас самое время закрепить знания и разобрать оставшиеся сложные моменты.",
  },
  4: {
    badge: null,
    title: "Ты на сильном уровне",
    text: "Твои результаты показывают хорошую подготовку. Продолжай работать над сложными задачами, чтобы выйти на ещё более высокий уровень.",
  },
  5: {
    badge: null,
    title: "Отличный результат!",
    text: "Ты демонстрируешь высокий уровень подготовки. Теперь главное — сохранять стабильность и оттачивать решение самых сложных задач.",
  },
};

const NEUTRAL: HomeworkMotivation = {
  level: null,
  badge: null,
  title: "Твой прогресс начинается здесь",
  text: "Выполняй задания, и здесь постепенно будет появляться статистика твоей подготовки.",
};

/**
 * Уровень по итоговому проценту завершённых работ (`finalPercent` колец).
 * Нет достоверного среднего — нейтральное состояние, без уровня.
 */
export function homeworkMotivationLevel(
  percent: number | null | undefined
): HomeworkMotivationLevel | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  if (percent < 50) return 1;
  if (percent < 70) return 2;
  if (percent < 80) return 3;
  if (percent < 90) return 4;
  return 5;
}

export function homeworkMotivation(
  percent: number | null | undefined
): HomeworkMotivation {
  const level = homeworkMotivationLevel(percent);
  if (level == null) return NEUTRAL;
  return { level, ...LEVELS[level] };
}
