import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/constants";
import { isDemoLoginAllowed } from "@/server/auth/env";

const CABINET_PREFIXES = ["/direkciya", "/kafedra", "/auditoria"];

/**
 * Обычный production: кабинеты требуют cookie сессии.
 * Dev и открытый тест (ALLOW_OPEN_TEST_LOGIN=1): middleware не блокирует —
 * сессию создаёт существующий демо-вход на клиенте.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isCabinet = CABINET_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isCabinet) return NextResponse.next();

  if (isDemoLoginAllowed()) {
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
