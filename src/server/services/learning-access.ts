import { and, desc, eq } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import { lessonOrders } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import type { TariffFeatureKey } from "@/lib/types";
import {
  getDirectionBalance,
  getDirectionBalancesMap,
} from "@/server/services/lesson-balance";

export type LearningAccessResult = {
  allowed: boolean;
  reason:
    | "ok"
    | "no_assignment"
    | "unpaid"
    | "exhausted"
    | "missing_feature"
    | "access_revoked"
    | "cancelled"
    | "paused"
    | "expired";
  assignmentId: string | null;
  orderId: string | null;
  directionId: string | null;
  endsAt: string | null;
  remaining: number | null;
  features: TariffFeatureKey[];
};

type PaidOrderRow = {
  id: string;
  directionId: string;
  featuresSnapshot: string[];
  productIdsSnapshot: string[];
};

function featureList(snapshot: string[]): TariffFeatureKey[] {
  return snapshot as TariffFeatureKey[];
}

async function loadPaidOrders(
  db: AppDb,
  organizationId: string,
  studentId: string
): Promise<PaidOrderRow[]> {
  const rows = await db
    .select({
      id: lessonOrders.id,
      directionId: lessonOrders.directionId,
      featuresSnapshot: lessonOrders.featuresSnapshot,
      productIdsSnapshot: lessonOrders.productIdsSnapshot,
    })
    .from(lessonOrders)
    .where(
      and(
        eq(lessonOrders.organizationId, organizationId),
        eq(lessonOrders.studentId, studentId),
        eq(lessonOrders.status, "paid"),
        eq(lessonOrders.accessRevoked, false)
      )
    )
    .orderBy(desc(lessonOrders.paidAt));

  return rows.map((r) => ({
    id: r.id,
    directionId: r.directionId,
    featuresSnapshot: (r.featuresSnapshot ?? []) as string[],
    productIdsSnapshot: (r.productIdsSnapshot ?? []) as string[],
  }));
}

function mergeFeatures(orders: PaidOrderRow[]): TariffFeatureKey[] {
  const set = new Set<TariffFeatureKey>();
  for (const o of orders) {
    for (const f of featureList(o.featuresSnapshot)) set.add(f);
  }
  return [...set];
}

/**
 * Оплаченный заказ с нужной возможностью и положительным остатком по направлению заказа.
 */
export async function studentHasFeature(
  db: AppDb,
  organizationId: string,
  studentId: string,
  feature: TariffFeatureKey,
  directionId?: string | null
): Promise<{ has: boolean; orderId: string | null; directionId: string | null; remaining: number | null }> {
  const orders = await loadPaidOrders(db, organizationId, studentId);
  const eligible = orders.filter((o) =>
    o.featuresSnapshot.includes(feature)
  );

  if (eligible.length === 0) {
    return { has: false, orderId: null, directionId: null, remaining: null };
  }

  const directionIds = [
    ...new Set(
      (directionId
        ? eligible.filter((o) => o.directionId === directionId)
        : eligible
      ).map((o) => o.directionId)
    ),
  ];

  const balances = await getDirectionBalancesMap(
    db,
    organizationId,
    studentId,
    directionIds
  );

  for (const order of directionId
    ? eligible.filter((o) => o.directionId === directionId)
    : eligible) {
    const remaining = balances.get(order.directionId) ?? 0;
    if (remaining > 0) {
      return {
        has: true,
        orderId: order.id,
        directionId: order.directionId,
        remaining,
      };
    }
  }

  const bestOrder = (directionId ? eligible.find((o) => o.directionId === directionId) : eligible[0]) ?? null;
  const rem =
    bestOrder != null
      ? (balances.get(bestOrder.directionId) ?? 0)
      : null;

  return {
    has: false,
    orderId: bestOrder?.id ?? null,
    directionId: bestOrder?.directionId ?? directionId ?? null,
    remaining: rem,
  };
}

