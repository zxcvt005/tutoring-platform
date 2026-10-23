/**
 * Поднимает локальный PostgreSQL (embedded-postgres), пишет .env.local,
 * применяет миграции и seed.
 *
 * Данные кластера: C:\tutoring-pg-data (или EMBEDDED_PG_DIR).
 * Повторный запуск переиспользует уже созданный кластер.
 *
 * Остановка: Ctrl+C в этом окне (или taskkill процесса на порту).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import {
  SCHOOL_ORG_ID,
  seedSchoolOrganization,
  verifySchoolOrganization,
} from "../src/server/db/seed-school";

loadEnv({ path: ".env.local" });
loadEnv();

const DATA_DIR =
  process.env.EMBEDDED_PG_DIR ??
  path.join(process.env.SystemDrive ?? "C:", "tutoring-pg-data");
const PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const PASSWORD = process.env.EMBEDDED_PG_PASSWORD ?? "postgres";
const DB_NAME = "tutoring_platform";
const DATABASE_URL = `postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
const SKIP_SEED = process.env.UMBA_SKIP_SEED === "1";

function writeEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const lines = [
    `# Сгенерировано scripts/db-up.ts — не коммитить`,
    `DATABASE_URL=${DATABASE_URL}`,
    `ALLOW_DEMO_LOGIN=1`,
    `NEXT_PUBLIC_DATA_MODE=api`,
    `EMBEDDED_PG_DIR=${DATA_DIR.replace(/\\/g, "/")}`,
    `EMBEDDED_PG_PORT=${PORT}`,
  ];
  let existing = "";
  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, "utf8");
  }
  const keep = existing
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.trim() &&
        !l.startsWith("DATABASE_URL=") &&
        !l.startsWith("ALLOW_DEMO_LOGIN=") &&
        !l.startsWith("NEXT_PUBLIC_DATA_MODE=") &&
        !l.startsWith("EMBEDDED_PG_DIR=") &&
        !l.startsWith("EMBEDDED_PG_PORT=") &&
        !l.startsWith("# Сгенерировано scripts/db-up")
    );
  fs.writeFileSync(envPath, [...lines, ...keep, ""].join("\n"), "utf8");
  console.log(`Wrote ${envPath}`);
}

async function ensureDatabase(pg: EmbeddedPostgres) {
  // создаём БД если нет
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`Created database ${DB_NAME}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exists/i.test(msg)) {
      console.log(`Database ${DB_NAME} already exists`);
    } else {
      // на некоторых версиях createDatabase не нужен / другой API
      console.log(`createDatabase: ${msg}`);
    }
  }
}

async function migrateAndSeed(connectionString: string) {
  const sqlClient = postgres(connectionString, { max: 1 });
  const db = drizzle(sqlClient, { schema });
  try {
    console.log("migrate …");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

    const encRows = await sqlClient<{ server_encoding: string }[]>`SHOW server_encoding`;
    const enc = String(encRows[0]?.server_encoding ?? "").toUpperCase();
    const win1251Safe = enc.includes("WIN125") || enc === "SQL_ASCII";
    console.log(`server_encoding=${enc} win1251Safe=${win1251Safe}`);

    if (SKIP_SEED) {
      console.log("seed пропущен (UMBA_SKIP_SEED=1)");
    } else {
      console.log(`seed школы ${SCHOOL_ORG_ID} …`);
      // Основной локальный набор: 1 директор / 3 преподавателя / 20 учеников.
      // Идемпотентно пересоздаёт только org_school_qa (не всю БД).
      const stats = await seedSchoolOrganization(db, new Date(), {
        win1251Safe,
      });
      const verify = await verifySchoolOrganization(db);
      if (verify.errors.length) {
        console.warn("Seed verify warnings:", verify.errors.join("; "));
      }
      console.log("Seed OK", JSON.stringify(stats));
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeEnvLocal();

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  console.log(`Starting embedded PostgreSQL on :${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);

  const initialise = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (initialise) {
    console.log("initdb …");
    await pg.initialise();
  }

  await pg.start();
  await ensureDatabase(pg);

  // postgres.js URL к конкретной БД
  try {
    await migrateAndSeed(DATABASE_URL);
  } catch (e) {
    // если БД не создалась через API — пробуем через postgres default db
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`First migrate attempt failed: ${msg}`);
    const admin = postgres(
      `postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres`,
      { max: 1 }
    );
    try {
      await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    } catch {
      /* exists */
    }
    await admin.end({ timeout: 5 });
    await migrateAndSeed(DATABASE_URL);
  }

  console.log("");
  console.log("PostgreSQL готов.");
  console.log(`DATABASE_URL=${DATABASE_URL}`);
  console.log("В другом терминале: npm run dev:local");
  console.log("Остановка БД: Ctrl+C в этом окне.");
  console.log("");

  const stop = async () => {
    console.log("Stopping PostgreSQL …");
    try {
      await pg.stop();
    } catch {
      try {
        execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, {
          stdio: "ignore",
        });
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  // держим процесс живым
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
