/** Имена cookie — без зависимостей от Node/DB (можно импортировать в middleware). */
export const SESSION_COOKIE = "tp_session";
/** Исходная сессия администратора на время impersonation (httpOnly). */
export const IMPERSONATOR_COOKIE = "tp_impersonator";
export const CSRF_COOKIE = "tp_csrf";
export const CSRF_HEADER = "x-csrf-token";
