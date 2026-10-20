import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { getRawSessionToken } from "@/server/http/request";
import { logout } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const token = await getRawSessionToken(request);
    await logout(db, token);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
