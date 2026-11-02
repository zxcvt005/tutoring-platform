import { tariffById } from "@/lib/landing/content";

export const LANDING_GRADES = [
  { id: "10", label: "10 класс" },
  { id: "11", label: "11 класс" },
  { id: "other", label: "Другой" },
] as const;

export type LandingGradeId = (typeof LANDING_GRADES)[number]["id"];

export type LandingLeadInput = {
  studentName: string;
  gradeId: string;
  level: string;
  parentName: string;
  contact: string;
  comment: string;
  tariffId: string;
};

export type LandingLeadErrors = Partial<
  Record<"studentName" | "gradeId" | "level" | "parentName" | "contact" | "comment" | "tariffId", string>
>;

/**
 * Публичного приёма заявок в проекте нет.
 * Регистрация ученика создаёт аккаунт и не является заявкой на диагностику.
 * Пробный урок в кабинете «Пресса» требует сотрудника, преподавателя и слот.
 */
export const LANDING_LEAD_DELIVERY = {
  connected: false as const,
  reason:
    "В проекте нет API и хранилища заявок с публичного сайта. Форма проверяет поля и ничего не сохраняет.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s\-()]{9,}$/;
const TELEGRAM = /^@?[a-zA-Z0-9_]{5,32}$/;

export function isValidLandingContact(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 120) return false;
  const compactPhone = trimmed.replace(/[\s()-]/g, "");
  return (
    EMAIL.test(trimmed) ||
    PHONE.test(trimmed) ||
    PHONE.test(compactPhone) ||
    TELEGRAM.test(trimmed)
  );
}

export function isLandingGradeId(value: string): value is LandingGradeId {
  return LANDING_GRADES.some((item) => item.id === value);
}

export function validateLandingStudentStep(
  input: Pick<LandingLeadInput, "studentName" | "gradeId" | "level">
): LandingLeadErrors {
  const errors: LandingLeadErrors = {};
  if (input.studentName.trim().length < 2) {
    errors.studentName = "Укажите имя ученика — минимум два символа.";
  } else if (input.studentName.trim().length > 80) {
    errors.studentName = "Имя ученика слишком длинное.";
  }
  if (!isLandingGradeId(input.gradeId)) {
    errors.gradeId = "Выберите класс.";
  }
  if (input.level.trim().length > 120) {
    errors.level = "Опишите уровень короче.";
  }
  return errors;
}

export function validateLandingLead(input: LandingLeadInput): LandingLeadErrors {
  const errors: LandingLeadErrors = validateLandingStudentStep(input);
  if (input.parentName.trim().length < 2) {
    errors.parentName = "Укажите имя родителя — минимум два символа.";
  } else if (input.parentName.trim().length > 80) {
    errors.parentName = "Имя родителя слишком длинное.";
  }
  if (!isValidLandingContact(input.contact)) {
    errors.contact = "Укажите телефон, email или Telegram.";
  }
  if (input.comment.trim().length > 500) {
    errors.comment = "Комментарий слишком длинный.";
  }
  if (input.tariffId && !tariffById(input.tariffId)) {
    errors.tariffId = "Такой формат на сайте не опубликован.";
  }
  return errors;
}

export type LandingLeadResult =
  | { status: "invalid"; errors: LandingLeadErrors }
  | { status: "not_delivered" };

/** Не создаёт заявку. Успешная отправка здесь невозможна, пока нет приёма. */
export function submitLandingLead(input: LandingLeadInput): LandingLeadResult {
  const errors = validateLandingLead(input);
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };
  return { status: "not_delivered" };
}
