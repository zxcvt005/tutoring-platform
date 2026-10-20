import { NextResponse } from "next/server";

import { assertMutatingRequest } from "@/server/auth/csrf";
import {
  clearSessionCookieOptions,
  IMPERSONATOR_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { getRawSessionToken } from "@/server/http/request";
import { mePayload } from "@/server/services/auth-service";
import { stopImpersonation } from "@/server/services/impersonation-service";

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const db = getDb();
    const impersonationToken = await getRawSessionToken(request);
    const adminToken = readCookie(request, IMPERSONATOR_COOKIE);

    const result = await stopImpersonation(db, {
      impersonationRawToken: impersonationToken,
      adminRawToken: adminToken,
    });

    const ctx = await resolveAuthContext(db, result.adminRawToken);
    const me = mePayload(ctx);

    const res = NextResponse.json({
      ...me,
      redirectTo: "/direkciya",
    });
    res.cookies.set(
      SESSION_COOKIE,
      result.adminRawToken,
      sessionCookieOptions(result.adminExpiresAt)
    );
    res.cookies.set(IMPERSONATOR_COOKIE, "", clearSessionCookieOptions());
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
