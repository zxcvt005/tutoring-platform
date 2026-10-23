import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { postgresOptionsFromUrl } from "@/server/db/database-url";
import * as schema from "@/server/db/schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Создаёт клиент PostgreSQL.
 * URL с percent-encoded паролем разбирается в опции (без повторной склейки строки).
 */
export function createDb(connectionString: string) {
  const max =
    process.env.NODE_ENV === "production"
      ? 10
      : Number(process.env.PG_POOL_MAX ?? 4);
  const options = postgresOptionsFromUrl(connectionString, {
    max: Number.isFinite(max) && max > 0 ? max : 4,
  });
  const sql = postgres({
    ...options,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL не задан. Скопируйте .env.example → .env.local и укажите строку подключения."
    );
  }
  return url;
}