/**
 * Доступ к платным материалам: оплаченный заказ с возможностью + остаток > 0 по направлению.
 */
export async function resolveLearningAccess(
  db: AppDb,
  organizationId: string,
  studentId: string,
  feature?: TariffFeatureKey,
  directionId?: string | null
): Promise<LearningAccessResult> {
  const orders = await loadPaidOrders(db, organizationId, studentId);
  const features = mergeFeatures(orders);

  const base = (
    reason: LearningAccessResult["reason"],
    partial: Partial<LearningAccessResult> = {}
  ): LearningAccessResult => ({
    allowed: false,
    reason,
    assignmentId: partial.orderId ?? null,
    orderId: partial.orderId ?? null,
    directionId: partial.directionId ?? directionId ?? null,
    endsAt: null,
    remaining: partial.remaining ?? null,
    features,
    ...partial,
  });

  if (orders.length === 0) {
    return base("no_assignment");
  }

  if (feature && !features.includes(feature)) {
    return base("missing_feature", { features });
  }

  if (feature) {
    const check = await studentHasFeature(
      db,
      organizationId,
      studentId,
      feature,
      directionId
    );
    if (!check.has) {
      const reason =
        check.remaining != null && check.remaining <= 0
          ? "exhausted"
          : "missing_feature";
      return base(reason, {
        orderId: check.orderId,
        directionId: check.directionId,
        remaining: check.remaining,
        features,
      });
    }
    return {
      allowed: true,
      reason: "ok",
      assignmentId: check.orderId,
      orderId: check.orderId,
      directionId: check.directionId,
      endsAt: null,
      remaining: check.remaining,
      features,
    };
  }

  const directionIds = [...new Set(orders.map((o) => o.directionId))];
  const balances = await getDirectionBalancesMap(
    db,
    organizationId,
    studentId,
    directionIds
  );
  let bestRemaining: number | null = null;
  let bestOrder: PaidOrderRow | null = null;
  for (const order of orders) {
    const remaining = balances.get(order.directionId) ?? 0;
    if (remaining > 0) {
      bestOrder = order;
      bestRemaining = remaining;
      break;
    }
    if (bestRemaining == null || remaining > bestRemaining) {
      bestRemaining = remaining;
      bestOrder = order;
    }
  }

  if (bestRemaining == null || bestRemaining <= 0) {
    return base("exhausted", {
      orderId: bestOrder?.id ?? null,
      directionId: bestOrder?.directionId ?? null,
      remaining: bestRemaining,
    });
  }

  return {
    allowed: true,
    reason: "ok",
    assignmentId: bestOrder?.id ?? null,
    orderId: bestOrder?.id ?? null,
    directionId: bestOrder?.directionId ?? null,
    endsAt: null,
    remaining: bestRemaining,
    features,
  };
}

export async function assertStudentLearningAccess(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  feature: TariffFeatureKey,
  directionId?: string | null
) {
  const { forbidden } = await import("@/server/errors");
  const access = await resolveLearningAccess(
    db,
    ctx.organizationId,
    studentId,
    feature,
    directionId
  );
  if (!access.allowed) {
    throw forbidden(
      access.reason === "exhausted"
        ? "Материалы недоступны: занятия по направлению закончились. Продлите пакет."
        : access.reason === "missing_feature"
          ? "Обучение недоступно: возможность не входит в оплаченный пакет"
          : access.reason === "no_assignment"
            ? "Обучение недоступно: нет оплаченного пакета занятий"
            : "Обучение недоступно по условиям пакета"
    );
  }
  return access;
}

/** Остаток по направлению (удобная обёртка для UI и API). */
export async function remainingForDirection(
  db: AppDb,
  organizationId: string,
  studentId: string,
  directionId: string
) {
  const balance = await getDirectionBalance(
    db,
    organizationId,
    studentId,
    directionId
  );
  return balance.remaining;
}