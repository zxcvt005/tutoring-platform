import { and, eq, gte, lte } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resetAvitoTokenCache } from "@/server/avito/client";
import { resolveAuthContext } from "@/server/authz/context";
import { rnpAvitoDailyStats } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
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

  it("syncs API metrics, keeps manual fields, and upserts without duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    setEnv();
    const director = await asRole(t.db, "director@demo.local");

    await upsertRnpAvitoManualDay(t.db, director, {
      date: "2026-11-01",
      expectedManualUpdatedAt: null,
      trialsScheduled: 3,
      trialsCompleted: 2,
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
    expect(second.monthPayload.days.find((d) => d.date === "2026-11-01")!.trialsScheduled).toBe(3);
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
