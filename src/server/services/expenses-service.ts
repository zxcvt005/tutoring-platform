import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  type Expense,
  type ExpenseCategory,
  type ExpensesListPayload,
  computeExpenseTotals,
  isExpenseCategory,
  moscowCalendarDate,
  todayIsoDate,
} from "@/lib/expenses";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  directorExpenses,
  rnpAvitoDailyStats,
  teacherPayrollEntries,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, forbidden, notFound, validationError } from "@/server/errors";

const MAX_COMMENT = 4000;
const MAX_AMOUNT = 1_000_000_000;

function newId() {
  return `exp_${randomBytes(6).toString("hex")}`;
}

function toExpense(row: typeof directorExpenses.$inferSelect): Expense {
  if (!isExpenseCategory(row.category)) {
    throw new Error(`Некорректная категория расхода: ${row.category}`);
  }
  if (
    row.source !== "manual" &&
    row.source !== "avito" &&
    row.source !== "salary"
  ) {
    throw new Error(`Некорректный источник расхода: ${row.source}`);
  }
  return {
    id: row.id,
    category: row.category,
    comment: row.comment,
    expenseDate: row.expenseDate,
    amountRub: row.amountRub,
    source: row.source,
    externalId: row.externalId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseExpenseDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw validationError("Дата должна быть в формате ГГГГ-ММ-ДД");
  }
  const iso = value.trim();
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw validationError("Некорректная дата");
  }
  return iso;
}

function parseAmountRub(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/\s/g, "").replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw validationError("Сумма: укажите целое число рублей");
  }
  if (n <= 0) {
    throw validationError("Сумма должна быть положительной");
  }
  if (n > MAX_AMOUNT) {
    throw validationError("Сумма: слишком большое значение");
  }
  return n;
}

function parseCategory(value: unknown): ExpenseCategory {
  if (!isExpenseCategory(value)) {
    throw validationError("Недопустимая статья расхода");
  }
  return value;
}

function sanitizeComment(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw validationError("Комментарий: ожидается текст");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_COMMENT) {
    throw validationError("Комментарий: слишком длинное значение");
  }
  return trimmed;
}

function sameInstant(a: Date, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return a.getTime() === t;
}

