/**
 * Проверки безопасного запуска тестового seed.
 * Не логирует DATABASE_URL, пароли и токены.
 */
import { parseDatabaseUrl } from "../../src/server/db/database-url";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

const BLOCKED_HOST_SNIPPETS = [
  "timeweb",
  "amazonaws.com",
  "rds.amazonaws",
  "azure.com",
  "supabase.co",
  "neon.tech",
  "railway.app",
  "render.com",
  "digitalocean.com",
  "yandexcloud",
  "cloud.yandex",
];

const ALLOWED_DB_NAMES = new Set([
  "tutoring_platform",
  "tutoring_local",
  "tutoring_test",
  "umba_local",
  "umba_test",
  "umba_dev",
  "postgres", // embedded local cluster often uses default db name
]);

/** Должно совпадать с SCHOOL_ORG_ID в src/server/db/seed-school.ts */
export const TIMEWEB_ALLOWED_ORG_ID = "org_school_qa";

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

function isTimewebHost(hostname: string): boolean {
  return (
    hostname.includes("timeweb") ||
    hostname.endsWith(".twc1.net") ||
    hostname.includes("twhost") ||
    hostname.includes("twcstorage")
  );
}

function parseUrlOrThrow(connectionString: string) {
  try {
    return parseDatabaseUrl(connectionString);
  } catch {
    throw new Error(
      "Отказ: некорректный DATABASE_URL (секреты скрыты). Проверьте переменную окружения приложения."
    );
  }
}

export type SeedSafetyOk = {
  ok: true;
  hostname: string;
  database: string;
};

export type SeedSafetyFail = {
  ok: false;
  reason: string;
};

export function assertSafeTestDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): SeedSafetyOk {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Отказ: тестовый seed запрещён при NODE_ENV=production."
    );
  }
  if (env.ALLOW_TEST_SEED !== "1") {
    throw new Error(
      "Отказ: для тестового seed задайте ALLOW_TEST_SEED=1 в окружении (только локально)."
    );
  }
  if (env.ALLOW_PROD_SEED === "1" || env.FORCE_PROD_SEED === "1") {
    throw new Error(
      "Отказ: флаги FORCE/ALLOW_PROD_SEED не поддерживаются для тестового наполнения."
    );
  }

  const parsed = parseUrlOrThrow(connectionString);
  const hostname = parsed.hostname.toLowerCase();
  const database = parsed.database.toLowerCase();

  for (const snippet of BLOCKED_HOST_SNIPPETS) {
    if (hostname.includes(snippet)) {
      throw new Error(
        `Отказ: хост БД похож на облачный/production (${snippet}). Тестовый seed только для локальной БД.`
      );
    }
  }

  const localHost = LOCAL_HOSTS.has(hostname);
  if (!localHost) {
    throw new Error(
      `Отказ: хост БД «${hostname}» не локальный. Разрешены только localhost / 127.0.0.1 / ::1.`
    );
  }

  if (!ALLOWED_DB_NAMES.has(database)) {
    throw new Error(
      `Отказ: имя БД «${database}» не в списке локальных тестовых (${[...ALLOWED_DB_NAMES].join(", ")}). ` +
        "Если это ваша локальная БД — добавьте имя осознанно в scripts/lib/seed-safety.ts."
    );
  }

  return { ok: true, hostname, database };
}

/**
 * Отдельный сценарий для тестовой БД Timeweb.
 * Не подменяет NODE_ENV и не ослабляет локальный seed.
 * Разрешает production runtime только при явном флаге и совпадении
 * имени БД и организации.
 */
export function assertTimewebTestDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): SeedSafetyOk {
  if (env.ALLOW_PROD_SEED === "1" || env.FORCE_PROD_SEED === "1") {
    throw new Error(
      "Отказ: FORCE/ALLOW_PROD_SEED не поддерживаются. Используйте ALLOW_TIMEWEB_TEST_SEED=1."
    );
  }
  if (env.ALLOW_TIMEWEB_TEST_SEED !== "1") {
    throw new Error(
      "Отказ: для seed на Timeweb задайте ALLOW_TIMEWEB_TEST_SEED=1. " +
        "Локальный db:seed:school облачную БД не принимает."
    );
  }

  const parsed = parseUrlOrThrow(connectionString);
  const hostname = parsed.hostname.toLowerCase();
  const database = parsed.database.toLowerCase();

  if (isLocalHost(hostname)) {
    throw new Error(
      "Отказ: сценарий Timeweb не для localhost. Для локальной БД: npm run db:seed:school"
    );
  }
  if (!isTimewebHost(hostname)) {
    throw new Error(
      `Отказ: хост «${hostname}» не похож на Timeweb. Seed разрешён только для тестовой БД Timeweb.`
    );
  }

  const org = (env.TIMEWEB_TEST_SEED_ORG ?? "").trim();
  if (org !== TIMEWEB_ALLOWED_ORG_ID) {
    throw new Error(
      `Отказ: TIMEWEB_TEST_SEED_ORG должен быть «${TIMEWEB_ALLOWED_ORG_ID}». ` +
        "Пересоздаётся только эта тестовая организация, не вся база."
    );
  }

  const expectedDb = (env.TIMEWEB_TEST_SEED_DB ?? "").trim().toLowerCase();
  // Если имя не задано — берём database из DATABASE_URL (одна тестовая БД приложения).
  if (expectedDb && expectedDb !== database) {
    throw new Error(
      "Отказ: TIMEWEB_TEST_SEED_DB не совпадает с именем базы в DATABASE_URL (секреты скрыты)."
    );
  }

  return { ok: true, hostname, database };
}

export function redactConnectionString(_url?: string): string {
  void _url;
  return "[DATABASE_URL redacted]";
}
