import { and, desc, eq } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  studentTariffAssignments,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import type { TariffFeatureKey } from "@/lib/types";

export type LearningAccessResult = {
  allowed: boolean;
  reason:
    | "ok"
    | "no_assignment"
    | "unpaid"
    | "expired"
    | "cancelled"
    | "paused"
    | "missing_feature";
  assignmentId: string | null;
  endsAt: string | null;
  features: TariffFeatureKey[];
};

/**
 * Доступ к платному обучению: оплаченное действующее назначение + feature key.
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

  if (rows.length === 0) {
    return {
      allowed: false,
      reason: "no_assignment",
      assignmentId: null,
      endsAt: null,
      features: [],
    };
  }

  // Берём наиболее релевантное: active+paid, иначе свежее
  const activePaid = rows.find(
    (r) =>
      r.status === "active" &&
      r.paymentStatus === "paid" &&
      r.endsAt > now &&
      r.startsAt <= now
  );
  const current = activePaid ?? rows[0]!;
  const features = (current.features as TariffFeatureKey[]) ?? [];

  if (current.status === "cancelled") {
    return {
      allowed: false,
      reason: "cancelled",
      assignmentId: current.id,
      endsAt: current.endsAt.toISOString(),
      features,
    };
  }
  if (current.status === "paused") {
    return {
      allowed: false,
      reason: "paused",
      assignmentId: current.id,
      endsAt: current.endsAt.toISOString(),
      features,
    };
  }
  if (
    current.status === "expired" ||
    current.endsAt <= now ||
    (current.paymentStatus === "paid" && current.endsAt <= now)
  ) {
    return {
      allowed: false,
      reason: "expired",
      assignmentId: current.id,
      endsAt: current.endsAt.toISOString(),
      features,
    };
  }
  if (
    current.paymentStatus !== "paid" ||
    current.status === "pending_payment"
  ) {
    return {
      allowed: false,
      reason: "unpaid",
      assignmentId: current.id,
      endsAt: current.endsAt.toISOString(),
      features,
    };
  }
  if (feature && !features.includes(feature)) {
    return {
      allowed: false,
      reason: "missing_feature",
      assignmentId: current.id,
      endsAt: current.endsAt.toISOString(),
      features,
    };
  }
  return {
    allowed: true,
    reason: "ok",
    assignmentId: current.id,
    endsAt: current.endsAt.toISOString(),
    features,
  };
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
        : access.reason === "expired"
          ? "Обучение недоступно: срок тарифа истёк"
          : access.reason === "no_assignment"
            ? "Обучение недоступно: тариф не назначен"
            : "Обучение недоступно по условиям тарифа"
    );
  }
  return access;
}
