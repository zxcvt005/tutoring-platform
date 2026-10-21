/**
 * Явно разрешённый seed тестовой школы на БД Timeweb.
 *
 * Не подменяет NODE_ENV. Не удаляет всю базу — только организацию org_school_qa.
 * Локальный npm run db:seed:school по-прежнему отказывается от облачных хостов.
 *
 * Обязательные переменные:
 *   ALLOW_TIMEWEB_TEST_SEED=1
 *   TIMEWEB_TEST_SEED_ORG=org_school_qa
 *   TIMEWEB_TEST_SEED_DB=<точное имя базы из DATABASE_URL>
 *
 *   npm run db:migrate
 *   node scripts/db-print-target.mjs
 *   ALLOW_TIMEWEB_TEST_SEED=1 TIMEWEB_TEST_SEED_ORG=org_school_qa TIMEWEB_TEST_SEED_DB='…' npm run db:seed:school:timeweb
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  TIMEWEB_ALLOWED_ORG_ID,
  assertTimewebTestDatabase,
  redactConnectionString,
} from "./lib/seed-safety";
import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import { sanitizeDbError } from "../src/server/db/database-url";
import {
  SCHOOL_ORG_ID,
  SCHOOL_ORG_SLUG,
  seedSchoolOrganization,
  verifySchoolOrganization,
} from "../src/server/db/seed-school";

function loadEnvFile(filename: string) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  if (SCHOOL_ORG_ID !== TIMEWEB_ALLOWED_ORG_ID) {
    throw new Error("Внутренняя ошибка: SCHOOL_ORG_ID не совпадает с разрешённой организацией.");
  }

  const url = requireDatabaseUrl();
  const safety = assertTimewebTestDatabase(url);
  console.log(
    `Timeweb school seed → org ${SCHOOL_ORG_ID} (${SCHOOL_ORG_SLUG}) @ ${safety.hostname}/${safety.database}`
  );
  console.log(`Connection: ${redactConnectionString(url)}`);
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} (не изменяется)`);

  const { db, sql } = createDb(url);
  try {
    await sql`select 1 as ok`;
    const seeded = await seedSchoolOrganization(db);
    const { stats, errors } = await verifySchoolOrganization(db);
    console.log("School seed wrote:", JSON.stringify(seeded, null, 2));
    console.log("Verify counts:", JSON.stringify(stats, null, 2));
    if (errors.length) {
      console.error("Verify failed:");
      for (const e of errors) console.error(`- ${e}`);
      process.exit(1);
    }
    console.log("Timeweb school seed OK. Связи учеников, преподавателей, занятий, тарифов и платежей проверены.");
    console.log(
      "Вход: /login → director@umba-school.test | morozova@umba-school.test | student01@umba-school.test"
    );
    console.log("Пароль: SCHOOL_PASSWORD / DEMO_PASSWORD в коде (значение не печатаем).");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const safe = sanitizeDbError(err);
  console.error(safe.message);
  process.exit(1);
});
