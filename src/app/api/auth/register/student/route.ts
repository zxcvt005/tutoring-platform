import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { mePayload } from "@/server/services/auth-service";
import { registerStudent } from "@/server/services/registration-service";

const bodySchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
  passwordConfirm: z.string().min(1).max(200),
  contacts: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const meta = getClientMeta(request);
    const db = getDb();

    const result = await registerStudent(db, {
      ...body,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const ctx = await resolveAuthContext(db, result.session.rawToken);
    const me = mePayload(ctx);
    const res = NextResponse.json({
      user: result.user,
      organizationId: me.organizationId,
      role: me.role,
      teacherId: me.teacherId,
      studentId: me.studentId,
    });
    res.cookies.set(
      SESSION_COOKIE,
      result.session.rawToken,
      sessionCookieOptions(result.session.expiresAt)
    );
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
