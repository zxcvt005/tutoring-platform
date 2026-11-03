import type { MembershipRole } from "@/lib/auth/roles";

/** Роли с полным доступом к школьной базе знаний (общие данные дирекции и ассистента). */
export const SCHOOL_KNOWLEDGE_ROLES = ["director", "assistant"] as const;

export type SchoolKnowledgeRole = (typeof SCHOOL_KNOWLEDGE_ROLES)[number];

export function canManageSchoolKnowledgeBase(
  role: MembershipRole | string | null | undefined
): boolean {
  return role === "director" || role === "assistant";
}

/** Дирекция и ассистент в рамках материалов организации (как директор в базе знаний). */
export function isOrgKnowledgeStaff(
  role: MembershipRole | string | null | undefined
): boolean {
  return canManageSchoolKnowledgeBase(role);
}
