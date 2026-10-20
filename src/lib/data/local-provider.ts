import type { DataProvider } from "@/lib/data/types";

/**
 * Legacy local режим. Кабинеты больше не используют этот провайдер как источник истины.
 * Кабинеты продолжают использовать useDemoStore напрямую;
 * этот провайдер — явный маркер режима и задел под единый вызов.
 */
export function createLocalDataProvider(): DataProvider {
  return {
    mode: "local",
    async me() {
      return null;
    },
  };
}