function parseYearMonthFilter(input: {
  year?: unknown;
  month?: unknown;
}): { year: number | null; month: number | null; from?: string; to?: string } {
  const hasYear = input.year != null && input.year !== "";
  const hasMonth = input.month != null && input.month !== "";
  if (!hasYear && !hasMonth) {
    return { year: null, month: null };
  }
  if (!hasYear || !hasMonth) {
    throw validationError("Укажите и год, и месяц фильтра");
  }
  const y = Number(input.year);
  const m = Number(input.month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw validationError("Некорректный год");
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw validationError("Некорректный месяц");
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year: y,
    month: m,
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay)}`,
  };
}

function formatAvitoComment(dayDate: string): string {
  const [y, mo, d] = dayDate.split("-");
  return `Реклама Авито · ${d}.${mo}.${y}`;
}

/**
 * Подтянуть дневные расходы Avito из rnp_avito_daily_stats (без вызова Avito API).
 * Обновляет суммы; удаляет автозаписи дней без положительного бюджета.
 */
export async function refreshAvitoExpensesFromRnp(
  db: AppDb,
  organizationId: string
): Promise<void> {
  const days = await db
    .select({
      dayDate: rnpAvitoDailyStats.dayDate,
      budgetSpentRub: rnpAvitoDailyStats.budgetSpentRub,
    })
    .from(rnpAvitoDailyStats)
    .where(eq(rnpAvitoDailyStats.organizationId, organizationId));

  const positive = days.filter(
    (d) => d.budgetSpentRub != null && d.budgetSpentRub > 0
  );
  const keepIds = new Set(positive.map((d) => d.dayDate));
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const day of positive) {
      const amount = day.budgetSpentRub!;
      await tx
        .insert(directorExpenses)
        .values({
          id: newId(),
          organizationId,
          category: "Авито",
          comment: formatAvitoComment(day.dayDate),
          expenseDate: day.dayDate,
          amountRub: amount,
          source: "avito",
          externalId: day.dayDate,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            directorExpenses.organizationId,
            directorExpenses.source,
            directorExpenses.externalId,
          ],
          set: {
            category: "Авито",
            comment: formatAvitoComment(day.dayDate),
            expenseDate: day.dayDate,
            amountRub: amount,
            updatedAt: now,
          },
        });
    }

    const existing = await tx
      .select({
        id: directorExpenses.id,
        externalId: directorExpenses.externalId,
      })
      .from(directorExpenses)
      .where(
        and(
          eq(directorExpenses.organizationId, organizationId),
          eq(directorExpenses.source, "avito")
        )
      );

    const staleIds = existing
      .filter((r) => !r.externalId || !keepIds.has(r.externalId))
      .map((r) => r.id);
    for (const id of staleIds) {
      await tx.delete(directorExpenses).where(eq(directorExpenses.id, id));
    }
  });
}

/**
 * Подтянуть фактические выплаты из teacher_payroll_entries (entry_type = payout).
 */
export async function refreshSalaryExpensesFromPayroll(
  db: AppDb,
  organizationId: string
): Promise<void> {
  const rows = await db
    .select({
      id: teacherPayrollEntries.id,
      amountKopecks: teacherPayrollEntries.amountKopecks,
      occurredAt: teacherPayrollEntries.occurredAt,
      comment: teacherPayrollEntries.comment,
      teacherName: teachers.fullName,
    })
    .from(teacherPayrollEntries)
    .innerJoin(teachers, eq(teachers.id, teacherPayrollEntries.teacherId))
    .where(
      and(
        eq(teacherPayrollEntries.organizationId, organizationId),
        eq(teacherPayrollEntries.entryType, "payout")
      )
    );

  const keepIds = new Set(rows.map((r) => r.id));
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const amountRub = Math.round(row.amountKopecks / 100);
      if (amountRub <= 0) continue;
      const expenseDate = moscowCalendarDate(row.occurredAt);
      const commentParts = [`Выплата: ${row.teacherName}`];
      if (row.comment?.trim()) commentParts.push(row.comment.trim());
      const comment = commentParts.join(" · ").slice(0, MAX_COMMENT);

      await tx
        .insert(directorExpenses)
        .values({
          id: newId(),
          organizationId,
          category: "Зарплата",
          comment,
          expenseDate,
          amountRub,
          source: "salary",
          externalId: row.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            directorExpenses.organizationId,
            directorExpenses.source,
            directorExpenses.externalId,
          ],
          set: {
            category: "Зарплата",
            comment,
            expenseDate,
            amountRub,
            updatedAt: now,
          },
        });
    }

    const existing = await tx
      .select({
        id: directorExpenses.id,
        externalId: directorExpenses.externalId,
      })
      .from(directorExpenses)
      .where(
        and(
          eq(directorExpenses.organizationId, organizationId),
          eq(directorExpenses.source, "salary")
        )
      );

    for (const row of existing) {
      if (row.externalId && keepIds.has(row.externalId)) continue;
      await tx.delete(directorExpenses).where(eq(directorExpenses.id, row.id));
    }
  });
}

export type ListExpensesInput = {
  year?: number | null;
  month?: number | null;
  category?: ExpenseCategory | null | "";
  /** Skip auto-refresh (tests). Default true. */
  refreshImports?: boolean;
};

export async function listExpenses(
  db: AppDb,
  ctx: AuthContext,
  input: ListExpensesInput = {}
): Promise<ExpensesListPayload> {
  requireRoles(ctx, ["director"]);
  const period = parseYearMonthFilter(input);
  const categoryFilter =
    input.category == null || input.category === ""
      ? null
      : parseCategory(input.category);

  if (input.refreshImports !== false) {
    await refreshAvitoExpensesFromRnp(db, ctx.organizationId);
    await refreshSalaryExpensesFromPayroll(db, ctx.organizationId);
  }

  const conditions = [eq(directorExpenses.organizationId, ctx.organizationId)];
  if (period.from && period.to) {
    conditions.push(gte(directorExpenses.expenseDate, period.from));
    conditions.push(lte(directorExpenses.expenseDate, period.to));
  }
  if (categoryFilter) {
    conditions.push(eq(directorExpenses.category, categoryFilter));
  }

  const rows = await db
    .select()
    .from(directorExpenses)
    .where(and(...conditions))
    .orderBy(
      desc(directorExpenses.expenseDate),
      desc(directorExpenses.createdAt),
      asc(directorExpenses.id)
    );

  const expenses = rows.map(toExpense);
  const totals = computeExpenseTotals(expenses);
  return {
    expenses,
    totalAmountRub: totals.totalAmountRub,
    categoryTotals: totals.categoryTotals,
    year: period.year,
    month: period.month,
    category: categoryFilter,
  };
}

export async function createManualExpense(
  db: AppDb,
  ctx: AuthContext,
  input: {
    category: unknown;
    comment?: unknown;
    expenseDate?: unknown;
    amountRub: unknown;
  }
): Promise<Expense> {
  requireRoles(ctx, ["director"]);
  const category = parseCategory(input.category);
  const comment = sanitizeComment(input.comment);
  const expenseDate =
    input.expenseDate == null || input.expenseDate === ""
      ? todayIsoDate()
      : parseExpenseDate(input.expenseDate);
  const amountRub = parseAmountRub(input.amountRub);
  const now = new Date();
  const id = newId();

  await db.insert(directorExpenses).values({
    id,
    organizationId: ctx.organizationId,
    category,
    comment,
    expenseDate,
    amountRub,
    source: "manual",
    externalId: null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db
    .select()
    .from(directorExpenses)
    .where(eq(directorExpenses.id, id))
    .limit(1);
  if (!row) throw new Error("Не удалось создать расход");
  return toExpense(row);
}

export type UpdateManualExpenseInput = {
  id: string;
  expectedUpdatedAt: string;
  category?: unknown;
  comment?: unknown;
  expenseDate?: unknown;
  amountRub?: unknown;
};

export async function updateManualExpense(
  db: AppDb,
  ctx: AuthContext,
  input: UpdateManualExpenseInput
): Promise<Expense> {
  requireRoles(ctx, ["director"]);
  if (typeof input.id !== "string" || !input.id.trim()) {
    throw validationError("Некорректный идентификатор");
  }

  const [existing] = await db
    .select()
    .from(directorExpenses)
    .where(
      and(
        eq(directorExpenses.id, input.id.trim()),
        eq(directorExpenses.organizationId, ctx.organizationId)
      )
    )
    .limit(1);

  if (!existing) throw notFound("Расход не найден");
  if (existing.source !== "manual") {
    throw forbidden("Автоматические расходы нельзя изменять вручную");
  }
  if (
    !input.expectedUpdatedAt ||
    !sameInstant(existing.updatedAt, input.expectedUpdatedAt)
  ) {
    throw conflict(
      "Запись уже изменена. Обновите данные и повторите сохранение."
    );
  }

  const patch: Partial<typeof directorExpenses.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.category !== undefined) {
    patch.category = parseCategory(input.category);
  }
  if (input.comment !== undefined) {
    patch.comment = sanitizeComment(input.comment);
  }
  if (input.expenseDate !== undefined) {
    patch.expenseDate = parseExpenseDate(input.expenseDate);
  }
  if (input.amountRub !== undefined) {
    patch.amountRub = parseAmountRub(input.amountRub);
  }

  if (
    patch.category === undefined &&
    patch.comment === undefined &&
    patch.expenseDate === undefined &&
    patch.amountRub === undefined
  ) {
    throw validationError("Нет полей для сохранения");
  }

  await db
    .update(directorExpenses)
    .set(patch)
    .where(eq(directorExpenses.id, existing.id));

  const [row] = await db
    .select()
    .from(directorExpenses)
    .where(eq(directorExpenses.id, existing.id))
    .limit(1);
  if (!row) throw new Error("Не удалось сохранить расход");
  return toExpense(row);
}

export async function deleteManualExpense(
  db: AppDb,
  ctx: AuthContext,
  input: { id: string }
): Promise<void> {
  requireRoles(ctx, ["director"]);
  if (typeof input.id !== "string" || !input.id.trim()) {
    throw validationError("Некорректный идентификатор");
  }
  const [existing] = await db
    .select()
    .from(directorExpenses)
    .where(
      and(
        eq(directorExpenses.id, input.id.trim()),
        eq(directorExpenses.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Расход не найден");
  if (existing.source !== "manual") {
    throw forbidden("Автоматические расходы нельзя удалять");
  }
  await db.delete(directorExpenses).where(eq(directorExpenses.id, existing.id));
}

/** Test helper: count auto rows without refresh side effects. */
export async function countExpensesBySource(
  db: AppDb,
  organizationId: string,
  source: "manual" | "avito" | "salary"
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(directorExpenses)
    .where(
      and(
        eq(directorExpenses.organizationId, organizationId),
        eq(directorExpenses.source, source)
      )
    );
  return Number(row?.n ?? 0);
}
