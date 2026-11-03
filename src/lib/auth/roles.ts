/** Роли membership в организации. Кабинеты: director→Дирекция, teacher→Кафедра, student→Аудитория, press→Пресса, assistant→Ассистент. */
export const MEMBERSHIP_ROLES = [
  "director",
  "teacher",
  "student",
  "press",
  "assistant",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export function isMembershipRole(value: string): value is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

export function cabinetHomeForRole(role: MembershipRole): string {
  if (role === "teacher") return "/kafedra";
  if (role === "student") return "/auditoria";
  if (role === "press") return "/pressa";
  if (role === "assistant") return "/assistent";
  return "/direkciya";
}

export function roleFromCabinetPath(
  pathname: string | null
): MembershipRole {
  if (pathname?.startsWith("/kafedra")) return "teacher";
  if (pathname?.startsWith("/auditoria")) return "student";
  if (pathname?.startsWith("/pressa")) return "press";
  if (pathname?.startsWith("/assistent")) return "assistant";
  return "director";
}

export const CABINET_PREFIXES = [
  "/direkciya",
  "/kafedra",
  "/auditoria",
  "/pressa",
  "/assistent",
] as const;
