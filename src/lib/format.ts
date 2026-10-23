import { formatInAppZone } from "@/lib/app-time";
import type {
  AttendanceStatus,
  HomeworkAssignmentStatus,
  LessonStatus,
  PersonStatus,
  TeacherStatus,
  TheoryAssignmentStatus,
  TheoryStatus,
  TopicStatus,
} from "@/lib/types";

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDateTime(iso: string): string {
  return formatInAppZone(iso, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return formatInAppZone(iso, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** «14 октября» — дата назначения без выдуманного года, если он не нужен. */
export function formatAssignedDate(iso: string): string {
  return formatInAppZone(iso, {
    day: "numeric",
    month: "long",
  });
}

export function formatTime(iso: string): string {
  return formatInAppZone(iso, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export const personStatusLabel: Record<PersonStatus, string> = {
  active: "Активный",
  paused: "На паузе",
};

export const userRoleLabel: Record<"director" | "teacher" | "student", string> =
  {
    director: "Директор",
    teacher: "Преподаватель",
    student: "Ученик",
  };

export const userAccountStatusLabel: Record<string, string> = {
  active: "Активен",
  paused: "На паузе",
  disabled: "Отключён",
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
  present: "Был",
  absent_excused: "Не был — уважительная причина",
  absent_unexcused: "Не был — неуважительная причина",
  cancelled: "Отменено преподавателем",
  rescheduled: "Перенесено",
};

/** Подпись посещаемости в истории занятий ученика */
export function lessonHistoryAttendanceLabel(input: {
  lessonStatus: LessonStatus;
  attendanceStatus?: AttendanceStatus;
  startsAt: string;
  now?: Date;
}): string {
  void input.now;
  void input.startsAt;
  if (input.lessonStatus === "cancelled") {
    return "Отменено преподавателем";
  }
  if (input.attendanceStatus === "present") return attendanceStatusLabel.present;
  if (input.attendanceStatus === "absent_excused") {
    return attendanceStatusLabel.absent_excused;
  }
  if (input.attendanceStatus === "absent_unexcused") {
    return attendanceStatusLabel.absent_unexcused;
  }
  if (input.attendanceStatus === "cancelled") {
    return attendanceStatusLabel.cancelled;
  }
  if (input.attendanceStatus === "rescheduled") {
    return attendanceStatusLabel.rescheduled;
  }
  return "Ожидает отметки";
}

export const MISSED_NEXT_LESSON_LABEL =
  "Не выполнено к следующему занятию";

export const topicStatusLabel: Record<TopicStatus, string> = {
  active: "Активная",
  archived: "Архив",
};

/** Подписи для Дирекции / Кафедры */
export const homeworkAssignmentStatusLabel: Record<
  HomeworkAssignmentStatus,
  string
> = {
  assigned: "Назначено",
  in_progress: "Черновик",
  remaining_questions: "Остались вопросы",
  attempt1_submitted: "Можно исправить",
  attempt2_in_progress: "Вторая попытка",
  completed: "На проверке",
  reviewed: "Проверено",
  overdue: "Просрочено",
};

/** Подписи для ученика (Аудитория) — статус выполнения отдельно от балла */
export const studentHomeworkStatusLabel: Record<
  HomeworkAssignmentStatus,
  string
> = {
  assigned: "Новое",
  in_progress: "Начато",
  remaining_questions: "Остались вопросы",
  attempt1_submitted: "Можно исправить",
  attempt2_in_progress: "Вторая попытка",
  completed: "Ожидает проверки",
  reviewed: "Завершено",
  overdue: "Просрочено",
};

export function studentHomeworkDisplayLabel(
  status: HomeworkAssignmentStatus,
  missedNextLesson?: boolean
): string {
  if (missedNextLesson && status !== "completed" && status !== "reviewed") {
    return MISSED_NEXT_LESSON_LABEL;
  }
  return studentHomeworkStatusLabel[status];
}

export function formatDueAt(dueAt?: string): string {
  if (!dueAt) return "Без срока";
  return formatDateTime(dueAt);
}

export const theoryStatusLabel: Record<TheoryStatus, string> = {
  draft: "Черновик",
  published: "Опубликована",
  archived: "Архив",
};

export const theoryAssignmentStatusLabel: Record<TheoryAssignmentStatus, string> =
  {
    assigned: "Новая",
    viewed: "Просмотр отмечен",
    in_progress: "Тест не завершён",
    awaiting_review: "Ожидает проверки",
    completed: "Завершена",
  };

export const weekdayShort = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;
