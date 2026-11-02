/** Имена cookie — без зависимостей от Node/DB (можно импортировать в middleware). */
export const SESSION_COOKIE = "tp_session";
/** Отдельный вход на /private-calls. Не сессия кабинета. */
export const PRIVATE_HOST_COOKIE = "tp_private_host";
/** Гость одной комнаты по ссылке /join. Не пользователь платформы. */
export const PRIVATE_GUEST_COOKIE = "tp_private_guest";
/** Исходная сессия администратора на время impersonation (httpOnly). */
export const IMPERSONATOR_COOKIE = "tp_impersonator";
export const CSRF_COOKIE = "tp_csrf";
export const CSRF_HEADER = "x-csrf-token";
