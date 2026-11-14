/**
 * Справочники и типы модуля «Пробные уроки» (Дирекция).
 * Изолированное хранилище: не связано с «Базой», учениками и расписанием.
 */

import {
  BASE_LEAD_SOURCES,
  BASE_LEAD_SOURCE_STYLES,
  type BaseLeadSource,
  isBaseLeadSource,
  todayIsoDate,
} from "@/lib/base-leads";

/** Те же варианты источника, что и в «Базе». */
export const MANUAL_TRIAL_SOURCES = BASE_LEAD_SOURCES;
export type ManualTrialSource = BaseLeadSource;
export const MANUAL_TRIAL_SOURCE_STYLES = BASE_LEAD_SOURCE_STYLES;
export const isManualTrialSource = isBaseLeadSource;
export { todayIsoDate };

export type ManualTrialLesson = {
  id: string;
  /** ISO date YYYY-MM-DD */
  lessonDate: string;
  /** HH:MM */
  lessonTime: string;
  source: ManualTrialSource | null;
  name: string;
  contact: string;
  /** Пустая строка, если не заполнено (в БД null) */
  teacher: string;
  attended: boolean;
  purchased: boolean;
  /** null — не заполнено */
  hoursPerWeek: number | null;
  /** Ставка в целых рублях; null — не заполнено */
  ratePerHourRub: number | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
};

/** Сумма = часов/нед × ставка × 4; null если нет данных. */
export function computeManualTrialSumRub(
  hoursPerWeek: number | null | undefined,
  ratePerHourRub: number | null | undefined
): number | null {
  if (
    hoursPerWeek == null ||
    ratePerHourRub == null ||
    !Number.isFinite(hoursPerWeek) ||
    !Number.isFinite(ratePerHourRub)
  ) {
    return null;
  }
  if (hoursPerWeek < 0 || ratePerHourRub < 0) return null;
  return hoursPerWeek * ratePerHourRub * 4;
}

export function formatManualTrialSumRub(sum: number | null): string {
  if (sum == null) return "";
  return `${sum.toLocaleString("ru-RU")} ₽`;
}

export function defaultManualTrialTime(now = new Date()): string {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
