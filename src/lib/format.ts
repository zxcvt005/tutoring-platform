import type {
  AttendanceStatus,
  HomeworkAssignmentStatus,
  LessonStatus,
  PersonStatus,
  TeacherStatus,
  TopicStatus,
} from "@/lib/types";

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export const personStatusLabel: Record<PersonStatus, string> = {
  active: "Активен",
  paused: "Пауза",
};

export const teacherStatusLabel: Record<TeacherStatus, string> = {
  active: "Активен",
  inactive: "Временно не работает",
  archived: "Архивный",
};

export const lessonStatusLabel: Record<LessonStatus, string> = {
  planned: "Запланировано",
  done: "Проведено",
  cancelled: "Отменено",
};

export const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  present: "Присутствовал",
  absent: "Отсутствовал",
  cancelled: "Отменено",
  rescheduled: "Перенесено",
};

export const topicStatusLabel: Record<TopicStatus, string> = {
  active: "Активна",
  archived: "В архиве",
};

/** Подписи для Дирекции / Кафедры */
export const homeworkAssignmentStatusLabel: Record<
  HomeworkAssignmentStatus,
  string
> = {
  assigned: "Назначено",
  completed: "Выполнено",
  reviewed: "Проверено",
  overdue: "Просрочено",
};

/** Подписи для ученика (Аудитория) — статус выполнения отдельно от балла */
export const studentHomeworkStatusLabel: Record<
  HomeworkAssignmentStatus,
  string
> = {
  assigned: "Нужно выполнить",
  completed: "На проверке",
  reviewed: "Проверено",
  overdue: "Просрочено",
};

export const weekdayShort = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;
