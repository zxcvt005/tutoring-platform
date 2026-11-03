import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { CABINET_PREFIXES } from "@/lib/auth/roles";
import { SESSION_COOKIE } from "@/server/auth/constants";

/**
 * Кабинеты требуют cookie сессии.
 * Роль проверяет серверный layout: чужой кабинет туда не пускает.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isCabinet = CABINET_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isCabinet) return NextResponse.next();

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
  matcher: [
    "/direkciya/:path*",
    "/kafedra/:path*",
    "/auditoria/:path*",
    "/pressa/:path*",
    "/assistent/:path*",
  ],
};
