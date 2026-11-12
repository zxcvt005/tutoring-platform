/** Справочники и типы модуля «База» (Дирекция). Изолированное хранилище заявок. */

export const BASE_LEAD_SOURCES = [
  "Профи",
  "Авито",
  "Реклама",
  "Сарафан",
  "Блог",
] as const;

export type BaseLeadSource = (typeof BASE_LEAD_SOURCES)[number];

export const BASE_LEAD_STATUSES = [
  "Получен контакт",
  "Игнор",
  "Назначен пробный",
  "Проведен пробный",
  "Отказ",
  "Отказище",
  "Купил",
] as const;

export type BaseLeadStatus = (typeof BASE_LEAD_STATUSES)[number];

export type BaseLead = {
  id: string;
  /** ISO date YYYY-MM-DD — дата добавления записи */
  entryDate: string;
  source: BaseLeadSource | null;
  status: BaseLeadStatus | null;
  name: string;
  avitoUrl: string;
  contact: string;
  path1: boolean;
  path2: boolean;
  path3: boolean;
  comment: string;
  reconciliation: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isBaseLeadSource(value: unknown): value is BaseLeadSource {
  return (
    typeof value === "string" &&
    (BASE_LEAD_SOURCES as readonly string[]).includes(value)
  );
}

export function isBaseLeadStatus(value: unknown): value is BaseLeadStatus {
  return (
    typeof value === "string" &&
    (BASE_LEAD_STATUSES as readonly string[]).includes(value)
  );
}

/** Пастельные плашки статусов в стилистике «Неодин». */
export const BASE_LEAD_STATUS_STYLES: Record<BaseLeadStatus, string> = {
  "Получен контакт":
    "bg-pastel-beige text-foreground/80 ring-1 ring-border/60",
  Игнор: "bg-muted text-muted-foreground ring-1 ring-border/60",
  "Назначен пробный":
    "bg-pastel-blue text-sky-900 dark:text-sky-100 ring-1 ring-border/50",
  "Проведен пробный":
    "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100 ring-1 ring-border/50",
  Отказ: "bg-pastel-rose text-rose-900 dark:text-rose-100 ring-1 ring-border/50",
  Отказище:
    "bg-rose-600 text-white dark:bg-rose-700 ring-1 ring-rose-700/40",
  Купил:
    "bg-pastel-mint text-emerald-900 dark:text-emerald-100 ring-1 ring-border/50",
};

/** Небольшие цветные метки источников. */
export const BASE_LEAD_SOURCE_STYLES: Record<BaseLeadSource, string> = {
  Профи:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100 ring-1 ring-border/50",
  Авито:
    "bg-pastel-blue text-sky-900 dark:text-sky-100 ring-1 ring-border/50",
  Реклама:
    "bg-pastel-beige text-amber-950 dark:text-amber-100 ring-1 ring-border/50",
  Сарафан:
    "bg-pastel-mint text-emerald-900 dark:text-emerald-100 ring-1 ring-border/50",
  Блог: "bg-pastel-rose text-rose-900 dark:text-rose-100 ring-1 ring-border/50",
};

export function formatBaseLeadDateDisplay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}`;
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}
