import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { withIdempotency } from "@/server/idempotency";
import { loginWithPassword } from "@/server/services/auth-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("withIdempotency claim", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("replays the same response for the same key", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);

    let runs = 0;
    const first = await withIdempotency(
      t.db,
      ctx,
      "POST:/api/platform:testAction",
      "key-1",
      async () => {
        runs += 1;
        return { status: 200, body: { ok: true, n: runs } };
      }
    );
    const second = await withIdempotency(
      t.db,
      ctx,
      "POST:/api/platform:testAction",
      "key-1",
      async () => {
        runs += 1;
        return { status: 200, body: { ok: true, n: runs } };
      }
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(runs).toBe(1);
  });

  it("allows a new key to run again", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);

    let runs = 0;
    await withIdempotency(t.db, ctx, "POST:/api/platform:testAction", "a", async () => {
      runs += 1;
      return { status: 200, body: { runs } };
    });
    await withIdempotency(t.db, ctx, "POST:/api/platform:testAction", "b", async () => {
      runs += 1;
      return { status: 200, body: { runs } };
    });
    expect(runs).toBe(2);
  });
});
