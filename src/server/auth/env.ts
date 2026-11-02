/**
 * Правила окружения для auth.
 * Демо-вход закрыт и в production, и локально.
 * ALLOW_DEMO_LOGIN и ALLOW_OPEN_TEST_LOGIN его не включают.
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Флаг больше не открывает демо-вход. Оставлен, чтобы старые окружения не падали. */
export function isOpenTestLoginEnabled(): boolean {
  return process.env.ALLOW_OPEN_TEST_LOGIN === "1";
}

/** Публичный демо-вход и переключатель тестовых аккаунтов отключены. */
export function isDemoLoginAllowed(): boolean {
  return false;
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
