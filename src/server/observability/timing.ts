/**
 * Лёгкий серверный тайминг. Без PII, паролей и тел запросов.
 */

const SLOW_MS = 500;

export function logServerTiming(input: {
  route: string;
  action?: string;
  durationMs: number;
  ok: boolean;
  role?: string | null;
  organizationId?: string | null;
}) {
  if (input.ok && input.durationMs < SLOW_MS) return;
  console.info(
    "[server-timing]",
    JSON.stringify({
      route: input.route,
      action: input.action,
      durationMs: Math.round(input.durationMs),
      ok: input.ok,
      role: input.role ?? undefined,
      org: input.organizationId ? "set" : undefined,
    })
  );
}

export async function withServerTiming<T>(
  meta: {
    route: string;
    action?: string;
    role?: string | null;
    organizationId?: string | null;
  },
  run: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    logServerTiming({
      ...meta,
      durationMs: Date.now() - started,
      ok: true,
    });
    return result;
  } catch (err) {
    logServerTiming({
      ...meta,
      durationMs: Date.now() - started,
      ok: false,
    });
    throw err;
  }
}
