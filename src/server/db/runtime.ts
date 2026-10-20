import { createDb, requireDatabaseUrl } from "@/server/db/client";
import type { AppDb } from "@/server/db/types";

type PostgresHandle = ReturnType<typeof createDb>;

let handle: PostgresHandle | null = null;
let testOverride: AppDb | null = null;

/** Подмена БД в unit/integration-тестах (PGlite). */
export function setDbForTests(db: AppDb | null) {
  testOverride = db;
}

export function getDb(): AppDb {
  if (testOverride) return testOverride;
  if (!handle) {
    handle = createDb(requireDatabaseUrl());
  }
  return handle.db;
}

export async function closeDb(): Promise<void> {
  if (handle) {
    await handle.sql.end({ timeout: 5 });
    handle = null;
  }
}
