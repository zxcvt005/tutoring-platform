import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { idempotencyKeys } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict } from "@/server/errors";

const PENDING_STATUS = 102;
const PENDING_BODY = { __pending: true as const };

function isUniqueViolation(err: unknown): boolean {
  const candidate = err as {
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const code = candidate.code ?? candidate.cause?.code;
  if (code === "23505") return true;
  return /unique|duplicate key/i.test(String(candidate.message ?? ""));
}

function isPendingBody(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { __pending?: boolean }).__pending === true
  );
}

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

async function waitForCompletedResponse(
  db: AppDb,
  ctx: AuthContext,
  routeKey: string,
  requestKey: string
): Promise<{ status: number; body: unknown } | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const row = await findIdempotentResponse(db, ctx, routeKey, requestKey);
    if (row && !isPendingBody(row.body) && row.status !== PENDING_STATUS) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

/**
 * Выполняет критическую операцию один раз на ключ.
 * Повтор с тем же Idempotency-Key возвращает сохранённый ответ.
 * Без ключа защита не действует (вызывающий обязан передать ключ для create).
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

  const existing = await findIdempotentResponse(db, ctx, routeKey, requestKey);
  if (existing && !isPendingBody(existing.body) && existing.status !== PENDING_STATUS) {
    return {
      status: existing.status,
      body: existing.body as T,
      replayed: true,
    };
  }
  if (existing && (isPendingBody(existing.body) || existing.status === PENDING_STATUS)) {
    const completed = await waitForCompletedResponse(db, ctx, routeKey, requestKey);
    if (completed) {
      return {
        status: completed.status,
        body: completed.body as T,
        replayed: true,
      };
    }
    throw conflict(
      "Операция уже выполняется. Подождите несколько секунд и повторите."
    );
  }

  const claimId = `idem_${randomBytes(12).toString("hex")}`;
  try {
    await db.insert(idempotencyKeys).values({
      id: claimId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      routeKey,
      requestKey,
      responseStatus: PENDING_STATUS,
      responseBody: PENDING_BODY,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const completed = await waitForCompletedResponse(db, ctx, routeKey, requestKey);
    if (completed) {
      return {
        status: completed.status,
        body: completed.body as T,
        replayed: true,
      };
    }
    throw conflict(
      "Операция уже выполняется. Подождите несколько секунд и повторите."
    );
  }

  try {
    const result = await run();
    await db
      .update(idempotencyKeys)
      .set({
        responseStatus: result.status,
        responseBody: result.body as Record<string, unknown>,
      })
      .where(
        and(
          eq(idempotencyKeys.userId, ctx.userId),
          eq(idempotencyKeys.routeKey, routeKey),
          eq(idempotencyKeys.requestKey, requestKey)
        )
      );
    return { ...result, replayed: false };
  } catch (err) {
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, ctx.userId),
          eq(idempotencyKeys.routeKey, routeKey),
          eq(idempotencyKeys.requestKey, requestKey)
        )
      );
    throw err;
  }
}
