import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students } from "@/server/db/schema";
import { withIdempotency } from "@/server/idempotency";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertStudent } from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("upsertStudent idempotency", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("does not create duplicate students for the same Idempotency-Key", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);
    const studentId = "s_idem_dup_test";
    const payload = {
      id: studentId,
      fullName: "Тест Дубликат",
      grade: "9" as const,
      status: "active" as const,
      teacherId: "t1",
    };

    const runOnce = () =>
      withIdempotency(
        t.db,
        ctx,
        "POST:/api/platform:upsertStudent",
        `upsertStudent:${studentId}`,
        async () => {
          const body = await upsertStudent(t.db, ctx, payload);
          return { status: 200, body };
        }
      );

    const first = await runOnce();
    const second = await runOnce();

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);

    const rows = await t.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));
    expect(rows).toHaveLength(1);
  });
});
