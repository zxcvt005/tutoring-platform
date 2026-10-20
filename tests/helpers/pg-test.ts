import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/server/db/schema";
import { setDbForTests } from "@/server/db/runtime";
import {
  DEMO_PASSWORD,
  seedDemoOrganization,
} from "@/server/db/seed";
import type { AppDb } from "@/server/db/types";

export { DEMO_PASSWORD };

export async function createTestDb(): Promise<{
  db: AppDb;
  client: PGlite;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  const appDb = db as unknown as AppDb;
  await seedDemoOrganization(appDb);
  setDbForTests(appDb);
  return {
    db: appDb,
    client,
    close: async () => {
      setDbForTests(null);
      await client.close();
    },
  };
}
