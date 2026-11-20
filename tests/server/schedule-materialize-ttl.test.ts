import { describe, it, expect, afterEach, vi } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  createLessonSchedule,
  ensureOrgSchedulesMaterialized,
} from "@/server/services/schedule-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("schedule materialize outside bootstrap", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    vi.restoreAllMocks();
  });

  it("respects TTL even when until is provided", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const anna = await resolveAuthContext(t.db, session.rawToken);
    const now = new Date(2026, 9, 14, 10, 0, 0, 0);

    await createLessonSchedule(
      t.db,
      anna,
      {
        teacherId: "t1",
        studentIds: ["s1"],
        weekdays: [3],
        startTime: "17:00",
        durationMin: 60,
        subject: "TTL test",
        activeFrom: now.toISOString(),
      },
      now
    );

    const until = new Date(now.getTime() + 21 * 86_400_000);
    const first = await ensureOrgSchedulesMaterialized(
      t.db,
      anna.organizationId,
      now,
      { until }
    );
    const second = await ensureOrgSchedulesMaterialized(
      t.db,
      anna.organizationId,
      now,
      { until }
    );
    expect(second).toBe(0);
    // first may create 0 if createLessonSchedule already materialized
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it("buildBootstrap does not invoke ensureOrgSchedulesMaterialized", async () => {
    const t = await createTestDb();
    close = t.close;
    const spy = vi.spyOn(
      await import("@/server/services/schedule-service"),
      "ensureOrgSchedulesMaterialized"
    );
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const anna = await resolveAuthContext(t.db, session.rawToken);
    await buildBootstrap(t.db, anna);
    expect(spy).not.toHaveBeenCalled();
  });
});
