/**
 * Наполняет локальную школу демо-учеником Александром.
 * Не меняет start:local:keep и не трогает чужие строки.
 * Повторный запуск безопасен: данные этого ученика пересобираются.
 *
 * Полный start:local без --keep затирает операционные данные всей школы,
 * после него скрипт нужно запустить ещё раз.
 */
import { config as loadEnv } from "dotenv";

import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import { seedDemoStudent } from "../src/server/db/seed-demo-student";
import { assertSafeTestDatabase } from "./lib/seed-safety";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Отказ: демо-ученика нельзя наполнять при NODE_ENV=production.");
  }
  const url = requireDatabaseUrl();
  const target = assertSafeTestDatabase(url);
  console.log(`Локальная БД host=${target.hostname} database=${target.database}`);
  const { db, sql } = createDb(url);
  try {
    const stats = await seedDemoStudent(db);
    console.log("Демо-ученик готов. Пароль в лог не пишется.");
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const cause =
    err && typeof err === "object" && "cause" in err
      ? (err as { cause?: { code?: string; message?: string } }).cause
      : undefined;
  console.error(err instanceof Error ? err.message : err);
  if (cause?.code || cause?.message) {
    console.error(cause.code ?? "", cause.message ?? "");
  }
  process.exit(1);
});
