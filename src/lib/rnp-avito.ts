/** РНП Авито — помесячная рекламная аналитика (Дирекция). Изолированный модуль. */

export type RnpAvitoDayStats = {
  /** YYYY-MM-DD */
  date: string;
  /** API: открученный бюджет, целые рубли */
  budgetSpentRub: number | null;
  /** API: показы */
  impressions: number | null;
  /** API: просмотры */
  views: number | null;
  /** API: контакты */
  contacts: number | null;
  /** Ручные */
  trialsScheduled: number | null;
  trialsCompleted: number | null;
  /** ISO; null если строки ещё нет в БД */
  manualUpdatedAt: string | null;
  apiSyncedAt: string | null;
};

/** Безопасная диагностика Avito env: только флаги, без секретов. */
export type AvitoEnvStatus = {
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasUserId: boolean;
  userIdIsNumeric: boolean;
  missingKeys: string[];
};

export type RnpAvitoMonthPayload = {
  year: number;
  month: number;
  /** Дней в месяце */
  daysInMonth: number;
  days: RnpAvitoDayStats[];
  /** Заданы ли AVITO_* переменные на сервере */
  apiConnected: boolean;
  /** Какие ключи видны процессу (без значений) */
  avitoEnv: AvitoEnvStatus;
  /** ISO последней успешной синхронизации API-полей за месяц (max apiSyncedAt) */
  lastSyncedAt: string | null;
};

export type RnpAvitoMetricKey =
  | "budgetSpentRub"
  | "impressions"
  | "views"
  | "contacts"
  | "trialsScheduled"
  | "trialsCompleted";

export type RnpAvitoDerivedKey =
  | "costPerTrial"
  | "impressionsToViews"
  | "viewsToContacts"
  | "contactsToTrials";

export const RNP_AVITO_API_METRICS: {
  key: RnpAvitoMetricKey;
  label: string;
}[] = [
  { key: "budgetSpentRub", label: "Открученный бюджет" },
  { key: "impressions", label: "Количество показов" },
  { key: "views", label: "Количество просмотров" },
  { key: "contacts", label: "Количество контактов" },
];

export const RNP_AVITO_MANUAL_METRICS: {
  key: RnpAvitoMetricKey;
  label: string;
}[] = [
  { key: "trialsScheduled", label: "Количество назначенных пробных" },
  { key: "trialsCompleted", label: "Количество проведённых пробных" },
];

export const RNP_AVITO_DERIVED_METRICS: {
  key: RnpAvitoDerivedKey;
  label: string;
  kind: "money" | "percent";
}[] = [
  { key: "costPerTrial", label: "Стоимость пробного урока", kind: "money" },
  { key: "impressionsToViews", label: "Показы → просмотр", kind: "percent" },
  { key: "viewsToContacts", label: "Просмотр → контакт", kind: "percent" },
  {
    key: "contactsToTrials",
    label: "Контакт → проведённое пробное",
    kind: "percent",
  },
];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDayHeader(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function formatMonthTitle(year: number, month: number): string {
  return `${MONTH_NAMES_RU[month - 1]} ${year}`;
}

export function emptyDayStats(date: string): RnpAvitoDayStats {
  return {
    date,
    budgetSpentRub: null,
    impressions: null,
    views: null,
    contacts: null,
    trialsScheduled: null,
    trialsCompleted: null,
    manualUpdatedAt: null,
    apiSyncedAt: null,
  };
}

export function buildMonthDayShell(
  year: number,
  month: number
): RnpAvitoDayStats[] {
  const n = daysInMonth(year, month);
  const days: RnpAvitoDayStats[] = [];
  for (let d = 1; d <= n; d++) {
    days.push(emptyDayStats(isoDate(year, month, d)));
  }
  return days;
}

export function sumMetric(
  days: RnpAvitoDayStats[],
  key: RnpAvitoMetricKey
): number | null {
  let sum = 0;
  let any = false;
  for (const day of days) {
    const v = day[key];
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function safePercent(num: number | null, den: number | null): number | null {
  const ratio = safeDiv(num, den);
  if (ratio == null) return null;
  return ratio * 100;
}

export type RnpAvitoDerivedValues = Record<RnpAvitoDerivedKey, number | null>;

/** Расчёты по итогам (месяц или один день — одинаковые формулы). */
export function computeRnpAvitoDerived(
  totals: Record<RnpAvitoMetricKey, number | null>
): RnpAvitoDerivedValues {
  return {
    costPerTrial: safeDiv(totals.budgetSpentRub, totals.trialsCompleted),
    impressionsToViews: safePercent(totals.views, totals.impressions),
    viewsToContacts: safePercent(totals.contacts, totals.views),
    contactsToTrials: safePercent(totals.trialsCompleted, totals.contacts),
  };
}

export function totalsFromDays(
  days: RnpAvitoDayStats[]
): Record<RnpAvitoMetricKey, number | null> {
  return {
    budgetSpentRub: sumMetric(days, "budgetSpentRub"),
    impressions: sumMetric(days, "impressions"),
    views: sumMetric(days, "views"),
    contacts: sumMetric(days, "contacts"),
    trialsScheduled: sumMetric(days, "trialsScheduled"),
    trialsCompleted: sumMetric(days, "trialsCompleted"),
  };
}

export function derivedForDay(day: RnpAvitoDayStats): RnpAvitoDerivedValues {
  return computeRnpAvitoDerived({
    budgetSpentRub: day.budgetSpentRub,
    impressions: day.impressions,
    views: day.views,
    contacts: day.contacts,
    trialsScheduled: day.trialsScheduled,
    trialsCompleted: day.trialsCompleted,
  });
}

export function formatRnpNumber(
  value: number | null,
  kind: "int" | "money" | "percent"
): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (kind === "percent") {
    const rounded = Math.round(value * 10) / 10;
    return `${rounded.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
  }
  if (kind === "money") {
    const rounded = Math.round(value);
    return `${rounded.toLocaleString("ru-RU")} ₽`;
  }
  return Math.round(value).toLocaleString("ru-RU");
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
