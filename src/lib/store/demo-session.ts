import { roleFromCabinetPath, type MembershipRole } from "@/lib/auth/roles";

export type CabinetRole = MembershipRole;

/**
 * Serializes overlapping demo boots so a stale apiDemoLogin cannot
 * overwrite the cookie after the latest cabinet switch has finished.
 */
export function createSerialAsyncQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

/** Tab-only: explicit «Выйти» must not be followed by silent demo auto-login. */
export const DEMO_SKIP_AUTO_LOGIN_KEY = "tp.demo.skipAutoLogin";

export function demoSessionStorage(): Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberDemoExplicitLogout(
  storage: Pick<Storage, "setItem"> | null = demoSessionStorage()
) {
  storage?.setItem(DEMO_SKIP_AUTO_LOGIN_KEY, "1");
}

export function clearDemoSkipAutoLogin(
  storage: Pick<Storage, "removeItem"> | null = demoSessionStorage()
) {
  storage?.removeItem(DEMO_SKIP_AUTO_LOGIN_KEY);
}

export function hasDemoSkipAutoLogin(
  storage: Pick<Storage, "getItem"> | null = demoSessionStorage()
): boolean {
  return storage?.getItem(DEMO_SKIP_AUTO_LOGIN_KEY) === "1";
}

/**
 * Страницы без platform-сессии: login/register, инвайты орг, личные звонки.
 * `/join/*` и `/private-calls` используют свои cookie (гость/хост), не кабинетный login.
 */
export function isDemoPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname === "/private-calls" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/demo") ||
    pathname === "/join" ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/private-calls/")
  );
}

/** Public pages vs cabinet role — used so in-cabinet navigation does not re-login. */
export function demoSessionBootKey(
  pathname: string | null
): "public" | MembershipRole {
  if (isDemoPublicPath(pathname)) return "public";
  return roleFromCabinetPath(pathname);
}

/**
 * Автологин в тестовый аккаунт по умолчанию — только если сессии нет.
 * Действующую сессию фильтрами интерфейса не перезаписываем.
 */
export function shouldDefaultDemoLogin(input: {
  demoLoginEnabled: boolean;
  hasSession: boolean;
  skipAutoLogin?: boolean;
}): boolean {
  return (
    input.demoLoginEnabled && !input.hasSession && !input.skipAutoLogin
  );
}

/**
 * Смена кабинета (Дирекция / Кафедра / Аудитория) при уже существующей сессии.
 * Не используется для подмены ученика/преподавателя на sch_s01 / sch_t1 при refresh.
 */
export function shouldSwitchDemoCabinet(input: {
  demoLoginEnabled: boolean;
  hasSession: boolean;
  pathRole: CabinetRole;
  sessionRole?: string | null;
}): boolean {
  if (!input.demoLoginEnabled || !input.hasSession || !input.sessionRole) {
    return false;
  }
  return input.sessionRole !== input.pathRole;
}
