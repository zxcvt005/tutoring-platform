import { and, count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  baseLeads,
  manualTrialLessons,
  rnpAvitoDailyStats,
  students,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { createBaseLead } from "@/server/services/base-leads-service";
import { createManualTrialLesson } from "@/server/services/manual-trial-lessons-service";
import {
  getRnpAvitoMonth,
  upsertRnpAvitoManualDay,
} from "@/server/services/rnp-avito-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("rnp avito daily stats (Дирекция «РНП Авито»)", () => {
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

  it("loads month shell, saves manual fields, and keeps API fields untouched", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const studentsBefore = await t.db.select({ id: students.id }).from(students);
    const base = await createBaseLead(t.db, director);
    const trial = await createManualTrialLesson(t.db, director);

    const month = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    expect(month.daysInMonth).toBe(30);
    expect(month.lastSyncedAt).toBeNull();
    expect(month.days[0]!.date).toBe("2026-11-01");
    expect(month.days.every((d) => d.budgetSpentRub === null)).toBe(true);

    const saved = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-05",
      expectedManualUpdatedAt: null,
      trialsScheduled: 3,
      trialsCompleted: 2,
    });
    expect(saved.trialsScheduled).toBe(3);
    expect(saved.trialsCompleted).toBe(2);
    expect(saved.budgetSpentRub).toBeNull();
    expect(saved.impressions).toBeNull();
    expect(saved.views).toBeNull();
    expect(saved.contacts).toBeNull();
    expect(saved.apiSyncedAt).toBeNull();

    const reloaded = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    const day = reloaded.days.find((d) => d.date === "2026-11-05")!;
    expect(day.trialsScheduled).toBe(3);
    expect(day.trialsCompleted).toBe(2);

    const updated = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-05",
      expectedManualUpdatedAt: day.manualUpdatedAt,
      trialsCompleted: 4,
    });
    expect(updated.trialsScheduled).toBe(3);
    expect(updated.trialsCompleted).toBe(4);
    expect(updated.budgetSpentRub).toBeNull();

    const studentsAfter = await t.db.select({ id: students.id }).from(students);
    expect(studentsAfter.map((s) => s.id).sort()).toEqual(
      studentsBefore.map((s) => s.id).sort()
    );

    const [baseStill] = await t.db
      .select()
      .from(baseLeads)
      .where(eq(baseLeads.id, base.id))
      .limit(1);
    expect(baseStill?.id).toBe(base.id);

    const [trialStill] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, trial.id))
      .limit(1);
    expect(trialStill?.id).toBe(trial.id);

    const [rnpCount] = await t.db
      .select({ n: count() })
      .from(rnpAvitoDailyStats)
      .where(
        and(
          eq(rnpAvitoDailyStats.organizationId, director.organizationId),
          eq(rnpAvitoDailyStats.dayDate, "2026-11-05")
        )
      );
    expect(Number(rnpCount!.n)).toBe(1);
  });

  it("rejects stale manual updates and negative values", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-08-01",
      expectedManualUpdatedAt: null,
      trialsScheduled: 1,
    });

    await expect(
      upsertRnpAvitoManualDay(t.db, director, {
        date: "2026-08-01",
        expectedManualUpdatedAt: created.manualUpdatedAt,
        trialsScheduled: -1,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    await expect(
      upsertRnpAvitoManualDay(t.db, director, {
        date: "2026-08-01",
        expectedManualUpdatedAt: null,
        trialsScheduled: 2,
      })
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  });

  it("forbids non-director roles", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      getRnpAvitoMonth(t.db, student, { year: 2026, month: 11 })
    ).rejects.toMatchObject({ code: "forbidden" });
    const press = await asRole(t.db, "press@demo.local");
    await expect(
      upsertRnpAvitoManualDay(t.db, press, {
        date: "2026-11-01",
        expectedManualUpdatedAt: null,
        trialsScheduled: 1,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
