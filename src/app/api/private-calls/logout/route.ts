import { NextResponse } from "next/server";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { jsonError } from "@/server/errors";
import {
  PRIVATE_HOST_COOKIE,
  clearPrivateCookieOptions,
} from "@/server/private-calls/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PRIVATE_HOST_COOKIE, "", clearPrivateCookieOptions());
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
