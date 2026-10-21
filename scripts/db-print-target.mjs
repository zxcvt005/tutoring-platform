/**
 * Печатает только хост и имя БД из DATABASE_URL (без пароля).
 * Для консоли Timeweb: узнать TIMEWEB_TEST_SEED_DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDatabaseUrl, sanitizeDbError } from "./lib/database-url.mjs";

function loadEnvFile(filename) {
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

try {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL не задан.");
    process.exit(1);
  }
  const parsed = parseDatabaseUrl(raw);
  console.log(`host=${parsed.hostname}`);
  console.log(`database=${parsed.database}`);
  console.log(`TIMEWEB_TEST_SEED_DB=${parsed.database}`);
} catch (err) {
  console.error(sanitizeDbError(err).message);
  process.exit(1);
}
