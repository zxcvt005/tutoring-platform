import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Создаёт клиент PostgreSQL.
 * Не вызывается из UI — только из скриптов / будущего server layer.
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
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
