/**
 * Один вход в локальную разработку Неодин (Windows-friendly):
 * 1) поднимает embedded PostgreSQL, если ещё не слушает порт;
 * 2) миграции;
 * 3) seed школы org_school_qa (если не --keep / UMBA_SKIP_SEED=1;
 *    при --keep seed только если организации ещё нет);
 * 4) восстанавливает 4 QA-ученика с остатком 2/1/0/−1, не дублируя их;
 * 5) Next.js на :43127 (не стартует второй экземпляр, если порт занят).
 *
 *   npm run start:local
 *   npm run start:local:keep   — без повторного seed
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "../src/server/db/schema";
import { parseDatabaseUrl } from "../src/server/db/database-url";
import { createDb } from "../src/server/db/client";
import {
  SCHOOL_ORG_ID,
  seedSchoolOrganization,
  verifySchoolOrganization,
} from "../src/server/db/seed-school";
import { ensureSchoolTariffQaFixtures } from "../src/server/db/seed-school-tariff-qa";

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

function httpStatus(port: number, timeoutMs = 2000): Promise<number> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
  });
}

async function waitForHttp(port: number, ms = 180_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const code = await httpStatus(port);
    if (code > 0) return code;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(
    `Сайт на http://127.0.0.1:${port}/ не ответил за ${Math.round(ms / 1000)} с. Смотрите лог в этом окне.`
  );
}

async function postgresAnswers(): Promise<boolean> {
  const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 3 });
  try {
    await sql`select 1 as ok`;
    return true;
  } catch {
    return false;
  } finally {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      /* ignore */
    }
  }
}

function stopStuckLocalPostgres() {
  console.log(
    `PostgreSQL на :${PG_PORT} не отвечает. Перезапускаю только локальный embedded-процесс, файлы базы не удаляю.`
  );
  const markers = ["@embedded-postgres", "tutoring-pg-data"];
  const filter = markers
    .map((m) => `$_.CommandLine -like '*${m.replace(/'/g, "''")}*'`)
    .join(" -or ");
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'postgres' -and (${filter}) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PG_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }
}

async function waitForPortClosed(port: number, ms = 20_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!(await portOpen(port))) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function migrateAndMaybeSeed(connectionString: string) {
  assertLocalUrl(connectionString);
  const sqlClient = postgres(connectionString, { max: 1 });
  const dbMigrate = drizzle(sqlClient, { schema });
  try {
    await sqlClient`select 1 as ok`;
    console.log("migrate …");
    await migrate(dbMigrate, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await sqlClient.end({ timeout: 5 });
  }

  const { db, sql } = createDb(connectionString);
  try {
    const orgRows = await sql<{ id: string }[]>`
      select id from organizations where id = ${SCHOOL_ORG_ID} limit 1
    `;
    const orgMissing = orgRows.length === 0;
    const shouldSeed = !SKIP_SEED || orgMissing;
    if (!shouldSeed) {
      console.log(
        "seed пропущен (--keep): организация уже есть, данные не затираем"
      );
    } else {
      if (SKIP_SEED && orgMissing) {
        console.log("организации нет — первичное заполнение школы");
      }
      const encRows = await sql<{ server_encoding: string }[]>`SHOW server_encoding`;
      const enc = String(encRows[0]?.server_encoding ?? "").toUpperCase();
      const win1251Safe = enc.includes("WIN125") || enc === "SQL_ASCII";
      console.log(`seed ${SCHOOL_ORG_ID} … encoding=${enc}`);
      const stats = await seedSchoolOrganization(db, new Date(), {
        win1251Safe,
      });
      console.log("Seed OK", stats);
    }

    const qa = await ensureSchoolTariffQaFixtures(db);
    const restored = qa.filter((r) => r.restored).length;
    console.log(
      `QA-тариф ученики: ${qa.length} (восстановлено ${restored}) ` +
        qa.map((r) => `${r.studentId}=${r.remaining}`).join(", ")
    );

    const { ensureDefaultProducts } = await import(
      "../src/server/services/products-service"
    );
    await ensureDefaultProducts(db, SCHOOL_ORG_ID);
    console.log("каталог продуктов: тренажёр формул зарегистрирован");

    if (shouldSeed) {
      const { errors } = await verifySchoolOrganization(db);
      if (errors.length) {
        throw new Error(`Seed verify failed: ${errors.join("; ")}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function ensurePostgres(): Promise<{
  pg: EmbeddedPostgres | null;
  startedHere: boolean;
}> {
  writeEnvLocal();
  process.env.DATABASE_URL = DATABASE_URL;

  if (await portOpen(PG_PORT)) {
    if (await postgresAnswers()) {
      console.log(`PostgreSQL уже слушает :${PG_PORT}`);
      await migrateAndMaybeSeed(DATABASE_URL);
      return { pg: null, startedHere: false };
    }
    stopStuckLocalPostgres();
    await waitForPortClosed(PG_PORT);
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
    const code = await httpStatus(APP_PORT);
    console.log("");
    if (code > 0) {
      console.log(`Сайт уже отвечает (HTTP ${code}): http://127.0.0.1:${APP_PORT}/`);
      console.log("Новый Next.js не запускаю.");
    } else {
      console.log(
        `Порт ${APP_PORT} занят, но HTTP не отвечает. Закройте зависшее окно этого проекта и запустите BAT снова.`
      );
    }
    console.log("БД готова. Остановка этого окна не гасит уже запущенный Next.");
    if (startedHere && pg) {
      console.log("PostgreSQL запущен этим скриптом — окно нужно оставить открытым.");
      await new Promise(() => {});
    }
    return;
  }

  const child = startNext();

  try {
    await waitForHttp(APP_PORT, 180_000);
    console.log(`Сайт отвечает: http://127.0.0.1:${APP_PORT}/`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
  }

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
