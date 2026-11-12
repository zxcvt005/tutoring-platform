/** Заявки с публичного лендинга (Дирекция → Заявки). */

export const SITE_LEAD_STATUSES = [
  "Новая",
  "Написали",
  "Диагностика",
  "Отказ",
  "Зачислили",
] as const;

export type SiteLeadStatus = (typeof SITE_LEAD_STATUSES)[number];

export type SiteLead = {
  id: string;
  studentName: string;
  grade: string;
  level: string;
  parentName: string;
  contact: string;
  comment: string;
  status: SiteLeadStatus;
  createdAt: string;
  updatedAt: string;
};

export function isSiteLeadStatus(value: unknown): value is SiteLeadStatus {
  return (
    typeof value === "string" &&
    (SITE_LEAD_STATUSES as readonly string[]).includes(value)
  );
}

export const SITE_LEAD_STATUS_STYLES: Record<SiteLeadStatus, string> = {
  Новая: "bg-pastel-blue text-sky-900 dark:text-sky-100 ring-1 ring-border/50",
  Написали:
    "bg-pastel-beige text-amber-950 dark:text-amber-100 ring-1 ring-border/50",
  Диагностика:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100 ring-1 ring-border/50",
  Отказ: "bg-pastel-rose text-rose-900 dark:text-rose-100 ring-1 ring-border/50",
  Зачислили:
    "bg-pastel-mint text-emerald-900 dark:text-emerald-100 ring-1 ring-border/50",
};

export function gradeLabel(grade: string): string {
  if (grade === "10") return "10 класс";
  if (grade === "11") return "11 класс";
  if (grade === "other") return "Другой";
  return grade || "—";
}
