import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertMemoryRateLimit,
  resetMemoryRateLimitForTests,
} from "@/server/auth/rate-limit";
import { reportCameraBackgroundDiagAction } from "@/server/services/platform-mutations";
import type { AuthContext } from "@/server/authz/context";
import { ApiError } from "@/server/errors";

afterEach(() => {
  resetMemoryRateLimitForTests();
});

function ctx(role: AuthContext["role"] = "teacher"): AuthContext {
  return {
    userId: "user_diag_1",
    email: "t@example.com",
    fullName: "T",
    organizationId: "org_1",
    role,
    teacherId: role === "teacher" ? "tea_1" : null,
    studentId: role === "student" ? "stu_1" : null,
    sessionId: "sess_1",
    impersonation: null,
  };
}

describe("memory rate limit", () => {
  it("allows up to max then throws rate_limited", () => {
    const key = "test:diag";
    for (let i = 0; i < 3; i += 1) {
      assertMemoryRateLimit(key, { max: 3, windowMs: 60_000, now: 1000 + i });
    }
    expect(() =>
      assertMemoryRateLimit(key, { max: 3, windowMs: 60_000, now: 1005 })
    ).toThrowError(ApiError);
  });

  it("resets after the window", () => {
    const key = "test:diag-window";
    assertMemoryRateLimit(key, { max: 1, windowMs: 1000, now: 0 });
    expect(() =>
      assertMemoryRateLimit(key, { max: 1, windowMs: 1000, now: 500 })
    ).toThrowError(ApiError);
    assertMemoryRateLimit(key, { max: 1, windowMs: 1000, now: 1500 });
  });
});

describe("reportCameraBackgroundDiagAction", () => {
  it("rejects unknown kinds and oversized payloads", async () => {
    await expect(
      reportCameraBackgroundDiagAction({} as never, ctx(), {
        kind: "not_allowed",
      })
    ).rejects.toMatchObject({ code: "bad_request" });

    const huge = { kind: "crash_breadcrumb", blob: "x".repeat(9000) };
    await expect(
      reportCameraBackgroundDiagAction({} as never, ctx(), huge)
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("accepts a small crash breadcrumb and rate-limits repeats", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const payload = {
      kind: "crash_breadcrumb",
      snapshot: {
        runId: "bg_abc",
        lastStage: "mediapipe_initialized",
        crashedLikely: true,
        stages: [{ stage: "mediapipe_initialized", t: 1 }],
      },
      events: [{ type: "init_start", detail: "isolated:background-blur" }],
    };

    for (let i = 0; i < 10; i += 1) {
      const out = await reportCameraBackgroundDiagAction(
        {} as never,
        ctx(),
        payload
      );
      expect(out).toEqual({ ok: true });
    }
    await expect(
      reportCameraBackgroundDiagAction({} as never, ctx(), payload)
    ).rejects.toMatchObject({ code: "rate_limited" });

    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls[0]?.[1] ?? {});
    expect(logged).not.toMatch(/base64|video\/|password|secret/i);
    log.mockRestore();
  });

  it("forbids press role", async () => {
    await expect(
      reportCameraBackgroundDiagAction({} as never, ctx("press"), {
        kind: "crash_breadcrumb",
      })
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
