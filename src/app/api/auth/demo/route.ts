import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { isDemoLoginAllowed } from "@/server/auth/env";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { forbidden, jsonError } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";
import {
  DEMO_LOGIN_PASSWORD,
  resolveDemoLoginEmail,
} from "@/server/services/demo-accounts";

/**
 * Демо-вход для локальной разработки и открытого теста.
 * Обычный production: запрещён (даже при ALLOW_DEMO_LOGIN=1).
 * Открытый тест: ALLOW_OPEN_TEST_LOGIN=1.
 */
const bodySchema = z.object({
  role: z.enum(["director", "teacher", "student"]),
  teacherId: z.string().optional(),
  studentId: z.string().optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    if (!isDemoLoginAllowed()) {
      throw forbidden("Демо-вход отключён");
    }
    assertMutatingRequest(request);

    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const meta = getClientMeta(request);

    const email = await resolveDemoLoginEmail(db, body);

    const { user, session } = await loginWithPassword(db, {
      email,
      password: DEMO_LOGIN_PASSWORD,
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
