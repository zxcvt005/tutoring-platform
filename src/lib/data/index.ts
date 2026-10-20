import { createApiDataProvider } from "@/lib/data/api-provider";
import { createLocalDataProvider } from "@/lib/data/local-provider";
import type { DataMode, DataProvider } from "@/lib/data/types";

export type { DataMode, DataProvider, SessionUser, AssignmentView } from "@/lib/data/types";
export { createApiDataProvider } from "@/lib/data/api-provider";
export { createLocalDataProvider } from "@/lib/data/local-provider";

/**
 * Фабрика провайдера. По умолчанию api (PostgreSQL).
 * local — только legacy/тесты; кабинеты используют DemoStore → /api/*.
 */
export function createDataProvider(
  mode: DataMode = (process.env.NEXT_PUBLIC_DATA_MODE as DataMode) || "api"
): DataProvider {
  if (mode === "local") return createLocalDataProvider();
  return createApiDataProvider();
}
