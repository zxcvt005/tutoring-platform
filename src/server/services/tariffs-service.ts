import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { TariffFeatureKey, TariffStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  learningDirections,
  lessonOrders,
  tariffPurchaseOptions,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";
import {
  loadTariffProductIdsByTariff,
  replaceTariffProducts,
} from "@/server/services/products-service";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

const FEATURE_KEYS = new Set<string>([
  "individual_lessons",
  "homework",
  "group_calls",
  "intensives",
  "extra_materials",
  "extra_tests",
]);

function normalizeFeatures(raw: unknown): TariffFeatureKey[] {
  if (!Array.isArray(raw)) return ["individual_lessons", "homework"];
  return raw
    .filter((x): x is string => typeof x === "string" && FEATURE_KEYS.has(x))
    .map((x) => x as TariffFeatureKey);
}

export type TariffPurchaseOptionInput = {
  id?: string;
  lessonsCount: number;
  totalPrice: number;
  sortOrder: number;
  isActive: boolean;
};

export type UpsertTariffInput = {
  id?: string;
  directionId: string;
  name: string;
  includesText?: string | null;
  features?: string[];
  status?: TariffStatus;
  adminNotes?: string | null;
  productIds?: string[];
  purchaseOptions?: TariffPurchaseOptionInput[];
};

async function loadOrgDirection(
  db: AppDb,
  ctx: AuthContext,
  directionId: string
) {
  const [row] = await db
    .select()
    .from(learningDirections)
    .where(
      and(
        eq(learningDirections.id, directionId),
        eq(learningDirections.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Направление не найдено");
  if (row.status !== "active") {
    throw validationError("Нельзя привязать тариф к архивному направлению");
  }
  return row;
}

export async function replacePurchaseOptions(
  db: AppDb,
  organizationId: string,
  tariffId: string,
  options: TariffPurchaseOptionInput[]
) {
  if (options.length === 0) {
    throw validationError("Добавьте хотя бы один вариант покупки");
  }
  for (const opt of options) {
    if (!opt.lessonsCount || opt.lessonsCount < 1) {
      throw validationError("Количество занятий должно быть не меньше 1");
    }
    if (!(opt.totalPrice >= 0) || Number.isNaN(opt.totalPrice)) {
      throw validationError("Некорректная сумма варианта покупки");
    }
  }

  const existing = await db
    .select()
    .from(tariffPurchaseOptions)
    .where(
      and(
        eq(tariffPurchaseOptions.organizationId, organizationId),
        eq(tariffPurchaseOptions.tariffId, tariffId)
      )
    );
  const incomingIds = new Set(
    options.map((o) => o.id).filter((x): x is string => Boolean(x))
  );
  const toDelete = existing
    .filter((row) => !incomingIds.has(row.id))
    .map((row) => row.id);
  if (toDelete.length > 0) {
    await db
      .delete(tariffPurchaseOptions)
      .where(inArray(tariffPurchaseOptions.id, toDelete));
  }

  const now = new Date();
  for (const opt of options) {
    const values = {
      organizationId,
      tariffId,
      lessonsCount: opt.lessonsCount,
      totalPrice: String(opt.totalPrice),
      sortOrder: opt.sortOrder,
      isActive: opt.isActive,
      updatedAt: now,
    };
    if (opt.id) {
      await db
        .update(tariffPurchaseOptions)
        .set(values)
        .where(eq(tariffPurchaseOptions.id, opt.id));
    } else {
      await db.insert(tariffPurchaseOptions).values({
        id: newId("tpo"),
        ...values,
        createdAt: now,
      });
    }
  }
}

export async function listTariffs(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(tariffs)
    .where(eq(tariffs.organizationId, ctx.organizationId))
    .orderBy(desc(tariffs.createdAt));

  const directionRows = await db
    .select()
    .from(learningDirections)
    .where(eq(learningDirections.organizationId, ctx.organizationId));
  const directionById = new Map(directionRows.map((d) => [d.id, d]));

  const optionRows = await db
    .select()
    .from(tariffPurchaseOptions)
    .where(eq(tariffPurchaseOptions.organizationId, ctx.organizationId))
    .orderBy(tariffPurchaseOptions.sortOrder, tariffPurchaseOptions.lessonsCount);
  const optionsByTariff = new Map<string, typeof optionRows>();
  for (const opt of optionRows) {
    const list = optionsByTariff.get(opt.tariffId) ?? [];
    list.push(opt);
    optionsByTariff.set(opt.tariffId, list);
  }

  const orderCounts = await db
    .select({
      tariffId: lessonOrders.tariffId,
      n: count(),
    })
    .from(lessonOrders)
    .where(
      and(
        eq(lessonOrders.organizationId, ctx.organizationId),
        sql`${lessonOrders.status} in ('awaiting_payment', 'paid')`
      )
    )
    .groupBy(lessonOrders.tariffId);
  const orderCountMap = new Map(
    orderCounts.map((c) => [c.tariffId, Number(c.n)])
  );

  const productIdsByTariff = await loadTariffProductIdsByTariff(
    db,
    ctx.organizationId
  );

  return rows.map((t) => {
    const direction = directionById.get(t.directionId);
    const options = (optionsByTariff.get(t.id) ?? []).map((o) => ({
      id: o.id,
      tariffId: o.tariffId,
      lessonsCount: o.lessonsCount,
      totalPrice: Number(o.totalPrice),
      sortOrder: o.sortOrder,
      isActive: o.isActive,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }));
    return {
      id: t.id,
      directionId: t.directionId,
      name: t.name,
      price: t.price != null ? Number(t.price) : undefined,
      currency: "RUB" as const,
      durationDays: t.durationDays ?? undefined,
      lessonsLimit: t.lessonsLimit ?? undefined,
      weeklyFrequency: t.weeklyFrequency,
      includesText: t.includesText ?? undefined,
      features: (t.features as TariffFeatureKey[]) ?? [],
      status: t.status as TariffStatus,
      adminNotes: t.adminNotes ?? undefined,
      activeOrderCount: orderCountMap.get(t.id) ?? 0,
      purchaseOptions: options,
      productIds: productIdsByTariff.get(t.id) ?? [],
      directionName: direction?.name,
    };
  });
}

export async function upsertTariff(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertTariffInput
) {
  requireRoles(ctx, ["director"]);
  const name = input.name.trim();
  if (!name) throw validationError("Укажите название тарифа");
  if (!input.directionId?.trim()) {
    throw validationError("Укажите направление обучения");
  }
  await loadOrgDirection(db, ctx, input.directionId.trim());
  const features = normalizeFeatures(input.features);
  const id = input.id ?? newId("tariff");
  const [existing] = input.id
    ? await db.select().from(tariffs).where(eq(tariffs.id, id)).limit(1)
    : [];

  const values = {
    id,
    organizationId: ctx.organizationId,
    directionId: input.directionId.trim(),
    name,
    includesText: input.includesText?.trim() || null,
    features,
    status: (input.status ?? "active") as TariffStatus,
    adminNotes: input.adminNotes?.trim() || null,
    updatedAt: new Date(),
  };

  return db.transaction(async (tx) => {
    const conn = tx as unknown as AppDb;
    if (existing) {
      if (existing.organizationId !== ctx.organizationId) throw forbidden();
      await conn.update(tariffs).set(values).where(eq(tariffs.id, id));
    } else {
      await conn.insert(tariffs).values({
        ...values,
        currency: "RUB",
        weeklyFrequency: 1,
        createdAt: new Date(),
      });
    }
    if (input.productIds !== undefined) {
      await replaceTariffProducts(
        conn,
        ctx.organizationId,
        id,
        input.productIds
      );
    }
    if (input.purchaseOptions !== undefined) {
      await replacePurchaseOptions(
        conn,
        ctx.organizationId,
        id,
        input.purchaseOptions
      );
    }
    return { id };
  });
}

export async function archiveTariff(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director"]);
  const [row] = await db.select().from(tariffs).where(eq(tariffs.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  await db
    .update(tariffs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(tariffs.id, id));
  return { ok: true as const };
}

/** Совместимость: срок действия пакетов больше не отслеживается здесь. */
export async function refreshExpiredAssignments(
  db: AppDb,
  organizationId: string
) {
  void db;
  void organizationId;
}