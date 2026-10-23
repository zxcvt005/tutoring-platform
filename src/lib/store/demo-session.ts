export type CabinetRole = "director" | "teacher" | "student";

/**
 * Автологин в тестовый аккаунт по умолчанию — только если сессии нет.
 * Действующую сессию фильтрами интерфейса не перезаписываем.
 */
export function shouldDefaultDemoLogin(input: {
  demoLoginEnabled: boolean;
  hasSession: boolean;
}): boolean {
  return input.demoLoginEnabled && !input.hasSession;
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
