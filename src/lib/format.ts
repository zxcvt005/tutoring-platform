import type {
  AssignmentStatus,
  AttendanceStatus,
  LessonStatus,
  PersonStatus,
  ResultStatus,
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

export const personStatusLabel: Record<PersonStatus, string> = {
  active: "Активен",
  paused: "Пауза",
};

export const lessonStatusLabel: Record<LessonStatus, string> = {
  planned: "Запланировано",
  done: "Проведено",
  cancelled: "Отменено",
};

export const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  present: "Был",
  absent: "Пропуск",
  late: "Опоздал",
  excused: "Уваж. причина",
};

export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
  closed: "Закрыто",
};

export const resultStatusLabel: Record<ResultStatus, string> = {
  pending: "Ожидает",
  submitted: "Сдано",
  graded: "Оценено",
  overdue: "Просрочено",
};
