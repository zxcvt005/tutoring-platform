import { and, desc, eq } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  studentTariffAssignments,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import type { TariffFeatureKey } from "@/lib/types";
import { getAssignmentBalance } from "@/server/services/lesson-balance";

export type LearningAccessResult = {
  allowed: boolean;
  reason:
    | "ok"
    | "no_assignment"
    | "unpaid"
    | "expired"
    | "exhausted"
    | "cancelled"
    | "paused"
    | "missing_feature";
  assignmentId: string | null;
  endsAt: string | null;
  remaining: number | null;
  features: TariffFeatureKey[];
};

/**
 * Доступ к платному обучению: оплаченное активное назначение + остаток занятий.
 * Прогнозируемая дата окончания не блокирует доступ.
 * Вход в кабинет и просмотр статуса тарифа этим не блокируются.
 */
export async function resolveLearningAccess(
  db: AppDb,
  organizationId: string,
  studentId: string,
  feature?: TariffFeatureKey
): Promise<LearningAccessResult> {
  const now = new Date();
  const rows = await db
    .select({
      id: studentTariffAssignments.id,
      status: studentTariffAssignments.status,
      paymentStatus: studentTariffAssignments.paymentStatus,
      endsAt: studentTariffAssignments.endsAt,
      startsAt: studentTariffAssignments.startsAt,
      lessonsLimitSnapshot: studentTariffAssignments.lessonsLimitSnapshot,
      features: tariffs.features,
    })
    .from(studentTariffAssignments)
    .innerJoin(tariffs, eq(studentTariffAssignments.tariffId, tariffs.id))
    .where(
      and(
        eq(studentTariffAssignments.organizationId, organizationId),
        eq(studentTariffAssignments.studentId, studentId)
      )
    )
    .orderBy(desc(studentTariffAssignments.startsAt))
    .limit(8);

  const empty = (
    reason: LearningAccessResult["reason"]
  ): LearningAccessResult => ({
    allowed: false,
    reason,
    assignmentId: null,
    endsAt: null,
    remaining: null,
    features: [],
  });

  if (rows.length === 0) return empty("no_assignment");

  const activePaid = rows.find(
    (r) =>
      r.status === "active" &&
      r.paymentStatus === "paid" &&
      r.startsAt <= now
  );
  const current = activePaid ?? rows[0]!;
  const features = (current.features as TariffFeatureKey[]) ?? [];
  const base = {
    assignmentId: current.id,
    endsAt: current.endsAt.toISOString(),
    remaining: null as number | null,
    features,
  };

  if (current.status === "cancelled") {
    return { allowed: false, reason: "cancelled", ...base };
  }
  if (current.status === "paused") {
    return { allowed: false, reason: "paused", ...base };
  }
  if (
    current.paymentStatus !== "paid" ||
    current.status === "pending_payment"
  ) {
    return { allowed: false, reason: "unpaid", ...base };
  }
  if (current.status === "expired" && !activePaid) {
    return { allowed: false, reason: "expired", ...base };
  }

  const balance = await getAssignmentBalance(
    db,
    current.id,
    current.lessonsLimitSnapshot
  );
  base.remaining = balance.remaining;

  if (balance.remaining != null && balance.remaining <= 0) {
    return { allowed: false, reason: "exhausted", ...base };
  }
  if (feature && !features.includes(feature)) {
    return { allowed: false, reason: "missing_feature", ...base };
  }
  return { allowed: true, reason: "ok", ...base };
}

export async function assertStudentLearningAccess(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  feature: TariffFeatureKey
) {
  const { forbidden } = await import("@/server/errors");
  const access = await resolveLearningAccess(
    db,
    ctx.organizationId,
    studentId,
    feature
  );
  if (!access.allowed) {
    throw forbidden(
      access.reason === "unpaid"
        ? "Обучение недоступно: тариф не оплачен"
        : access.reason === "exhausted"
          ? "Обучение недоступно: занятия по тарифу закончились"
          : access.reason === "expired"
            ? "Обучение недоступно: срок тарифа истёк"
            : access.reason === "no_assignment"
              ? "Обучение недоступно: тариф не назначен"
              : "Обучение недоступно по условиям тарифа"
    );
  }
  return access;
}
