import { and, count, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  defaultProductId,
  FORMULA_TRAINER_PRODUCT_DESCRIPTION,
  FORMULA_TRAINER_PRODUCT_NAME,
  FORMULA_TRAINER_PRODUCT_SLUG,
  isImplementedProductSlug,
  slugifyProductName,
} from "@/lib/products";
import type { Product } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles, requireStudentProfile } from "@/server/authz/require";
import {
  products,
  studentTariffAssignments,
  tariffProducts,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, forbidden, notFound, validationError } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  return code === "23505" || /unique|duplicate key/i.test(message);
}

function toProduct(
  row: typeof products.$inferSelect,
  tariffCount = 0,
  tariffNames: string[] = []
): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isActive: row.isActive,
    implemented: isImplementedProductSlug(row.slug),
    tariffCount,
    tariffNames,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadTariffProductIdsByTariff(
  db: AppDb,
  organizationId: string
): Promise<Map<string, string[]>> {
  const links = await db
    .select({
      tariffId: tariffProducts.tariffId,
      productId: tariffProducts.productId,
    })
    .from(tariffProducts)
    .where(eq(tariffProducts.organizationId, organizationId));
  const map = new Map<string, string[]>();
  for (const link of links) {
    const list = map.get(link.tariffId) ?? [];
    list.push(link.productId);
    map.set(link.tariffId, list);
  }
  return map;
}

export async function ensureDefaultProducts(db: AppDb, organizationId: string) {
  const [existing] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.slug, FORMULA_TRAINER_PRODUCT_SLUG)
      )
    )
    .limit(1);
  if (existing) return existing;

  const id = defaultProductId(organizationId, FORMULA_TRAINER_PRODUCT_SLUG);
  const now = new Date();
  try {
    await db.insert(products).values({
      id,
      organizationId,
      name: FORMULA_TRAINER_PRODUCT_NAME,
      slug: FORMULA_TRAINER_PRODUCT_SLUG,
      description: FORMULA_TRAINER_PRODUCT_DESCRIPTION,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.slug, FORMULA_TRAINER_PRODUCT_SLUG)
      )
    )
    .limit(1);
  if (!row) {
    throw new Error("Не удалось зарегистрировать продукт тренажёра формул");
  }
  return row;
}

export async function listProducts(db: AppDb, ctx: AuthContext): Promise<Product[]> {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.organizationId, ctx.organizationId))
    .orderBy(desc(products.createdAt));

  const counts = await db
    .select({
      productId: tariffProducts.productId,
      n: count(),
    })
    .from(tariffProducts)
    .where(eq(tariffProducts.organizationId, ctx.organizationId))
    .groupBy(tariffProducts.productId);
  const countMap = new Map(counts.map((c) => [c.productId, Number(c.n)]));

  const namedLinks = await db
    .select({
      productId: tariffProducts.productId,
      tariffName: tariffs.name,
    })
    .from(tariffProducts)
    .innerJoin(tariffs, eq(tariffs.id, tariffProducts.tariffId))
    .where(eq(tariffProducts.organizationId, ctx.organizationId));
  const namesMap = new Map<string, string[]>();
  for (const link of namedLinks) {
    const list = namesMap.get(link.productId) ?? [];
    list.push(link.tariffName);
    namesMap.set(link.productId, list);
  }

  return rows.map((row) =>
    toProduct(row, countMap.get(row.id) ?? 0, namesMap.get(row.id) ?? [])
  );
}

export type UpsertProductInput = {
  id?: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
};

