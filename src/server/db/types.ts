import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/db/schema";

type Schema = typeof schema;

/** Общий тип БД для сервисов (postgres.js в рантайме, PGlite в тестах). */
export type AppDb = PostgresJsDatabase<Schema> | PgliteDatabase<Schema>;
