import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin } from "@/server/auth/csrf";
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
import {
  bootstrapFirstAdmin,
  needsBootstrapAdmin,
} from "@/server/services/bootstrap-admin-service";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";

const bodySchema = z.object({
  token: z.string().min(24).max(200),
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  fullName: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
  organizationSlug: z.string().max(80).optional(),
});

export async function GET() {
  try {
    const needs = await needsBootstrapAdmin(getDb());
    return NextResponse.json({ needsBootstrap: needs });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const created = await bootstrapFirstAdmin(db, body);

    const meta = getClientMeta(request);
    const { session } = await loginWithPassword(db, {
      email: created.email,
      password: body.password,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    const ctx = await resolveAuthContext(db, session.rawToken);
    const me = mePayload(ctx);

    const res = NextResponse.json({
      ok: true,
      organizationId: created.organizationId,
      user: me.user,
      role: me.role,
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
