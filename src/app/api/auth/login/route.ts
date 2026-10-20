import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import {
  assertLoginNotRateLimited,
  recordLoginAttempt,
} from "@/server/auth/rate-limit";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { ApiError, jsonError } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const db = getDb();
  const meta = getClientMeta(request);
  let emailForLog = "";

  try {
    assertMutatingRequest(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    emailForLog = body.email;

    await assertLoginNotRateLimited(db, {
      email: body.email,
      ip: meta.ip,
    });

    const { user, session } = await loginWithPassword(db, {
      email: body.email,
      password: body.password,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    await recordLoginAttempt(db, {
      email: body.email,
      ip: meta.ip,
      success: true,
    });

    const ctx = await resolveAuthContext(db, session.rawToken);
    const me = mePayload(ctx);
    const res = NextResponse.json({
      user,
      organizationId: me.organizationId,
      role: me.role,
      teacherId: me.teacherId,
      studentId: me.studentId,
    });
    res.cookies.set(
      SESSION_COOKIE,
      session.rawToken,
      sessionCookieOptions(session.expiresAt)
    );
    return res;
  } catch (err) {
    if (emailForLog) {
      const isAuthFail =
        err instanceof ApiError &&
        (err.status === 401 || err.code === "unauthorized");
      if (isAuthFail) {
        try {
          await recordLoginAttempt(db, {
            email: emailForLog,
            ip: meta.ip,
            success: false,
          });
        } catch {
          /* ignore secondary errors */
        }
      }
    }
    return jsonError(err);
  }
}
