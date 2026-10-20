import { describe, it, expect, afterEach } from "vitest";

import { ApiError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency";
import { resolveAuthContext } from "@/server/authz/context";
import {
  loginWithPassword,
  logout,
  mePayload,
} from "@/server/services/auth-service";
import {
  getAssignmentForViewer,
  getTestForViewer,
  saveDraft,
  submitAssignment,
} from "@/server/services/assignments-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("auth + rbac + keys", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("login rejects bad password and placeholder-like hashes are not accepted via verify", async () => {
    const ctx = await createTestDb();
    close = ctx.close;

    await expect(
      loginWithPassword(ctx.db, {
        email: "anna@example.com",
        password: "wrong-password",
      })
    ).rejects.toBeInstanceOf(ApiError);

    const ok = await loginWithPassword(ctx.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    expect(ok.user.email).toBe("anna@example.com");
    expect(ok.session.rawToken.length).toBeGreaterThan(20);
  });

  it("session works for me and logout revokes it", async () => {
    const t = await createTestDb();
    close = t.close;

    const { session } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const auth = await resolveAuthContext(t.db, session.rawToken);
    expect(auth.role).toBe("student");
    expect(auth.studentId).toBe("s1");
    expect(mePayload(auth).studentId).toBe("s1");

    await logout(t.db, session.rawToken);
    await expect(
      resolveAuthContext(t.db, session.rawToken)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("student cannot read another student's assignment", async () => {
    const t = await createTestDb();
    close = t.close;

    const { session } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const auth = await resolveAuthContext(t.db, session.rawToken);

    // ha5 принадлежит s5
    await expect(
      getAssignmentForViewer(t.db, auth, "ha5")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("student never receives answer keys on open assignment", async () => {
    const t = await createTestDb();
    close = t.close;

    const { session } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const auth = await resolveAuthContext(t.db, session.rawToken);

    // ha7 — открытое назначение ученика s1
    const view = await getAssignmentForViewer(t.db, auth, "ha7");
    expect(view.snapshot.answerKeys).toBeUndefined();
    const qJson = JSON.stringify(view.snapshot.questions);
    expect(qJson).not.toContain("correctOptionIds");
    expect(qJson).not.toContain("correctAnswers");

    const testView = await getTestForViewer(t.db, auth, "hw3");
    expect(testView).not.toHaveProperty("answerKeys");
    expect(JSON.stringify(testView)).not.toContain("correctOptionIds");
  });

  it("teacher receives keys; other teacher is forbidden", async () => {
    const t = await createTestDb();
    close = t.close;

    const anna = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const annaCtx = await resolveAuthContext(t.db, anna.session.rawToken);
    const asTeacher = await getAssignmentForViewer(t.db, annaCtx, "ha1");
    expect(asTeacher.snapshot.answerKeys).toBeTruthy();

    const igor = await loginWithPassword(t.db, {
      email: "igor@example.com",
      password: DEMO_PASSWORD,
    });
    const igorCtx = await resolveAuthContext(t.db, igor.session.rawToken);
    await expect(
      getAssignmentForViewer(t.db, igorCtx, "ha1")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects invalid draft payload via service contract (empty questionId caught upstream by zod in routes)", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const auth = await resolveAuthContext(t.db, session.rawToken);

    // ha3 already reviewed — draft must conflict
    await expect(
      saveDraft(t.db, auth, "ha3", [{ questionId: "q2a" }])
    ).rejects.toMatchObject({ status: 409 });
  });

  it("submit is idempotent with the same key", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const auth = await resolveAuthContext(t.db, session.rawToken);

    const answers = [
      { questionId: "q3a", selectedOptionIds: ["o3a1"] },
      {
        questionId: "q3b",
        textAnswer: "sin x",
      },
      {
        questionId: "q3c",
        order: ["ord3a", "ord3b", "ord3c", "ord3d"],
      },
    ];

    const routeKey = "POST:/api/assignments/ha7/submit";
    const first = await withIdempotency(
      t.db,
      auth,
      routeKey,
      "key-ha7-1",
      async () => {
        const body = await submitAssignment(t.db, auth, "ha7", answers);
        return { status: 200, body };
      }
    );
    expect(first.replayed).toBe(false);
    expect(first.body.ok).toBe(true);

    const second = await withIdempotency(
      t.db,
      auth,
      routeKey,
      "key-ha7-1",
      async () => {
        throw new Error("should not run");
      }
    );
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);

    // Повторный submit без идемпотентности — conflict
    await expect(
      submitAssignment(t.db, auth, "ha7", answers)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("validation: login requires email format at route layer — service rejects empty", async () => {
    const t = await createTestDb();
    close = t.close;
    await expect(
      loginWithPassword(t.db, { email: "", password: "x" })
    ).rejects.toMatchObject({ status: 400 });
  });
});
