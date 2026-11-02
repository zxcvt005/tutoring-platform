import { NextResponse } from "next/server";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, unauthorized } from "@/server/errors";
import {
  PRIVATE_GUEST_COOKIE,
  clearPrivateCookieOptions,
  readPrivateGuest,
} from "@/server/private-calls/access";
import { leavePrivateGuest } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const claims = await readPrivateGuest(request);
    if (!claims) throw unauthorized();
    await leavePrivateGuest(getDb(), claims);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PRIVATE_GUEST_COOKIE, "", clearPrivateCookieOptions());
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
