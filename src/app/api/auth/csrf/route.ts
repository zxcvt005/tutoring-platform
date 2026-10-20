import { NextResponse } from "next/server";

import {
  CSRF_COOKIE,
  createCsrfToken,
  csrfCookieOptions,
} from "@/server/auth/csrf";

/** Выдаёт CSRF-токен (double-submit cookie). */
export async function GET() {
  const token = createCsrfToken();
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(CSRF_COOKIE, token, csrfCookieOptions());
  return res;
}
