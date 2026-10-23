/**
 * Один вход в локальную разработку Неодин (Windows-friendly):
 * 1) поднимает embedded PostgreSQL, если ещё не слушает порт;
 * 2) миграции;
 * 3) seed школы org_school_qa (если не UMBA_SKIP_SEED=1);
 * 4) Next.js на :43127 (не стартует второй экземпляр, если порт занят).
 *
 *   npm run start:local
 *   npm run start:local:keep   — без повторного seed
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import { parseDatabaseUrl } from "../src/server/db/database-url";
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
const PG_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const PASSWORD = process.env.EMBEDDED_PG_PASSWORD ?? "postgres";
const DB_NAME = "tutoring_platform";
const DATABASE_URL = `postgresql://postgres:${PASSWORD}@127.0.0.1:${PG_PORT}/${DB_NAME}`;
const APP_PORT = 43127;
const SKIP_SEED =
  process.env.UMBA_SKIP_SEED === "1" || process.argv.includes("--keep");

function writeEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const lines = [
    `# Сгенерировано scripts/start-local.ts — не коммитить`,
    `DATABASE_URL=${DATABASE_URL}`,
    `ALLOW_DEMO_LOGIN=1`,
    `ALLOW_TEST_SEED=1`,
    `NEXT_PUBLIC_DATA_MODE=api`,
    `EMBEDDED_PG_DIR=${DATA_DIR.replace(/\\/g, "/")}`,
    `EMBEDDED_PG_PORT=${PG_PORT}`,
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
        !l.startsWith("ALLOW_TEST_SEED=") &&
        !l.startsWith("NEXT_PUBLIC_DATA_MODE=") &&
        !l.startsWith("EMBEDDED_PG_DIR=") &&
        !l.startsWith("EMBEDDED_PG_PORT=") &&
        !l.startsWith("# Сгенерировано scripts/")
    );
  fs.writeFileSync(envPath, [...lines, ...keep, ""].join("\n"), "utf8");
}

function assertLocalUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  const host = parsed.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
      `Отказ: start:local только для локальной БД (сейчас host=${host}). Timeweb не трогаем.`
    );
  }
  if (host.includes("timeweb") || parsed.hostname.includes("twc1")) {
    throw new Error("Отказ: обнаружен хост Timeweb.");
  }
}

function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port: number, ms = 30_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Порт ${port} не открылся за ${ms} мс`);
}

async function migrateAndMaybeSeed(connectionString: string) {
  assertLocalUrl(connectionString);
  const sqlClient = postgres(connectionString, { max: 1 });
  const db = drizzle(sqlClient, { schema });
  try {
    await sqlClient`select 1 as ok`;
    console.log("migrate …");
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    if (SKIP_SEED) {
      console.log("seed пропущен (UMBA_SKIP_SEED=1)");
    } else {
      const encRows = await sqlClient<{ server_encoding: string }[]>`SHOW server_encoding`;
      const enc = String(encRows[0]?.server_encoding ?? "").toUpperCase();
      const win1251Safe = enc.includes("WIN125") || enc === "SQL_ASCII";
      console.log(`seed ${SCHOOL_ORG_ID} … encoding=${enc}`);
      const stats = await seedSchoolOrganization(db, new Date(), {
        win1251Safe,
      });
      const { errors } = await verifySchoolOrganization(db);
      console.log("Seed OK", stats);
      if (errors.length) {
        throw new Error(`Seed verify failed: ${errors.join("; ")}`);
      }
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function ensurePostgres(): Promise<{
  pg: EmbeddedPostgres | null;
  startedHere: boolean;
}> {
  writeEnvLocal();
  process.env.DATABASE_URL = DATABASE_URL;

  if (await portOpen(PG_PORT)) {
    console.log(`PostgreSQL уже слушает :${PG_PORT}`);
    await migrateAndMaybeSeed(DATABASE_URL);
    return { pg: null, startedHere: false };
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: PASSWORD,
    port: PG_PORT,
    persistent: true,
  });

  const initialise = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (initialise) {
    console.log("initdb …");
    await pg.initialise();
  }

  console.log(`Starting embedded PostgreSQL on :${PG_PORT}`);
  await pg.start();
  await waitForPort(PG_PORT);

  try {
    await pg.createDatabase(DB_NAME);
  } catch {
    /* exists */
  }

  try {
    await migrateAndMaybeSeed(DATABASE_URL);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`migrate/seed retry: ${msg}`);
    const admin = postgres(
      `postgresql://postgres:${PASSWORD}@127.0.0.1:${PG_PORT}/postgres`,
      { max: 1 }
    );
    try {
      await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    } catch {
      /* exists */
    }
    await admin.end({ timeout: 5 });
    await migrateAndMaybeSeed(DATABASE_URL);
  }

  return { pg, startedHere: true };
}

function startNext(): ChildProcess {
  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  const args = ["dev", "--webpack", "-H", "0.0.0.0", "-p", String(APP_PORT)];
  console.log(`Next.js → http://127.0.0.1:${APP_PORT}/`);
  return spawn(process.execPath, [nextBin, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL,
      ALLOW_DEMO_LOGIN: "1",
      ALLOW_TEST_SEED: "1",
      NEXT_PUBLIC_DATA_MODE: "api",
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("start:local запрещён при NODE_ENV=production");
  }

  const { pg, startedHere } = await ensurePostgres();

  if (await portOpen(APP_PORT)) {
    console.log("");
    console.log(`Порт ${APP_PORT} уже занят — новый Next.js не запускаю.`);
    console.log(`Откройте http://127.0.0.1:${APP_PORT}/`);
    console.log("БД готова. Остановка этого окна не гасит уже запущенный Next.");
    if (startedHere && pg) {
      console.log("PostgreSQL запущен этим скриптом — окно нужно оставить открытым.");
      await new Promise(() => {});
    }
    return;
  }

  const child = startNext();

  const shutdown = async (code = 0) => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    if (startedHere && pg) {
      console.log("Stopping PostgreSQL …");
      try {
        await pg.stop();
      } catch {
        try {
          execSync(
            `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PG_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
            { stdio: "ignore" }
          );
        } catch {
          /* ignore */
        }
      }
    }
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  child.on("exit", (code) => void shutdown(code ?? 0));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
