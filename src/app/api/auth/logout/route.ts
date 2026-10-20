import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/server/auth/csrf";
import {
  clearSessionCookieOptions,
  IMPERSONATOR_COOKIE,
  SESSION_COOKIE,
} from "@/server/auth/session";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { getRawSessionToken } from "@/server/http/request";
import { logout } from "@/server/services/auth-service";

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function POST(request: Request) {
  try {
    // Logout: Origin достаточно; CSRF cookie может отсутствовать после смены сессии
    assertSameOrigin(request);
    const db = getDb();
    const token = await getRawSessionToken(request);
    const adminToken = readCookie(request, IMPERSONATOR_COOKIE);
    await logout(db, token);
    // Полный выход: также отзываем cookie исходной admin-сессии (без восстановления)
    if (adminToken) {
      await logout(db, adminToken);
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());
    res.cookies.set(IMPERSONATOR_COOKIE, "", clearSessionCookieOptions());
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
