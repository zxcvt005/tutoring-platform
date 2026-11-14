import { and, eq, gte, lte } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import { resetAvitoTokenCache } from "@/server/avito/client";
import { resolveAuthContext } from "@/server/authz/context";
import { manualTrialLessons, rnpAvitoDailyStats } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  createManualTrialLesson,
  updateManualTrialLesson,
} from "@/server/services/manual-trial-lessons-service";
import {
  getRnpAvitoMonth,
  resetRnpAvitoSyncLocks,
  syncRnpAvitoMonth,
  upsertRnpAvitoManualDay,
} from "@/server/services/rnp-avito-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("rnp avito sync", () => {
  let close: (() => Promise<void>) | undefined;
  const prevEnv = {
    id: process.env.AVITO_CLIENT_ID,
    secret: process.env.AVITO_CLIENT_SECRET,
    user: process.env.AVITO_USER_ID,
  };

  afterEach(async () => {
    resetAvitoTokenCache();
    resetRnpAvitoSyncLocks();
    if (prevEnv.id === undefined) delete process.env.AVITO_CLIENT_ID;
    else process.env.AVITO_CLIENT_ID = prevEnv.id;
    if (prevEnv.secret === undefined) delete process.env.AVITO_CLIENT_SECRET;
    else process.env.AVITO_CLIENT_SECRET = prevEnv.secret;
    if (prevEnv.user === undefined) delete process.env.AVITO_USER_ID;
    else process.env.AVITO_USER_ID = prevEnv.user;
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

  function setEnv() {
    process.env.AVITO_CLIENT_ID = "cid";
    process.env.AVITO_CLIENT_SECRET = "csecret";
    process.env.AVITO_USER_ID = "178228957";
  }

  function mockAvitoOk(): typeof fetch {
    return async (url) => {
      const u = String(url);
      if (u.includes("/token/")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      if (u.includes("/spendings")) {
        return jsonResponse({
          result: {
            timestamp: 1,
            groupings: [
              {
                date: "2026-11-01",
                type: "day",
                spendings: [
                  { slug: "promotion", value: 2000, services: [] },
                ],
              },
              {
                date: "2026-11-02",
                type: "day",
                spendings: [
                  { slug: "promotion", value: 500, services: [] },
                ],
              },
            ],
          },
        });
      }
      if (u.includes("/items")) {
        return jsonResponse({
          result: {
            dataTotalCount: 2,
            groupings: [
              {
                id: 20261101,
                type: "day",
                metrics: [
                  { slug: "impressions", value: 100 },
                  { slug: "views", value: 40 },
                  { slug: "contacts", value: 8 },
                ],
              },
              {
                id: 20261102,
                type: "day",
                metrics: [
                  { slug: "impressions", value: 20 },
                  { slug: "views", value: 5 },
                  { slug: "contacts", value: 1 },
                ],
              },
            ],
          },
        });
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500);
    };
  }

  it("requires env variables before sync", async () => {
    const t = await createTestDb();
    close = t.close;
    delete process.env.AVITO_CLIENT_ID;
    delete process.env.AVITO_CLIENT_SECRET;
    delete process.env.AVITO_USER_ID;
    const director = await asRole(t.db, "director@demo.local");
    await expect(
      syncRnpAvitoMonth(t.db, director, { year: 2026, month: 11 })
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("syncs API metrics, overlays trials from manual_trial_lessons, no duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    setEnv();
    const director = await asRole(t.db, "director@demo.local");

    // Legacy values in rnp table must not affect displayed trial metrics.
    await t.db.insert(rnpAvitoDailyStats).values({
      id: "rnp_legacy_sync",
      organizationId: director.organizationId,
      dayDate: "2026-11-01",
      budgetSpentRub: null,
      impressions: null,
      views: null,
      contacts: null,
      apiSyncedAt: null,
      trialsScheduled: 99,
      trialsCompleted: 88,
      manualUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const lessonA = await createManualTrialLesson(t.db, director);
    const lessonB = await createManualTrialLesson(t.db, director);
    const lessonC = await createManualTrialLesson(t.db, director);
    const createdAt = fromAppWall(2026, 11, 1, 12, 0, 0);
    for (const id of [lessonA.id, lessonB.id, lessonC.id]) {
      await t.db
        .update(manualTrialLessons)
        .set({ createdAt, updatedAt: createdAt })
        .where(eq(manualTrialLessons.id, id));
    }
    const [rowB] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, lessonB.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: lessonB.id,
      expectedUpdatedAt: rowB!.updatedAt.toISOString(),
      attended: true,
    });
    const [rowC] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, lessonC.id))
      .limit(1);
    await updateManualTrialLesson(t.db, director, {
      id: lessonC.id,
      expectedUpdatedAt: rowC!.updatedAt.toISOString(),
      attended: true,
    });

    const first = await syncRnpAvitoMonth(
      t.db,
      director,
      { year: 2026, month: 11 },
      { fetchFn: mockAvitoOk() }
    );
    expect(first.syncedDays).toBe(2);
    expect(first.monthPayload.apiConnected).toBe(true);
    expect(first.monthPayload.lastSyncedAt).toBeTruthy();

    const day1 = first.monthPayload.days.find((d) => d.date === "2026-11-01")!;
    expect(day1.budgetSpentRub).toBe(2000);
    expect(day1.impressions).toBe(100);
    expect(day1.views).toBe(40);
    expect(day1.contacts).toBe(8);
    expect(day1.trialsScheduled).toBe(3);
    expect(day1.trialsCompleted).toBe(2);

    const second = await syncRnpAvitoMonth(
      t.db,
      director,
      { year: 2026, month: 11 },
      { fetchFn: mockAvitoOk() }
    );
    const rows = await t.db
      .select()
      .from(rnpAvitoDailyStats)
      .where(
        and(
          eq(rnpAvitoDailyStats.organizationId, director.organizationId),
          gte(rnpAvitoDailyStats.dayDate, "2026-11-01"),
          lte(rnpAvitoDailyStats.dayDate, "2026-11-30")
        )
      );
    expect(rows).toHaveLength(2);
    expect(
      second.monthPayload.days.find((d) => d.date === "2026-11-01")!
        .trialsScheduled
    ).toBe(3);
    expect(
      second.monthPayload.days.find((d) => d.date === "2026-11-01")!
        .trialsCompleted
    ).toBe(2);
    // API fields untouched by trial overlay; legacy trials_* may remain in DB
    // when is_manual is false (display still uses auto counts).
    const dbDay1 = rows.find((r) => r.dayDate === "2026-11-01")!;
    expect(dbDay1.budgetSpentRub).toBe(2000);
    expect(dbDay1.trialsScheduled).toBe(99);
    expect(dbDay1.trialsScheduledIsManual).toBe(false);
    expect(
      second.monthPayload.days.find((d) => d.date === "2026-11-01")!
        .trialsScheduledSource
    ).toBe("automatic");

    // Manual override must survive Avito sync and stay independent.
    const beforeOverride = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    const dayBefore = beforeOverride.days.find((d) => d.date === "2026-11-01")!;
    const manual = await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-01",
      expectedManualUpdatedAt: dayBefore.manualUpdatedAt,
      trialsScheduled: 7,
    });
    expect(manual.trialsScheduled).toBe(7);
    expect(manual.trialsScheduledSource).toBe("manual");
    expect(manual.trialsCompletedSource).toBe("automatic");

    const afterSync = await syncRnpAvitoMonth(
      t.db,
      director,
      { year: 2026, month: 11 },
      { fetchFn: mockAvitoOk() }
    );
    const dayAfter = afterSync.monthPayload.days.find(
      (d) => d.date === "2026-11-01"
    )!;
    expect(dayAfter.budgetSpentRub).toBe(2000);
    expect(dayAfter.trialsScheduled).toBe(7);
    expect(dayAfter.trialsScheduledSource).toBe("manual");
    expect(dayAfter.trialsCompleted).toBe(2);
    expect(dayAfter.trialsCompletedSource).toBe("automatic");
  });

  it("does not partially update the month when Avito returns an error", async () => {
    const t = await createTestDb();
    close = t.close;
    setEnv();
    const director = await asRole(t.db, "director@demo.local");

    await syncRnpAvitoMonth(
      t.db,
      director,
      { year: 2026, month: 11 },
      { fetchFn: mockAvitoOk() }
    );

    let spendCalls = 0;
    await expect(
      syncRnpAvitoMonth(
        t.db,
        director,
        { year: 2026, month: 11 },
        {
          fetchFn: async (url) => {
            const u = String(url);
            if (u.includes("/token/")) {
              return jsonResponse({ access_token: "tok", expires_in: 3600 });
            }
            if (u.includes("/spendings")) {
              spendCalls += 1;
              return jsonResponse({
                result: {
                  timestamp: 1,
                  groupings: [
                    {
                      date: "2026-11-01",
                      type: "day",
                      spendings: [
                        { slug: "promotion", value: 9999, services: [] },
                      ],
                    },
                  ],
                },
              });
            }
            return jsonResponse({ error: { message: "down" } }, 503);
          },
        }
      )
    ).rejects.toMatchObject({ status: 503 });

    expect(spendCalls).toBe(1);
    const month = await getRnpAvitoMonth(t.db, director, {
      year: 2026,
      month: 11,
    });
    expect(month.days.find((d) => d.date === "2026-11-01")!.budgetSpentRub).toBe(
      2000
    );
  });

  it("forbids sync for non-directors", async () => {
    const t = await createTestDb();
    close = t.close;
    setEnv();
    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      syncRnpAvitoMonth(t.db, student, { year: 2026, month: 11 }, {
        fetchFn: mockAvitoOk(),
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("blocks concurrent sync of the same month", async () => {
    const t = await createTestDb();
    close = t.close;
    setEnv();
    const director = await asRole(t.db, "director@demo.local");

    let releaseSpend!: () => void;
    const spendGate = new Promise<void>((resolve) => {
      releaseSpend = resolve;
    });
    let hitSpend = false;

    const first = syncRnpAvitoMonth(
      t.db,
      director,
      { year: 2026, month: 11 },
      {
        fetchFn: async (url) => {
          const u = String(url);
          if (u.includes("/token/")) {
            return jsonResponse({ access_token: "tok", expires_in: 3600 });
          }
          if (u.includes("/spendings")) {
            hitSpend = true;
            await spendGate;
            return jsonResponse({
              result: { timestamp: 1, groupings: [] },
            });
          }
          return jsonResponse({
            result: { dataTotalCount: 0, groupings: [] },
          });
        },
      }
    );

    for (let i = 0; i < 50 && !hitSpend; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(hitSpend).toBe(true);

    await expect(
      syncRnpAvitoMonth(
        t.db,
        director,
        { year: 2026, month: 11 },
        { fetchFn: mockAvitoOk() }
      )
    ).rejects.toMatchObject({ code: "conflict" });

    releaseSpend();
    await first;
  });
});
