/**
 * Проверка миграций и seed без внешнего PostgreSQL (PGlite).
 * Не заменяет проверку на настоящем PG / Timeweb.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../src/server/db/schema";
import { DEMO_ORG_ID, seedDemoOrganization } from "../src/server/db/seed";

const require = createRequire(import.meta.url);

async function main() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  console.log("1) migrate (empty) …");
  await migrate(db, { migrationsFolder });

  console.log("2) migrate again (idempotent) …");
  await migrate(db, { migrationsFolder });

  console.log("3) seed …");
  await seedDemoOrganization(db);

  console.log("4) seed again (re-seed demo org) …");
  await seedDemoOrganization(db);

  const [orgs] = await db.select({ n: count() }).from(schema.organizations);
  const [teachers] = await db.select({ n: count() }).from(schema.teachers);
  const [students] = await db.select({ n: count() }).from(schema.students);
  const [tests] = await db.select({ n: count() }).from(schema.tests);
  const [assignments] = await db
    .select({ n: count() })
    .from(schema.testAssignments);
  const [keys] = await db.select({ n: count() }).from(schema.testAnswerKeys);
  const [events] = await db.select({ n: count() }).from(schema.gradeEvents);

  console.log("Counts:", {
    orgId: DEMO_ORG_ID,
    organizations: orgs?.n,
    teachers: teachers?.n,
    students: students?.n,
    tests: tests?.n,
    assignments: assignments?.n,
    answerKeys: keys?.n,
    gradeEvents: events?.n,
  });

  if (Number(orgs?.n) !== 1) {
    throw new Error("Expected exactly 1 demo organization");
  }
  if (Number(teachers?.n) < 1 || Number(students?.n) < 1) {
    throw new Error("Seed produced empty teachers/students");
  }
  if (Number(keys?.n) < 1) {
    throw new Error("Expected answer keys from seed");
  }

  // sanity: drizzle-kit meta present
  const journal = require("../drizzle/meta/_journal.json") as {
    entries: unknown[];
  };
  if (!journal.entries?.length) {
    throw new Error("Missing drizzle migration journal");
  }

  console.log("PGlite verify OK");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
