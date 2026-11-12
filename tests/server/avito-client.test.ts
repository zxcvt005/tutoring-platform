import { afterEach, describe, expect, it } from "vitest";

import {
  fetchAvitoAccessToken,
  fetchAvitoSpendings,
  resetAvitoTokenCache,
} from "@/server/avito/client";

const cfg = {
  clientId: "test-client",
  clientSecret: "test-secret",
  userId: "178228957",
};

describe("avito client", () => {
  afterEach(() => {
    resetAvitoTokenCache();
  });

  it("obtains OAuth token via client_credentials", async () => {
    const calls: { url: string; body?: string }[] = [];
    const token = await fetchAvitoAccessToken(cfg, {
      fetchFn: async (url, init) => {
        const raw = init?.body;
        const body =
          typeof raw === "string"
            ? raw
            : raw instanceof URLSearchParams
              ? raw.toString()
              : undefined;
        calls.push({ url, body });
        return new Response(
          JSON.stringify({ access_token: "tok_test", expires_in: 3600 }),
          { status: 200 }
        );
      },
    });
    expect(token).toBe("tok_test");
    expect(calls[0]!.url).toContain("/token/");
    expect(calls[0]!.body).toContain("grant_type=client_credentials");
    expect(calls[0]!.body).not.toContain("tok_test");
  });

  it("surfaces OAuth failures without leaking secrets", async () => {
    await expect(
      fetchAvitoAccessToken(cfg, {
        fetchFn: async () =>
          new Response(JSON.stringify({ error: "invalid_client" }), {
            status: 401,
          }),
      })
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("refreshes token on 401 and retries the API call", async () => {
    let tokenCalls = 0;
    let spendCalls = 0;
    const payload = await fetchAvitoSpendings(
      cfg,
      { dateFrom: "2026-11-01", dateTo: "2026-11-02" },
      {
        fetchFn: async (url, init) => {
          if (String(url).includes("/token/")) {
            tokenCalls += 1;
            return new Response(
              JSON.stringify({
                access_token: `tok_${tokenCalls}`,
                expires_in: 3600,
              }),
              { status: 200 }
            );
          }
          spendCalls += 1;
          const auth = (init?.headers as Record<string, string>)?.Authorization;
          if (spendCalls === 1) {
            expect(auth).toBe("Bearer tok_1");
            return new Response(JSON.stringify({ error: { message: "expired" } }), {
              status: 401,
            });
          }
          expect(auth).toBe("Bearer tok_2");
          return new Response(
            JSON.stringify({ result: { groupings: [], timestamp: 1 } }),
            { status: 200 }
          );
        },
      }
    );
    expect(tokenCalls).toBe(2);
    expect(spendCalls).toBe(2);
    expect(payload).toEqual({ result: { groupings: [], timestamp: 1 } });
  });
});
