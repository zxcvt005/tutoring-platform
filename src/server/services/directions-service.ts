import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { LearningDirection, LearningDirectionStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { learningDirections } from "@/server/db/schema";
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

function slugifyDirectionName(name: string): string {
  const map: Record<string, string> = {
    физика: "physics",
    математика: "math",
  };
  const lower = name.trim().toLowerCase();
  if (map[lower]) return map[lower];
  return lower
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0400-\u04ff-]/gi, "")
    .slice(0, 48) || "direction";
}

function toDirection(row: typeof learningDirections.$inferSelect): LearningDirection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as LearningDirectionStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DEFAULT_DIRECTION_SEEDS = [
  { name: "Физика", slug: "physics" },
  { name: "Математика", slug: "math" },
] as const;

export async function ensureDefaultDirections(db: AppDb, orgId: string) {
  for (const seed of DEFAULT_DIRECTION_SEEDS) {
    const [existing] = await db
      .select()
      .from(learningDirections)
      .where(
        and(
          eq(learningDirections.organizationId, orgId),
          eq(learningDirections.slug, seed.slug)
        )
      )
      .limit(1);
    if (existing) continue;
    const now = new Date();
    try {
      await db.insert(learningDirections).values({
        id: newId("ldir"),
        organizationId: orgId,
        name: seed.name,
        slug: seed.slug,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

export async function listDirections(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(learningDirections)
    .where(eq(learningDirections.organizationId, ctx.organizationId))
    .orderBy(asc(learningDirections.name));
  return rows.map(toDirection);
}

export type UpsertDirectionInput = {
  id?: string;
  name: string;
  slug?: string;
  status?: LearningDirectionStatus;
};

export async function upsertDirection(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertDirectionInput
) {
  requireRoles(ctx, ["director"]);
  const name = input.name.trim();
  if (!name) throw validationError("Укажите название направления");
  const slug = (input.slug?.trim() || slugifyDirectionName(name)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) {
    throw validationError("Некорректный slug направления");
  }
  const id = input.id ?? newId("ldir");
  const [existing] = input.id
    ? await db
        .select()
        .from(learningDirections)
        .where(eq(learningDirections.id, id))
        .limit(1)
    : [];

  const now = new Date();
  const values = {
    id,
    organizationId: ctx.organizationId,
    name,
    slug,
    status: (input.status ?? "active") as LearningDirectionStatus,
    updatedAt: now,
  };

  try {
    if (existing) {
      if (existing.organizationId !== ctx.organizationId) throw forbidden();
      await db
        .update(learningDirections)
        .set(values)
        .where(eq(learningDirections.id, id));
    } else {
      await db
        .insert(learningDirections)
        .values({ ...values, createdAt: now });
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("Направление с таким slug уже существует");
    }
    throw err;
  }

  const [row] = await db
    .select()
    .from(learningDirections)
    .where(eq(learningDirections.id, id))
    .limit(1);
  return toDirection(row!);
}

export async function archiveDirection(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requireRoles(ctx, ["director"]);
  const [row] = await db
    .select()
    .from(learningDirections)
    .where(eq(learningDirections.id, id))
    .limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  await db
    .update(learningDirections)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(learningDirections.id, id));
  return { ok: true as const };
}