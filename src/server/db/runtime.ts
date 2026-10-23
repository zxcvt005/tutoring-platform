import { createDb, requireDatabaseUrl } from "@/server/db/client";
import type { AppDb } from "@/server/db/types";

type PostgresHandle = ReturnType<typeof createDb>;

const GLOBAL_PG_KEY = "__neodinPostgresHandle" as const;

type GlobalPg = typeof globalThis & {
  [GLOBAL_PG_KEY]?: PostgresHandle;
};

function globalHandle(): PostgresHandle | undefined {
  return (globalThis as GlobalPg)[GLOBAL_PG_KEY];
}

function setGlobalHandle(value: PostgresHandle | undefined) {
  (globalThis as GlobalPg)[GLOBAL_PG_KEY] = value;
}

let testOverride: AppDb | null = null;

/** Подмена БД в unit/integration-тестах (PGlite). */
export function setDbForTests(db: AppDb | null) {
  testOverride = db;
}

/**
 * Один пул на процесс. Хранение на globalThis нужно, чтобы Fast Refresh /
 * HMR Next.js не создавал новый пул на каждый reload модуля — иначе
 * PostgreSQL быстро упирается в max_connections.
 */
export function getDb(): AppDb {
  if (testOverride) return testOverride;
  let handle = globalHandle();
  if (!handle) {
    handle = createDb(requireDatabaseUrl());
    setGlobalHandle(handle);
  }
  return handle.db;
}

export async function closeDb(): Promise<void> {
  const handle = globalHandle();
  if (handle) {
    await handle.sql.end({ timeout: 5 });
    setGlobalHandle(undefined);
  }
}
