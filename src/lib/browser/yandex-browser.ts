/**
 * Определение Яндекс Браузера для сценария оплаты.
 *
 * Яндекс Браузер — Chromium-fork: в UA всегда есть Chrome/… и Safari/…,
 * отличительный токен — YaBrowser/. Проверка Chrome первой дала бы ложный Chrome.
 *
 * Не считаем Яндекс Браузером:
 * - Google Chrome / Chromium без YaBrowser
 * - встроенный Google app (GSA)
 * - Safari
 * - приложения Яндекса без токена браузера (YaApp_*, YaSearchApp) —
 *   это не desktop/mobile YaBrowser
 */

export const STUDENT_LOGIN_URL = "https://neodinschool.ru/login";

export type UserAgentBrand = { brand: string; version?: string };

const YANDEX_UA_TOKEN = /YaBrowser\//i;
const YANDEX_BRAND = /^Yandex(\s+Browser)?$/i;
const GREASE_BRAND = /^Not[_\s.?].*Brand$/i;

/** Чистая проверка по строке UA (удобно для тестов). */
export function isYandexBrowserUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").trim();
  if (!ua) return false;
  return YANDEX_UA_TOKEN.test(ua);
}

/** Client Hints brands: бренд Yandex / Yandex Browser, без GREASE. */
export function isYandexBrowserBrands(
  brands: UserAgentBrand[] | null | undefined
): boolean {
  if (!Array.isArray(brands) || brands.length === 0) return false;
  return brands.some((item) => {
    const brand = String(item?.brand ?? "").trim();
    if (!brand || GREASE_BRAND.test(brand)) return false;
    return YANDEX_BRAND.test(brand);
  });
}

/**
 * Доступна ли оплата в этом окружении.
 * true только при надёжном признаке Яндекс Браузера.
 * При сомнении — false (кнопку оплаты не показываем).
 */
export function isYandexBrowserEnvironment(input?: {
  userAgent?: string | null;
  brands?: UserAgentBrand[] | null;
}): boolean {
  if (isYandexBrowserBrands(input?.brands)) return true;
  if (isYandexBrowserUserAgent(input?.userAgent)) return true;
  return false;
}

/** Клиентский снимок: UA + userAgentData.brands при наличии. */
export function detectYandexBrowserFromWindow(
  win: Pick<Window, "navigator"> | null | undefined = typeof window !== "undefined"
    ? window
    : undefined
): boolean {
  if (!win?.navigator) return false;
  const nav = win.navigator as Navigator & {
    userAgentData?: { brands?: UserAgentBrand[] };
  };
  return isYandexBrowserEnvironment({
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands ?? null,
  });
}
