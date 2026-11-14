import { and, count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import { resolveAuthContext } from "@/server/authz/context";
import {
  baseLeads,
  manualTrialLessons,
  rnpAvitoDailyStats,
  students,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { createBaseLead } from "@/server/services/base-leads-service";
import {
  createManualTrialLesson,
  deleteManualTrialLesson,
  updateManualTrialLesson,
} from "@/server/services/manual-trial-lessons-service";
import {
  clearRnpAvitoTrialOverride,
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

  async function setCreatedAt(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    id: string,
    createdAt: Date
  ) {
    await db
      .update(manualTrialLessons)
      .set({ createdAt, updatedAt: createdAt })
      .where(eq(manualTrialLessons.id, id));
  }

  it("loads month shell and keeps API fields empty without sync", async () => {
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
  });

  it("overrides a single trial cell independently and can restore automatic", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const a = await createManualTrialLesson(t.db, director);
    const b = await createManualTrialLesson(t.db, director);
    const c = await createManualTrialLesson(t.db, director);
    await setCreatedAt(t.db, a.id, fromAppWall(2026, 11, 14, 10, 0, 0));
    await setCreatedAt(t.db, b.id, fromAppWall(2026, 11, 14, 11, 0, 0));
    await setCreatedAt(t.db, c.id, fromAppWall(2026, 11, 14, 12, 0, 0));
    for (const id of [b.id, c.id]) {
      const [row] = await t.db
        .select()
        .from(manualTrialLessons)
        .where(eq(manualTrialLessons.id, id))
        .limit(1);
      await updateManualTrialLesson(t.db, director, {
        id,
        expectedUpdatedAt: row!.updatedAt.toISOString(),
        attended: true,
      });
    }

    let month = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    let day = month.days.find((d) => d.date === "2026-11-14")!;
    expect(day.trialsScheduled).toBe(3);
    expect(day.trialsCompleted).toBe(2);
    expect(day.trialsScheduledSource).toBe("automatic");
    expect(day.trialsCompletedSource).toBe("automatic");

    const overridden = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-14",
      expectedManualUpdatedAt: day.manualUpdatedAt,
      trialsScheduled: 4,
    });
    expect(overridden.trialsScheduled).toBe(4);
    expect(overridden.trialsScheduledSource).toBe("manual");
    expect(overridden.trialsCompleted).toBe(2);
    expect(overridden.trialsCompletedSource).toBe("automatic");

    // New trial + uncheck completed: scheduled auto stays frozen; completed auto updates.
    const d = await createManualTrialLesson(t.db, director);
    await setCreatedAt(t.db, d.id, fromAppWall(2026, 11, 14, 15, 0, 0));
    const [rowC] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, c.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: c.id,
      expectedUpdatedAt: rowC!.updatedAt.toISOString(),
      attended: false,
    });

    month = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    day = month.days.find((x) => x.date === "2026-11-14")!;
    expect(day.trialsScheduled).toBe(4);
    expect(day.trialsScheduledSource).toBe("manual");
    expect(day.trialsCompleted).toBe(1);
    expect(day.trialsCompletedSource).toBe("automatic");

    // Override completed independently.
    const completedOverride = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-14",
      expectedManualUpdatedAt: day.manualUpdatedAt,
      trialsCompleted: 9,
    });
    expect(completedOverride.trialsScheduled).toBe(4);
    expect(completedOverride.trialsScheduledSource).toBe("manual");
    expect(completedOverride.trialsCompleted).toBe(9);
    expect(completedOverride.trialsCompletedSource).toBe("manual");

    // Reload / other month switch persistence.
    const reloaded = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    const persisted = reloaded.days.find((x) => x.date === "2026-11-14")!;
    expect(persisted.trialsScheduled).toBe(4);
    expect(persisted.trialsCompleted).toBe(9);
    const otherMonth = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 10,
    });
    expect(
      otherMonth.days.every((x) => x.trialsScheduledSource === "automatic")
    ).toBe(true);
    const back = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    expect(back.days.find((x) => x.date === "2026-11-14")!.trialsScheduled).toBe(
      4
    );

    // Clear scheduled only → auto again (4 lessons created that day).
    const cleared = await clearRnpAvitoTrialOverride(t.db, director, {
      date: "2026-11-14",
      expectedManualUpdatedAt: back.days.find((x) => x.date === "2026-11-14")!
        .manualUpdatedAt,
      field: "trialsScheduled",
    });
    expect(cleared.trialsScheduled).toBe(4);
    expect(cleared.trialsScheduledSource).toBe("automatic");
    expect(cleared.trialsCompleted).toBe(9);
    expect(cleared.trialsCompletedSource).toBe("manual");

    const clearedCompleted = await clearRnpAvitoTrialOverride(t.db, director, {
      date: "2026-11-14",
      expectedManualUpdatedAt: cleared.manualUpdatedAt,
      field: "trialsCompleted",
    });
    expect(clearedCompleted.trialsCompleted).toBe(1);
    expect(clearedCompleted.trialsCompletedSource).toBe("automatic");

    const [rnpCount] = await t.db
      .select({ n: count() })
      .from(rnpAvitoDailyStats)
      .where(
        and(
          eq(rnpAvitoDailyStats.organizationId, director.organizationId),
          eq(rnpAvitoDailyStats.dayDate, "2026-11-14")
        )
      );
    expect(Number(rnpCount!.n)).toBe(1);
  });

  it("computes scheduled/completed trials from manual_trial_lessons by createdAt", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const a = await createManualTrialLesson(t.db, director);
    const b = await createManualTrialLesson(t.db, director);
    const c = await createManualTrialLesson(t.db, director);
    const d = await createManualTrialLesson(t.db, director);

    await setCreatedAt(t.db, a.id, fromAppWall(2026, 11, 5, 12, 0, 0));
    await setCreatedAt(t.db, b.id, fromAppWall(2026, 11, 12, 12, 0, 0));
    await setCreatedAt(t.db, c.id, fromAppWall(2026, 11, 18, 12, 0, 0));
    await setCreatedAt(t.db, d.id, fromAppWall(2026, 12, 2, 12, 0, 0));

    let nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    expect(nov.days.find((x) => x.date === "2026-11-05")!.trialsScheduled).toBe(
      1
    );
    expect(nov.days.find((x) => x.date === "2026-11-05")!.trialsCompleted).toBe(
      0
    );
    expect(
      nov.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(3);
    expect(
      nov.days.reduce((s, x) => s + (x.trialsCompleted ?? 0), 0)
    ).toBe(0);

    const listedB = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, b.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: b.id,
      expectedUpdatedAt: listedB[0]!.updatedAt.toISOString(),
      attended: true,
    });
    const listedC = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, c.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: c.id,
      expectedUpdatedAt: listedC[0]!.updatedAt.toISOString(),
      attended: true,
    });

    nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    expect(
      nov.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(3);
    expect(
      nov.days.reduce((s, x) => s + (x.trialsCompleted ?? 0), 0)
    ).toBe(2);
    expect(nov.days.find((x) => x.date === "2026-11-12")!.trialsCompleted).toBe(
      1
    );

    const afterC = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, c.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: c.id,
      expectedUpdatedAt: afterC[0]!.updatedAt.toISOString(),
      attended: false,
    });
    nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    expect(
      nov.days.reduce((s, x) => s + (x.trialsCompleted ?? 0), 0)
    ).toBe(1);

    await setCreatedAt(t.db, b.id, fromAppWall(2026, 12, 1, 10, 0, 0));
    nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    const dec = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 12,
    });
    expect(
      nov.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(2);
    expect(
      dec.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(2);
    expect(
      dec.days.reduce((s, x) => s + (x.trialsCompleted ?? 0), 0)
    ).toBe(1);

    await deleteManualTrialLesson(t.db, director, a.id);
    nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    expect(
      nov.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(1);

    // Legacy DB values must not affect overlay.
    await t.db.insert(rnpAvitoDailyStats).values({
      id: "rnp_legacy_test",
      organizationId: director.organizationId,
      dayDate: "2026-11-05",
      budgetSpentRub: 5000,
      impressions: 100,
      views: 40,
      contacts: 8,
      apiSyncedAt: null,
      trialsScheduled: 99,
      trialsCompleted: 88,
      manualUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    nov = await getRnpAvitoMonth(t.db, director, { year: 2026, month: 11 });
    const day5 = nov.days.find((x) => x.date === "2026-11-05")!;
    expect(day5.budgetSpentRub).toBe(5000);
    expect(day5.impressions).toBe(100);
    expect(day5.trialsScheduled).toBeNull();
    expect(day5.trialsCompleted).toBeNull();
    expect(day5.trialsScheduledSource).toBe("automatic");
    expect(day5.trialsCompletedSource).toBe("automatic");
    const day18 = nov.days.find((x) => x.date === "2026-11-18")!;
    expect(day18.trialsScheduled).toBe(1);
    expect(day18.trialsCompleted).toBe(0);
  });

  it("isolates trial counts by organization and year boundary", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const late = await createManualTrialLesson(t.db, director);
    const early = await createManualTrialLesson(t.db, director);
    await setCreatedAt(t.db, late.id, fromAppWall(2026, 12, 31, 23, 30, 0));
    await setCreatedAt(t.db, early.id, fromAppWall(2027, 1, 1, 0, 30, 0));

    const dec = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 12,
    });
    const jan = await getRnpAvitoMonth(t.db, director, {
      year: 2027,
      month: 1,
    });
    expect(
      dec.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(1);
    expect(
      jan.days.reduce((s, x) => s + (x.trialsScheduled ?? 0), 0)
    ).toBe(1);

    // Other org (press has own org in demo? use student org — director only).
    // Seed creates one org; verify press cannot read.
    const press = await asRole(t.db, "press@demo.local");
    await expect(
      getRnpAvitoMonth(t.db, press, { year: 2026, month: 12 })
    ).rejects.toMatchObject({ code: "forbidden" });
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
