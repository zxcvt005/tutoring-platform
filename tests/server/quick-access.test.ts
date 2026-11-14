import { afterEach, describe, expect, it } from "vitest";

import { QUICK_ACCESS_TYPES } from "@/lib/quick-access";
import { resolveAuthContext } from "@/server/authz/context";
import { quickAccessLinks } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  createBaseLead,
  listBaseLeads,
  updateBaseLead,
  deleteBaseLead,
} from "@/server/services/base-leads-service";
import {
  createManualExpense,
  deleteManualExpense,
  listExpenses,
} from "@/server/services/expenses-service";
import {
  createManualTrialLesson,
  deleteManualTrialLesson,
  listManualTrialLessons,
} from "@/server/services/manual-trial-lessons-service";
import {
  getRnpAvitoMonth,
  upsertRnpAvitoManualDay,
} from "@/server/services/rnp-avito-service";
import {
  assertQuickAccessActionAllowed,
  createQuickAccessLink,
  createQuickAccessToken,
  disableQuickAccessLink,
  hashQuickAccessToken,
  listQuickAccessLinks,
  reissueQuickAccessLink,
  resolveQuickAccessToken,
} from "@/server/services/quick-access-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("quick access links", () => {
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

  it("creates hashed tokens and lists status without exposing plaintext", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const issued = await createQuickAccessLink(t.db, director, "baza");
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    expect(issued.path).toBe(`/quick-access/baza/${issued.token}`);
    expect(issued.enabled).toBe(true);

    const [row] = await t.db.select().from(quickAccessLinks);
    expect(row?.tokenHash).toBe(hashQuickAccessToken(issued.token));
    expect(row?.tokenHash).not.toBe(issued.token);
    expect(row?.accessType).toBe("baza");
    expect(row?.organizationId).toBe(director.organizationId);

    const listed = await listQuickAccessLinks(t.db, director);
    expect(listed).toHaveLength(QUICK_ACCESS_TYPES.length);
    const baza = listed.find((l) => l.accessType === "baza");
    expect(baza?.exists).toBe(true);
    expect(baza?.enabled).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(issued.token);
  });

  it("rejects invalid, disabled and wrong-table tokens", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const issued = await createQuickAccessLink(t.db, director, "baza");

    await expect(
      resolveQuickAccessToken(t.db, "totally-invalid-token-value-xxxxxx", "baza")
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      resolveQuickAccessToken(t.db, issued.token, "rashody")
    ).rejects.toMatchObject({ status: 403 });

    await disableQuickAccessLink(t.db, director, "baza");
    await expect(
      resolveQuickAccessToken(t.db, issued.token, "baza")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("reissues token and invalidates the previous one", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const first = await createQuickAccessLink(t.db, director, "probnye-uroki");
    const second = await reissueQuickAccessLink(
      t.db,
      director,
      "probnye-uroki"
    );
    expect(second.token).not.toBe(first.token);

    await expect(
      resolveQuickAccessToken(t.db, first.token, "probnye-uroki")
    ).rejects.toMatchObject({ status: 401 });

    const resolved = await resolveQuickAccessToken(
      t.db,
      second.token,
      "probnye-uroki"
    );
    expect(resolved.organizationId).toBe(director.organizationId);
    expect(resolved.accessType).toBe("probnye-uroki");
    expect(resolved.ctx.role).toBe("director");
  });

  it("scopes CRUD to org via resolved context without session login", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const bazaLink = await createQuickAccessLink(t.db, director, "baza");
    const trialsLink = await createQuickAccessLink(
      t.db,
      director,
      "probnye-uroki"
    );
    const rnpLink = await createQuickAccessLink(t.db, director, "rnp-avito");
    const expensesLink = await createQuickAccessLink(
      t.db,
      director,
      "rashody"
    );

    const bazaCtx = (
      await resolveQuickAccessToken(t.db, bazaLink.token, "baza")
    ).ctx;
    const trialCtx = (
      await resolveQuickAccessToken(t.db, trialsLink.token, "probnye-uroki")
    ).ctx;
    const rnpCtx = (
      await resolveQuickAccessToken(t.db, rnpLink.token, "rnp-avito")
    ).ctx;
    const expCtx = (
      await resolveQuickAccessToken(t.db, expensesLink.token, "rashody")
    ).ctx;

    // База
    const lead = await createBaseLead(t.db, bazaCtx);
    expect(lead.student).toBe("");
    expect(lead.parent).toBe("");
    expect(lead.teacher).toBe("");
    const updatedLead = await updateBaseLead(t.db, bazaCtx, {
      id: lead.id,
      expectedUpdatedAt: lead.updatedAt,
      name: "QA Lead",
      student: "Ученик QA",
      parent: "Родитель QA",
      teacher: "Преподаватель QA",
      avitoUrl: "https://www.avito.ru/item/qa",
    });
    expect(updatedLead.name).toBe("QA Lead");
    expect(updatedLead.student).toBe("Ученик QA");
    expect(updatedLead.parent).toBe("Родитель QA");
    expect(updatedLead.teacher).toBe("Преподаватель QA");
    expect(updatedLead.avitoUrl).toBe("https://www.avito.ru/item/qa");
    expect((await listBaseLeads(t.db, bazaCtx)).some((r) => r.id === lead.id)).toBe(
      true
    );
    await deleteBaseLead(t.db, bazaCtx, lead.id);

    // Пробные
    const lesson = await createManualTrialLesson(t.db, trialCtx);
    expect(
      (await listManualTrialLessons(t.db, trialCtx)).some((r) => r.id === lesson.id)
    ).toBe(true);
    await deleteManualTrialLesson(t.db, trialCtx, lesson.id);

    // РНП
    const month = await getRnpAvitoMonth(t.db, rnpCtx, {
      year: 2026,
      month: 3,
    });
    expect(month.days.length).toBeGreaterThan(0);
    const day = month.days[0]!;
    const upserted = await upsertRnpAvitoManualDay(t.db, rnpCtx, {
      date: day.date,
      expectedManualUpdatedAt: day.manualUpdatedAt,
      trialsScheduled: 2,
    });
    expect(upserted.trialsScheduled).toBe(2);

    // Расходы
    const expense = await createManualExpense(t.db, expCtx, {
      category: "Сервисы",
      comment: "QA",
      expenseDate: "2026-03-01",
      amountRub: 500,
    });
    const listed = await listExpenses(t.db, expCtx, {
      year: 2026,
      month: 3,
      category: null,
    });
    expect(listed.expenses.some((e) => e.id === expense.id)).toBe(true);
    await deleteManualExpense(t.db, expCtx, { id: expense.id });
  });

  it("does not allow cross-action and keeps director cabinet access intact", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const teacher = await asRole(t.db, "anna@example.com");

    expect(() =>
      assertQuickAccessActionAllowed("baza", "listExpenses")
    ).toThrow();

    await expect(
      createQuickAccessLink(t.db, teacher, "baza")
    ).rejects.toMatchObject({ status: 403 });

    const viaCabinet = await createBaseLead(t.db, director);
    expect(viaCabinet.id).toBeTruthy();
    const listed = await listBaseLeads(t.db, director);
    expect(listed.some((r) => r.id === viaCabinet.id)).toBe(true);

    const issued = await createQuickAccessLink(t.db, director, "rashody");
    const resolved = await resolveQuickAccessToken(
      t.db,
      issued.token,
      "rashody"
    );
    expect(resolved.organizationId).toBe(director.organizationId);
    expect(resolved.ctx.organizationId).toBe(director.organizationId);
  });

  it("generates cryptographically long tokens (not short ids)", () => {
    const a = createQuickAccessToken();
    const b = createQuickAccessToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashQuickAccessToken(a)).not.toBe(a);
  });
});
