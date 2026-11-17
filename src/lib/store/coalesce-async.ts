/**
 * Склеивает частые вызовы в один: ждёт delayMs тишины, затем выполняет fn.
 * Если во время выполнения пришли новые запросы — после завершения делает ещё один проход.
 */
export function createCoalescedAsync<T>(
  fn: () => Promise<T>,
  delayMs = 250
): () => Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiters: Array<{
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }> = [];
  let running = false;

  async function flush() {
    running = true;
    try {
      while (waiters.length > 0) {
        const batch = waiters;
        waiters = [];
        try {
          const result = await fn();
          for (const w of batch) w.resolve(result);
        } catch (err) {
          for (const w of batch) w.reject(err);
        }
      }
    } finally {
      running = false;
      if (waiters.length > 0) {
        void flush();
      }
    }
  }

  return function schedule(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiters.push({ resolve, reject });
      if (running) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    });
  };
}
