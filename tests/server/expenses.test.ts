import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { rnpAvitoDailyStats } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  countExpensesBySource,
  createManualExpense,
  deleteManualExpense,
  listExpenses,
  refreshAvitoExpensesFromRnp,
  refreshSalaryExpensesFromPayroll,
  updateManualExpense,
} from "@/server/services/expenses-service";
import { createTeacherPayout } from "@/server/services/teacher-payroll-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("director expenses", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("supports manual CRUD, validation, filters and totals", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const a = await createManualExpense(t.db, director, {
      category: "Сервисы",
      comment: "Zoom",
      expenseDate: "2026-08-24",
      amountRub: 3000,
    });
    await createManualExpense(t.db, director, {
      category: "Профи",
      comment: "Комиссия",
      expenseDate: "2026-08-28",
      amountRub: 5000,
    });
    await createManualExpense(t.db, director, {
      category: "Подарки",
      comment: "Подарок",
      expenseDate: "2026-09-12",
      amountRub: 2000,
    });

    await expect(
      createManualExpense(t.db, director, {
        category: "Налоги",
        expenseDate: "2026-08-01",
        amountRub: 0,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    await expect(
      createManualExpense(t.db, director, {
        category: "Налоги",
        expenseDate: "2026-13-40",
        amountRub: 100,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    const august = await listExpenses(t.db, director, {
      year: 2026,
      month: 8,
      refreshImports: false,
    });
    expect(august.expenses).toHaveLength(2);
    expect(august.totalAmountRub).toBe(8000);
    expect(august.expenses[0]!.expenseDate >= august.expenses[1]!.expenseDate).toBe(
      true
    );

    const servi = await listExpenses(t.db, director, {
      year: 2026,
      month: 8,
      category: "Сервисы",
      refreshImports: false,
    });
    expect(servi.expenses).toHaveLength(1);
    expect(servi.totalAmountRub).toBe(3000);

    const updated = await updateManualExpense(t.db, director, {
      id: a.id,
      expectedUpdatedAt: a.updatedAt,
      amountRub: 3500,
      comment: "Zoom, месяц",
    });
    expect(updated.amountRub).toBe(3500);

    await deleteManualExpense(t.db, director, { id: a.id });
    const after = await listExpenses(t.db, director, {
      year: 2026,
      month: 8,
      refreshImports: false,
    });
    expect(after.expenses).toHaveLength(1);
  });

  it("imports Avito spendings from RNP days and upserts without duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const now = new Date();

    await t.db.insert(rnpAvitoDailyStats).values({
      id: "rnp_test_1",
      organizationId: director.organizationId,
      dayDate: "2026-09-02",
      budgetSpentRub: 5000,
      impressions: 10,
      views: 4,
      contacts: 1,
      apiSyncedAt: now,
      trialsScheduled: null,
      trialsCompleted: null,
      manualUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await refreshAvitoExpensesFromRnp(t.db, director.organizationId);
    expect(await countExpensesBySource(t.db, director.organizationId, "avito")).toBe(
      1
    );

    await t.db
      .update(rnpAvitoDailyStats)
      .set({ budgetSpentRub: 5500, updatedAt: new Date() })
      .where(eq(rnpAvitoDailyStats.id, "rnp_test_1"));

    await refreshAvitoExpensesFromRnp(t.db, director.organizationId);
    expect(await countExpensesBySource(t.db, director.organizationId, "avito")).toBe(
      1
    );

    const listed = await listExpenses(t.db, director, {
      year: 2026,
      month: 9,
      category: "Авито",
      refreshImports: false,
    });
    expect(listed.expenses).toHaveLength(1);
    expect(listed.expenses[0]!.amountRub).toBe(5500);
    expect(listed.expenses[0]!.source).toBe("avito");

    await expect(
      updateManualExpense(t.db, director, {
        id: listed.expenses[0]!.id,
        expectedUpdatedAt: listed.expenses[0]!.updatedAt,
        amountRub: 1,
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      deleteManualExpense(t.db, director, { id: listed.expenses[0]!.id })
    ).rejects.toMatchObject({ code: "forbidden" });

    // Clearing budget removes auto expense; does not touch manual.
    await createManualExpense(t.db, director, {
      category: "Авито",
      comment: "Ручная доплата",
      expenseDate: "2026-09-03",
      amountRub: 100,
    });
    await t.db
      .update(rnpAvitoDailyStats)
      .set({ budgetSpentRub: null, updatedAt: new Date() })
      .where(eq(rnpAvitoDailyStats.id, "rnp_test_1"));
    await refreshAvitoExpensesFromRnp(t.db, director.organizationId);
    expect(await countExpensesBySource(t.db, director.organizationId, "avito")).toBe(
      0
    );
    expect(
      await countExpensesBySource(t.db, director.organizationId, "manual")
    ).toBe(1);
  });

  it("imports payroll payouts and does not duplicate on refresh", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    await createTeacherPayout(t.db, director, {
      teacherId: "t1",
      amountKopecks: 50_000,
      occurredAt: "2026-09-15T12:00:00.000Z",
      comment: "Аванс",
      idempotencyKey: "exp-pay-1",
    });

    await refreshSalaryExpensesFromPayroll(t.db, director.organizationId);
    await refreshSalaryExpensesFromPayroll(t.db, director.organizationId);
    expect(
      await countExpensesBySource(t.db, director.organizationId, "salary")
    ).toBe(1);

    const listed = await listExpenses(t.db, director, {
      year: 2026,
      month: 9,
      category: "Зарплата",
      refreshImports: false,
    });
    expect(listed.expenses).toHaveLength(1);
    expect(listed.expenses[0]!.amountRub).toBe(500);
    expect(listed.expenses[0]!.source).toBe("salary");
    expect(listed.expenses[0]!.comment).toContain("Выплата:");
  });

  it("forbids non-directors", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      listExpenses(t.db, student, { refreshImports: false })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createManualExpense(t.db, student, {
        category: "Подарки",
        amountRub: 100,
        expenseDate: "2026-09-01",
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
