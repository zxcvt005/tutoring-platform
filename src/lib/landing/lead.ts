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
};

export type LandingLeadErrors = Partial<
  Record<
    "studentName" | "gradeId" | "level" | "parentName" | "contact" | "comment",
    string
  >
>;

export const LANDING_LEAD_DELIVERY = {
  connected: true as const,
  endpoint: "/api/landing/leads",
} as const;

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
  return errors;
}

export type LandingLeadSubmitResult =
  | { status: "invalid"; errors: LandingLeadErrors }
  | { status: "ok" }
  | { status: "error"; message: string };

export async function submitLandingLead(
  input: LandingLeadInput
): Promise<LandingLeadSubmitResult> {
  const errors = validateLandingLead(input);
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };

  try {
    const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
    const csrfJson = (await csrfRes.json().catch(() => null)) as {
      csrfToken?: string;
    } | null;
    const csrfToken = csrfJson?.csrfToken?.trim();
    if (!csrfRes.ok || !csrfToken) {
      return {
        status: "error",
        message: "Не удалось подготовить отправку. Обновите страницу.",
      };
    }

    const res = await fetch(LANDING_LEAD_DELIVERY.endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        studentName: input.studentName.trim(),
        gradeId: input.gradeId,
        level: input.level.trim(),
        parentName: input.parentName.trim(),
        contact: input.contact.trim(),
        comment: input.comment.trim(),
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { error?: { message?: string }; data?: unknown }
      | null;
    if (!res.ok) {
      return {
        status: "error",
        message:
          json?.error?.message?.trim() ||
          "Не удалось отправить заявку. Попробуйте ещё раз.",
      };
    }
    return { status: "ok" };
  } catch {
    return {
      status: "error",
      message: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.",
    };
  }
}
