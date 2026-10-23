/**
 * Безопасное наполнение локальной БД демонстрационной школой Неодин (QA).
 *
 * Условия запуска:
 * - NODE_ENV !== production
 * - ALLOW_TEST_SEED=1
 * - DATABASE_URL указывает на localhost и разрешённое имя БД
 *
 * Не подключайтесь к Timeweb / production. Скрипт откажется сам.
 *
 * Идемпотентность: пересоздаёт только организацию org_school_qa.
 * Существующий org_demo не затрагивается.
 *
 *   $env:ALLOW_TEST_SEED="1"; npm run db:seed:school
 */
import { config as loadEnv } from "dotenv";

import { assertSafeTestDatabase, redactConnectionString } from "./lib/seed-safety";
import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import { sanitizeDbError } from "../src/server/db/database-url";
import {
  SCHOOL_ORG_ID,
  SCHOOL_ORG_SLUG,
  seedSchoolOrganization,
} from "../src/server/db/seed-school";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const url = requireDatabaseUrl();
  const safety = assertSafeTestDatabase(url);
  console.log(
    `School QA seed → org ${SCHOOL_ORG_ID} (${SCHOOL_ORG_SLUG}) @ ${safety.hostname}/${safety.database}`
  );
  console.log(`Connection: ${redactConnectionString(url)}`);

  const { db, sql } = createDb(url);
  try {
    // Быстрая проверка доступности без вывода секретов
    await sql`select 1 as ok`;
    const encRows = await sql<{ server_encoding: string }[]>`SHOW server_encoding`;
    const enc = String(encRows[0]?.server_encoding ?? "").toUpperCase();
    const win1251Safe = enc.includes("WIN125") || enc === "SQL_ASCII";
    const stats = await seedSchoolOrganization(db, new Date(), { win1251Safe });
    console.log("School QA seed OK.");
    console.log(
      JSON.stringify(
        {
          ...stats,
          loginHint:
            "director@umba-school.test / morozova@umba-school.test / student01@umba-school.test",
          passwordHint:
            "тот же DEMO_PASSWORD / SCHOOL_PASSWORD, что в src/server/db/seed.ts (значение не печатаем)",
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const safe = sanitizeDbError(err);
  console.error(safe.message);
  if (/ECONNREFUSED|connect/i.test(safe.message)) {
    console.error("Подсказка: сначала запустите локальную БД — npm run db:up");
  }
  process.exit(1);
});
