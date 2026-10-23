/**
 * Правила окружения для auth.
 *
 * Обычный production: демо-вход запрещён, даже при ALLOW_DEMO_LOGIN=1.
 * Открытое тестирование: явный ALLOW_OPEN_TEST_LOGIN=1 включает существующий
 * демо-вход при NODE_ENV=production (без смены runtime на development).
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Явный флаг открытого тестового сайта. Не путать с ALLOW_DEMO_LOGIN. */
export function isOpenTestLoginEnabled(): boolean {
  return process.env.ALLOW_OPEN_TEST_LOGIN === "1";
}

/**
 * Демо-вход (переключатель тестовых аккаунтов и /api/auth/demo).
 * В обычном production выключен. Включается либо вне production
 * (ALLOW_DEMO_LOGIN), либо флагом открытого теста.
 */
export function isDemoLoginAllowed(): boolean {
  if (isOpenTestLoginEnabled()) return true;
  if (isProductionRuntime()) return false;
  if (process.env.ALLOW_DEMO_LOGIN === "0") return false;
  if (process.env.ALLOW_DEMO_LOGIN === "1") return true;
  return process.env.NODE_ENV === "development";
}

/** Секрет одноразового bootstrap первого директора (не коммитить). */
export function getBootstrapAdminToken(): string | null {
  const t = process.env.BOOTSTRAP_ADMIN_TOKEN?.trim();
  return t && t.length >= 24 ? t : null;
}

export function getAppBaseUrl(): string | null {
  const u = process.env.APP_BASE_URL?.trim();
  return u || null;
}
