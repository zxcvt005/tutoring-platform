import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/constants";

const CABINET_PREFIXES = ["/direkciya", "/kafedra", "/auditoria"];

/**
 * В production кабинеты требуют cookie сессии.
 * В development демо-вход может создать сессию на клиенте — middleware не блокирует.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isCabinet = CABINET_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isCabinet) return NextResponse.next();

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/direkciya/:path*", "/kafedra/:path*", "/auditoria/:path*"],
};
