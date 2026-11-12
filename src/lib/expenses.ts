/** Модуль «Расходы» (Дирекция). Изолированный учёт, без связей с CRM. */

export const EXPENSE_CATEGORIES = [
  "Авито",
  "Профи",
  "Зарплата",
  "Сервисы",
  "Налоги",
  "Подарки",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_SOURCES = ["manual", "avito", "salary"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export type Expense = {
  id: string;
  category: ExpenseCategory;
  comment: string;
  /** Календарная дата YYYY-MM-DD */
  expenseDate: string;
  amountRub: number;
  source: ExpenseSource;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseCategoryTotal = {
  category: ExpenseCategory;
  amountRub: number;
};

export type ExpensesListPayload = {
  expenses: Expense[];
  totalAmountRub: number;
  categoryTotals: ExpenseCategoryTotal[];
  year: number | null;
  month: number | null;
  category: ExpenseCategory | null;
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isExpenseSource(value: unknown): value is ExpenseSource {
  return (
    typeof value === "string" &&
    (EXPENSE_SOURCES as readonly string[]).includes(value)
  );
}

/** Пастельные метки категорий в стиле «Неодин». */
export const EXPENSE_CATEGORY_STYLES: Record<ExpenseCategory, string> = {
  Авито:
    "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 ring-1 ring-border/50",
  Профи:
    "bg-pastel-blue text-sky-900 dark:text-sky-100 ring-1 ring-border/50",
  Зарплата:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100 ring-1 ring-border/50",
  Сервисы:
    "bg-orange-100 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100 ring-1 ring-border/50",
  Налоги:
    "bg-pastel-mint text-emerald-900 dark:text-emerald-100 ring-1 ring-border/50",
  Подарки:
    "bg-pastel-rose text-rose-900 dark:text-rose-100 ring-1 ring-border/50",
};

export function formatExpenseDateDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

export function formatExpenseAmountRub(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const n = Math.round(amount);
  return `${n.toLocaleString("ru-RU")} ₽`;
}

export function emptyCategoryTotals(): ExpenseCategoryTotal[] {
  return EXPENSE_CATEGORIES.map((category) => ({
    category,
    amountRub: 0,
  }));
}

export function computeExpenseTotals(expenses: Expense[]): {
  totalAmountRub: number;
  categoryTotals: ExpenseCategoryTotal[];
} {
  const map = new Map<ExpenseCategory, number>(
    EXPENSE_CATEGORIES.map((c) => [c, 0])
  );
  let total = 0;
  for (const e of expenses) {
    total += e.amountRub;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amountRub);
  }
  return {
    totalAmountRub: total,
    categoryTotals: EXPENSE_CATEGORIES.map((category) => ({
      category,
      amountRub: map.get(category) ?? 0,
    })),
  };
}

export function isAutoExpenseSource(source: ExpenseSource): boolean {
  return source === "avito" || source === "salary";
}

/** Календарная дата Europe/Moscow без UTC-сдвига. */
export function moscowCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayIsoDate(now = new Date()): string {
  return moscowCalendarDate(now);
}
