import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { idempotencyKeys } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export async function findIdempotentResponse(
  db: AppDb,
  ctx: AuthContext,
  routeKey: string,
  requestKey: string
): Promise<{ status: number; body: unknown } | null> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, ctx.userId),
        eq(idempotencyKeys.routeKey, routeKey),
        eq(idempotencyKeys.requestKey, requestKey)
      )
    )
    .limit(1);
  if (!row) return null;
  return { status: row.responseStatus, body: row.responseBody };
}

export async function saveIdempotentResponse(
  db: AppDb,
  ctx: AuthContext,
  routeKey: string,
  requestKey: string,
  status: number,
  body: unknown
): Promise<void> {
  await db.insert(idempotencyKeys).values({
    id: `idem_${randomBytes(12).toString("hex")}`,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    routeKey,
    requestKey,
    responseStatus: status,
    responseBody: body as Record<string, unknown>,
  });
}

/**
 * Выполняет критическую операцию один раз на ключ.
 * Повтор с тем же Idempotency-Key возвращает сохранённый ответ.
 */
export async function withIdempotency<T>(
  db: AppDb,
  ctx: AuthContext,
  routeKey: string,
  requestKey: string | null,
  run: () => Promise<{ status: number; body: T }>
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!requestKey) {
    const result = await run();
    return { ...result, replayed: false };
  }

  const existing = await findIdempotentResponse(
    db,
    ctx,
    routeKey,
    requestKey
  );
  if (existing) {
    return {
      status: existing.status,
      body: existing.body as T,
      replayed: true,
    };
  }

  const result = await run();
  await saveIdempotentResponse(
    db,
    ctx,
    routeKey,
    requestKey,
    result.status,
    result.body
  );
  return { ...result, replayed: false };
}
