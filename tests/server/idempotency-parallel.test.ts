import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students, teachers } from "@/server/db/schema";
import { withIdempotency } from "@/server/idempotency";
import { loginWithPassword } from "@/server/services/auth-service";
import { createBaseLead } from "@/server/services/base-leads-service";
import { createManualTrialLesson } from "@/server/services/manual-trial-lessons-service";
import {
  upsertStudent,
  upsertTeacher,
} from "@/server/services/platform-mutations";
import { createStudentEnrollmentInvitation } from "@/server/services/student-onboarding-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("idempotency under parallel and retry", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asDirector(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("runs the mutation once when parallel callers share the same key", async () => {
    const t = await createTestDb();
    close = t.close;
    const ctx = await asDirector(t.db);
    let runs = 0;

    const start = Promise.resolve();
    const tasks = [0, 1, 2].map(() =>
      start.then(() =>
        withIdempotency(
          t.db,
          ctx,
          "POST:/api/platform:parallelProbe",
          "same-parallel-key",
          async () => {
            runs += 1;
            await new Promise((r) => setTimeout(r, 80));
            return { status: 200, body: { runs } };
          }
        )
      )
    );

    const results = await Promise.all(tasks);
    expect(runs).toBe(1);
    expect(results.every((r) => r.body.runs === 1)).toBe(true);
    expect(results.filter((r) => r.replayed).length).toBeGreaterThanOrEqual(2);
  });

  it("allows retry with the same key after a failed attempt", async () => {
    const t = await createTestDb();
    close = t.close;
    const ctx = await asDirector(t.db);
    let attempts = 0;

    await expect(
      withIdempotency(
        t.db,
        ctx,
        "POST:/api/platform:retryProbe",
        "retry-after-error",
        async () => {
          attempts += 1;
          throw new Error("simulated network/server failure");
        }
      )
    ).rejects.toThrow(/simulated network/);

    const recovered = await withIdempotency(
      t.db,
      ctx,
      "POST:/api/platform:retryProbe",
      "retry-after-error",
      async () => {
        attempts += 1;
        return { status: 200, body: { ok: true, attempts } };
      }
    );

    expect(recovered.replayed).toBe(false);
    expect(recovered.body.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it("dedupes parallel student creates with the same client id key", async () => {
    const t = await createTestDb();
    close = t.close;
    const ctx = await asDirector(t.db);
    const studentId = "s_parallel_student";
    const payload = {
      id: studentId,
      fullName: "Параллельный Ученик",
      grade: "9" as const,
      status: "active" as const,
      teacherId: "t1",
    };

    const results = await Promise.all(
      [0, 1, 2].map(() =>
        withIdempotency(
          t.db,
          ctx,
          "POST:/api/platform:upsertStudent",
          `upsertStudent:${studentId}`,
          async () => ({
            status: 200,
            body: await upsertStudent(t.db, ctx, payload),
          })
        )
      )
    );

    expect(results[0]?.body.id).toBe(studentId);
    const rows = await t.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));
    expect(rows).toHaveLength(1);
  });

  it("dedupes parallel teacher creates with the same client id key", async () => {
    const t = await createTestDb();
    close = t.close;
    const ctx = await asDirector(t.db);
    const teacherId = "t_parallel_teacher";
    const payload = {
      id: teacherId,
      fullName: "Параллельный Преподаватель",
      subjects: ["Математика"],
      status: "active" as const,
      defaultDurationMin: 60,
      workDays: [1, 2, 3, 4, 5],
    };

    await Promise.all(
      [0, 1].map(() =>
        withIdempotency(
          t.db,
          ctx,
          "POST:/api/platform:upsertTeacher",
          `upsertTeacher:${teacherId}`,
          async () => ({
            status: 200,
            body: await upsertTeacher(t.db, ctx, payload as never),
          })
        )
      )
    );

    const rows = await t.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, teacherId));
    expect(rows).toHaveLength(1);
  });

  it("dedupes parallel enrollment invites, base leads and trial rows", async () => {
    const t = await createTestDb();
    close = t.close;
    const ctx = await asDirector(t.db);

    const inviteKey = "invite-parallel-1";
    const leadKey = "lead-parallel-1";
    const trialKey = "trial-parallel-1";

    const [invites, leads, trials] = await Promise.all([
      Promise.all(
        [0, 1].map(() =>
          withIdempotency(
            t.db,
            ctx,
            "POST:/api/platform:createStudentEnrollmentInvitation",
            inviteKey,
            async () => ({
              status: 200,
              body: await createStudentEnrollmentInvitation(t.db, ctx),
            })
          )
        )
      ),
      Promise.all(
        [0, 1].map(() =>
          withIdempotency(
            t.db,
            ctx,
            "POST:/api/platform:createBaseLead",
            leadKey,
            async () => ({
              status: 200,
              body: { lead: await createBaseLead(t.db, ctx) },
            })
          )
        )
      ),
      Promise.all(
        [0, 1].map(() =>
          withIdempotency(
            t.db,
            ctx,
            "POST:/api/platform:createManualTrialLesson",
            trialKey,
            async () => ({
              status: 200,
              body: { lesson: await createManualTrialLesson(t.db, ctx) },
            })
          )
        )
      ),
    ]);

    expect(invites[0]?.body.studentId).toBe(invites[1]?.body.studentId);
    expect(leads[0]?.body.lead.id).toBe(leads[1]?.body.lead.id);
    expect(trials[0]?.body.lesson.id).toBe(trials[1]?.body.lesson.id);
  });
});
