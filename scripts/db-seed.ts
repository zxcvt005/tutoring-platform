import { config as loadEnv } from "dotenv";

import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import {
  DEMO_ORG_ID,
  DEMO_ORG_SLUG,
  seedDemoOrganization,
} from "../src/server/db/seed";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Отказ: npm run db:seed нельзя запускать при NODE_ENV=production (демо-пароли)."
    );
  }

  const url = requireDatabaseUrl();
  const { db, sql } = createDb(url);

  const encRows = await sql<{ server_encoding: string }[]>`SHOW server_encoding`;
  const enc = String(encRows[0]?.server_encoding ?? "").toUpperCase();
  const win1251Safe = enc.includes("WIN125") || enc === "SQL_ASCII";
  if (win1251Safe) {
    console.log(
      `server_encoding=${enc}: seed с win1251Safe (математические символы нормализуются)`
    );
  }

  console.log(`Seeding demo org ${DEMO_ORG_ID} (${DEMO_ORG_SLUG}) …`);
  await seedDemoOrganization(db, { win1251Safe });
  console.log("Seed OK — только demo-организация; другие данные не трогались.");
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
