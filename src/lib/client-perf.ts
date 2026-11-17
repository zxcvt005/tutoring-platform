/**
 * Минимальная клиентская диагностика: длительность и параллелизм запросов.
 * Не логирует тела ответов, токены и персональные данные.
 */

let inflight = 0;

export function getInflightRequestCount(): number {
  return inflight;
}

export async function trackClientRequest<T>(
  label: string,
  run: () => Promise<T>
): Promise<T> {
  inflight += 1;
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await run();
  } finally {
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.round(ended - started);
    const concurrent = inflight;
    inflight = Math.max(0, inflight - 1);
    if (durationMs >= 800 || concurrent >= 3) {
      console.info("[client-timing]", {
        label,
        durationMs,
        concurrent,
        remaining: inflight,
      });
    }
  }
}

export function reportClientError(source: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[client-error]", {
    source,
    message: message.slice(0, 300),
  });
}
