import type { StudentAvailabilitySlot } from "@/lib/types";

/** Пн=1 … Вс=7 */
export const WEEKDAY_LABELS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Час начала слота: 7:00 … 23:00 (до 00:00). */
export const AVAILABILITY_HOURS = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;

export const MIN_AVAILABILITY_SLOTS = 3;

export function formatHourLabel(hour: number): string {
  if (hour === 24 || hour === 0) return "00.00";
  return `${hour}.00`;
}

export function slotKey(slot: StudentAvailabilitySlot): string {
  return `${slot.weekday}-${slot.hourStart}`;
}

export function parseSlotKey(key: string): StudentAvailabilitySlot | null {
  const [w, h] = key.split("-").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < 1 || w > 7 || h < 7 || h > 23) return null;
  return { weekday: w, hourStart: h };
}

export function normalizeAvailabilitySlots(
  slots: StudentAvailabilitySlot[]
): StudentAvailabilitySlot[] {
  const seen = new Set<string>();
  const out: StudentAvailabilitySlot[] = [];
  for (const slot of slots) {
    if (
      !Number.isInteger(slot.weekday) ||
      !Number.isInteger(slot.hourStart) ||
      slot.weekday < 1 ||
      slot.weekday > 7 ||
      slot.hourStart < 7 ||
      slot.hourStart > 23
    ) {
      continue;
    }
    const key = slotKey(slot);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ weekday: slot.weekday, hourStart: slot.hourStart });
  }
  out.sort((a, b) => a.weekday - b.weekday || a.hourStart - b.hourStart);
  return out;
}

/**
 * Анкета отправлена: ученик виден в общем списке.
 * `availability_pending` — legacy (до того как удобное время стало опциональным).
 */
export function isStudentListedInDirectory(
  status: string | null | undefined
): boolean {
  return (
    !status ||
    status === "complete" ||
    status === "availability_pending"
  );
}

/** @deprecated Используйте isStudentListedInDirectory для списков. */
export function isStudentFullyOnboarded(
  status: string | null | undefined
): boolean {
  return isStudentListedInDirectory(status);
}

/**
 * Куда направить ученика при незавершённой регистрации.
 * Удобное время опционально — после анкеты кабинет открыт.
 */
export function onboardingPathForStatus(
  status: string | null | undefined
): string | null {
  if (!status || status === "complete" || status === "availability_pending") {
    return null;
  }
  // invited (обычно без сессии) и profile_pending
  return "/auditoria/onboarding/profile";
}
