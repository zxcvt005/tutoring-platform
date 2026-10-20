import { NextResponse } from "next/server";
import { z } from "zod";

import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";
import { resolveAuthContext } from "@/server/authz/context";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const db = getDb();
    const raw = await readJsonBody(request);
    const body = parseBody(bodySchema, raw);
    const meta = getClientMeta(request);

    const { user, session } = await loginWithPassword(db, {
      email: body.email,
      password: body.password,
      userAgent: meta.userAgent,
      ip: meta.ip,
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
    return jsonError(err);
  }
}
