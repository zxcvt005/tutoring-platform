import { canManageSchoolKnowledgeBase } from "@/lib/auth/school-knowledge";

import type { AuthContext } from "@/server/authz/context";
import { forbidden } from "@/server/errors";

export function requireSchoolKnowledgeBase(ctx: AuthContext): void {
  if (!canManageSchoolKnowledgeBase(ctx.role)) throw forbidden();
}
