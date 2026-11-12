import { and, eq, gte, sql } from "drizzle-orm";

import { loginAttempts } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { ApiError } from "@/server/errors";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_KEY = 8;

/** In-memory limiter for authenticated non-DB endpoints (avoids login_attempts spam). */
const memoryBuckets = new Map<string, number[]>();

export function rateLimited(message = "Слишком много попыток. Подождите 15 минут.") {
  return new ApiError(429, "rate_limited", message);
}

/**
 * Sliding-window in-memory rate limit. No DB writes — safe for diagnostic spam paths.
 * @internal test helper: pass `now` to control time.
 */
export function assertMemoryRateLimit(
  key: string,
  options: { max: number; windowMs: number; now?: number; message?: string }
): void {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs;
  const prev = memoryBuckets.get(key) ?? [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= options.max) {
    memoryBuckets.set(key, recent);
    throw rateLimited(
      options.message ??
        "Слишком много диагностических запросов. Подождите немного."
    );
  }
  recent.push(now);
  memoryBuckets.set(key, recent);
  // Opportunistic cleanup of unrelated stale keys.
  if (memoryBuckets.size > 2000) {
    for (const [k, times] of memoryBuckets) {
      const kept = times.filter((t) => now - t < windowMs);
      if (kept.length === 0) memoryBuckets.delete(k);
      else memoryBuckets.set(k, kept);
    }
  }
}

/** Test-only. */
export function resetMemoryRateLimitForTests() {
  memoryBuckets.clear();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function assertLoginNotRateLimited(
  db: AppDb,
  input: { email: string; ip?: string | null }
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);
  const emailKey = `email:${normalizeEmail(input.email)}`;
  const ipKey = input.ip ? `ip:${input.ip}` : null;

  const [emailCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.key, emailKey),
        eq(loginAttempts.success, false),
        gte(loginAttempts.attemptedAt, since)
      )
    );

  if (Number(emailCount?.n ?? 0) >= MAX_FAILURES_PER_KEY) {
    throw rateLimited();
  }

  if (ipKey) {
    const [ipCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.key, ipKey),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, since)
        )
      );
    if (Number(ipCount?.n ?? 0) >= MAX_FAILURES_PER_KEY * 2) {
      throw rateLimited("Слишком много попыток с этого адреса");
    }
  }
}

export async function recordLoginAttempt(
  db: AppDb,
  input: {
    email: string;
    ip?: string | null;
    success: boolean;
  }
): Promise<void> {
  const email = normalizeEmail(input.email);
  const rows = [
    {
      id: `la_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      key: `email:${email}`,
      email,
      ip: input.ip ?? null,
      success: input.success,
    },
  ];
  if (input.ip) {
    rows.push({
      id: `la_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      key: `ip:${input.ip}`,
      email,
      ip: input.ip,
      success: input.success,
    });
  }
  await db.insert(loginAttempts).values(rows);

  // При успехе чистим недавние неудачи по email (сброс окна)
  if (input.success) {
    await db
      .delete(loginAttempts)
      .where(
        and(eq(loginAttempts.key, `email:${email}`), eq(loginAttempts.success, false))
      );
  }
}