export async function upsertProduct(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertProductInput
) {
  requireRoles(ctx, ["director"]);
  const name = input.name.trim();
  if (!name) throw validationError("Укажите название продукта");
  const description = (input.description ?? "").trim();

  if (input.id) {
    const [existing] = await db
      .select()
      .from(products)
      .where(eq(products.id, input.id))
      .limit(1);
    if (!existing || existing.organizationId !== ctx.organizationId) {
      throw notFound("Продукт не найден");
    }
    await db
      .update(products)
      .set({
        name,
        description,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));
    return { id: existing.id };
  }

  const baseSlug = slugifyProductName(name);
  const slug = await uniqueProductSlug(db, ctx.organizationId, baseSlug);
  const id = newId("prd");
  const now = new Date();
  try {
    await db.insert(products).values({
      id,
      organizationId: ctx.organizationId,
      name,
      slug,
      description,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("Продукт с таким идентификатором уже есть");
    }
    throw err;
  }
  return { id };
}

async function uniqueProductSlug(
  db: AppDb,
  organizationId: string,
  base: string
): Promise<string> {
  const existing = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.organizationId, organizationId));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 72);
    if (!taken.has(candidate)) return candidate;
  }
  throw conflict("Не удалось подобрать уникальный идентификатор продукта");
}

export async function replaceTariffProducts(
  db: AppDb,
  organizationId: string,
  tariffId: string,
  productIds: string[]
) {
  const uniqueIds = [
    ...new Set(
      productIds
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0)
    ),
  ];
  if (uniqueIds.length > 0) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          inArray(products.id, uniqueIds)
        )
      );
    if (rows.length !== uniqueIds.length) {
      throw validationError("Один или несколько продуктов не найдены");
    }
  }

  await db
    .delete(tariffProducts)
    .where(
      and(
        eq(tariffProducts.tariffId, tariffId),
        eq(tariffProducts.organizationId, organizationId)
      )
    );

  if (uniqueIds.length === 0) return;

  await db.insert(tariffProducts).values(
    uniqueIds.map((productId) => ({
      tariffId,
      productId,
      organizationId,
    }))
  );
}

function pickCurrentAssignment<
  T extends { status: string; paymentStatus: string; startsAt: Date },
>(rows: T[]): T | null {
  const list = [...rows].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime()
  );
  return (
    list.find((a) => a.status === "active" && a.paymentStatus === "paid") ??
    list[0] ??
    null
  );
}

export async function studentAccessibleProductSlugs(
  db: AppDb,
  ctx: AuthContext
): Promise<string[]> {
  if (ctx.role !== "student" || !ctx.studentId) return [];

  const assignments = await db
    .select({
      tariffId: studentTariffAssignments.tariffId,
      status: studentTariffAssignments.status,
      paymentStatus: studentTariffAssignments.paymentStatus,
      startsAt: studentTariffAssignments.startsAt,
    })
    .from(studentTariffAssignments)
    .where(
      and(
        eq(studentTariffAssignments.studentId, ctx.studentId),
        eq(studentTariffAssignments.organizationId, ctx.organizationId)
      )
    );

  const current = pickCurrentAssignment(assignments);
  if (!current) return [];

  const links = await db
    .select({
      productId: tariffProducts.productId,
    })
    .from(tariffProducts)
    .where(
      and(
        eq(tariffProducts.tariffId, current.tariffId),
        eq(tariffProducts.organizationId, ctx.organizationId)
      )
    );
  if (links.length === 0) return [];

  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, ctx.organizationId),
        inArray(
          products.id,
          links.map((l) => l.productId)
        )
      )
    );

  return rows
    .filter((row) => row.isActive && isImplementedProductSlug(row.slug))
    .map((row) => row.slug);
}

export async function studentHasProductAccess(
  db: AppDb,
  ctx: AuthContext,
  slug: string
): Promise<boolean> {
  const slugs = await studentAccessibleProductSlugs(db, ctx);
  return slugs.includes(slug);
}

export async function requireStudentProductAccess(
  db: AppDb,
  ctx: AuthContext,
  slug: string
) {
  await requireStudentProfile(ctx);
  if (!(await studentHasProductAccess(db, ctx, slug))) {
    throw forbidden("Продукт недоступен по текущему тарифу");
  }
}
