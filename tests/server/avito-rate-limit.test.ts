import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchAvitoSpendings,
  getAvitoClientDiagnostics,
  resetAvitoClientDiagnostics,
  resetAvitoTokenCache,
} from "@/server/avito/client";

const cfg = {
  clientId: "test-client",
  clientSecret: "test-secret",
  userId: "178228957",
};

describe("avito rate limit handling", () => {
  afterEach(() => {
    resetAvitoTokenCache();
    resetAvitoClientDiagnostics();
    vi.useRealTimers();
  });

  it("retries on 429 using Retry-After then succeeds", async () => {
    let spendCalls = 0;
    const sleeps: number[] = [];
    const payload = await fetchAvitoSpendings(
      cfg,
      { dateFrom: "2026-11-01", dateTo: "2026-11-02" },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        fetchFn: async (url) => {
          if (String(url).includes("/token/")) {
            return new Response(
              JSON.stringify({ access_token: "tok", expires_in: 3600 }),
              { status: 200 }
            );
          }
          spendCalls += 1;
          if (spendCalls === 1) {
            return new Response(JSON.stringify({ error: { message: "rate" } }), {
              status: 429,
              headers: { "Retry-After": "1" },
            });
          }
          return new Response(
            JSON.stringify({ result: { groupings: [], timestamp: 1 } }),
            { status: 200 }
          );
        },
      }
    );
    expect(payload).toEqual({ result: { groupings: [], timestamp: 1 } });
    expect(spendCalls).toBe(2);
    expect(sleeps[0]).toBe(1000);
    expect(getAvitoClientDiagnostics().rateLimited).toBeGreaterThanOrEqual(1);
  });

  it("stops after max 429 retries", async () => {
    await expect(
      fetchAvitoSpendings(
        cfg,
        { dateFrom: "2026-11-01", dateTo: "2026-11-02" },
        {
          sleep: async () => undefined,
          fetchFn: async (url) => {
            if (String(url).includes("/token/")) {
              return new Response(
                JSON.stringify({ access_token: "tok", expires_in: 3600 }),
                { status: 200 }
              );
            }
            return new Response(JSON.stringify({ error: { message: "rate" } }), {
              status: 429,
              headers: { "Retry-After": "2" },
            });
          },
        }
      )
    ).rejects.toMatchObject({
      code: "service_unavailable",
      details: { code: "avito_rate_limited" },
    });
  });

  it("serializes concurrent Avito HTTP calls", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const fetchFn = async (url: string) => {
      if (String(url).includes("/token/")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 }
        );
      }
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight -= 1;
      return new Response(
        JSON.stringify({ result: { groupings: [], timestamp: 1 } }),
        { status: 200 }
      );
    };

    await Promise.all([
      fetchAvitoSpendings(cfg, { dateFrom: "2026-11-01", dateTo: "2026-11-01" }, {
        fetchFn,
      }),
      fetchAvitoSpendings(cfg, { dateFrom: "2026-11-02", dateTo: "2026-11-02" }, {
        fetchFn,
      }),
      fetchAvitoSpendings(cfg, { dateFrom: "2026-11-03", dateTo: "2026-11-03" }, {
        fetchFn,
      }),
    ]);
    expect(maxInflight).toBe(1);
  });
});
