/**
 * Безопасные ссылки и нормализация контактов ученика.
 */

export const STUDENT_GRADES = ["8", "9", "10", "11"] as const;

export function gradeLabel(grade?: string | null): string {
  if (!grade) return "Не указан";
  return `${grade} класс`;
}

/** Username или ссылка → безопасный https://t.me/... или null. */
export function telegramHref(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower.startsWith("https://t.me/") || lower.startsWith("http://t.me/")) {
    try {
      const url = new URL(value);
      if (url.hostname !== "t.me" && url.hostname !== "www.t.me") return null;
      const path = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (!/^[a-zA-Z0-9_]{5,32}$/.test(path)) return null;
      return `https://t.me/${path}`;
    } catch {
      return null;
    }
  }

  const user = value.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(user)) return null;
  return `https://t.me/${user}`;
}

export function telegramDisplay(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const href = telegramHref(raw);
  if (href) {
    const user = href.replace("https://t.me/", "");
    return `@${user}`;
  }
  return raw.trim();
}

export function phoneHref(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 10) return null;
  return `tel:${digits}`;
}

export function normalizeGrade(
  value: unknown
): "8" | "9" | "10" | "11" | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (s === "8" || s === "9" || s === "10" || s === "11") return s;
  return null;
}
