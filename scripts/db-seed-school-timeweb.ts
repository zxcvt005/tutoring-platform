/**
 * Seed тестовой школы на БД Timeweb (только org_school_qa).
 *
 *   ALLOW_TIMEWEB_TEST_SEED=1 TIMEWEB_TEST_SEED_ORG=org_school_qa npm run db:seed:school:timeweb
 *
 * Не меняет NODE_ENV. Не удаляет всю базу. Локальный db:seed:school облако по-прежнему блокирует.
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
    throw new Error("SCHOOL_ORG_ID не совпадает с разрешённой организацией.");
  }

  const url = requireDatabaseUrl();
  const safety = assertTimewebTestDatabase(url);
  console.log(
    `Timeweb school seed → org ${SCHOOL_ORG_ID} (${SCHOOL_ORG_SLUG}) @ ${safety.hostname}/${safety.database}`
  );
  console.log(`Connection: ${redactConnectionString(url)}`);

  const { db, sql } = createDb(url);
  try {
    await sql`select 1 as ok`;
    const seeded = await seedSchoolOrganization(db);
    const { stats, errors } = await verifySchoolOrganization(db);
    console.log("Seed:", JSON.stringify(seeded));
    console.log("Verify:", JSON.stringify(stats));
    if (errors.length) {
      console.error("Verify failed:");
      for (const e of errors) console.error(`- ${e}`);
      process.exit(1);
    }
    console.log("Timeweb school seed OK");
    console.log(
      "Login: director@umba-school.test | morozova@umba-school.test | student01@umba-school.test"
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(sanitizeDbError(err).message);
  process.exit(1);
});
