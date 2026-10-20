/**
 * Правила окружения для auth.
 * Демо-вход в production запрещён всегда — ALLOW_DEMO_LOGIN не может его включить.
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Демо-вход разрешён только вне production и только при явном ALLOW_DEMO_LOGIN=1
 * (или по умолчанию в development, если переменная не задана).
 */
export function isDemoLoginAllowed(): boolean {
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
