import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import {
  IMPERSONATOR_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { jsonError, unauthorized } from "@/server/errors";
import {
  getClientMeta,
  getRawSessionToken,
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { mePayload } from "@/server/services/auth-service";
import { cabinetHomeForRole } from "@/lib/auth/cabinets";
import {
  resolveTargetUserIdFromProfile,
  startImpersonation,
} from "@/server/services/impersonation-service";

const bodySchema = z
  .object({
    userId: z.string().min(1).max(80).optional(),
    teacherId: z.string().min(1).max(80).optional(),
    studentId: z.string().min(1).max(80).optional(),
  })
  .refine((v) => !!(v.userId || v.teacherId || v.studentId), {
    message: "Укажите userId, teacherId или studentId",
  });

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const meta = getClientMeta(request);

    const adminToken = await getRawSessionToken(request);
    if (!adminToken) {
      throw unauthorized();
    }

    const targetUserId = await resolveTargetUserIdFromProfile(db, ctx, body);
    const result = await startImpersonation(db, ctx, {
      targetUserId,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const targetCtx = await resolveAuthContext(db, result.session.rawToken);
    const me = mePayload(targetCtx);
    const home = cabinetHomeForRole(me.role);

    const res = NextResponse.json({
      ...me,
      redirectTo: home,
    });

    // Сохраняем исходную admin-сессию отдельно; cookie сессии — целевой пользователь
    res.cookies.set(
      IMPERSONATOR_COOKIE,
      adminToken,
      sessionCookieOptions(result.session.expiresAt)
    );
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
