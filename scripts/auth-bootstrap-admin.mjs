/**
 * Production-safe создание первого директора (без tsx и без seed).
 * Запуск: npm run auth:bootstrap-admin -- --email … --password … --name … --org …
 * Токен: BOOTSTRAP_ADMIN_TOKEN в окружении контейнера или аргумент --token.
 * Пишет только organizations, users и memberships с ролью director.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import {
  parseDatabaseUrl,
  sanitizeDbError,
  toPostgresOptions,
} from "./lib/database-url.mjs";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

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

export function arg(argv, name) {
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return undefined;
}

/** Токен из env. Короче 24 символов считается незаданным, как в HTTP-сервисе. */
export function readBootstrapToken(env = process.env) {
  const token = env.BOOTSTRAP_ADMIN_TOKEN?.trim() ?? "";
  return token.length >= 24 ? token : null;
}

export function tokensMatch(provided, expected) {
  if (provided.length !== expected.length) return false;
  let out = 0;
  for (let i = 0; i < provided.length; i++) {
    out |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return out === 0;
}

export function assertPasswordPolicy(plain) {
  if (plain.length < 10 || plain.length > 200) {
    throw new Error("Пароль: от 10 до 200 символов");
  }
  if (!/[A-Za-zА-Яа-я]/.test(plain) || !/[0-9]/.test(plain)) {
    throw new Error("Пароль должен содержать буквы и цифры");
  }
}

export function organizationSlug(explicit) {
  const cleaned = explicit?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return cleaned || `school-${randomBytes(3).toString("hex")}`;
}

/**
 * @param {import("postgres").Sql} sql
 * @param {{ token: string, email: string, password: string, fullName: string, organizationName: string, organizationSlug?: string, env?: NodeJS.ProcessEnv }} input
 */
export async function createFirstDirector(sql, input) {
  const expected = readBootstrapToken(input.env ?? process.env);
  if (!expected) {
    throw new Error(
      "BOOTSTRAP_ADMIN_TOKEN не задан. Используйте CLI или задайте токен в env."
    );
  }
  if (!tokensMatch(input.token.trim(), expected)) {
    throw new Error("Неверный bootstrap-токен");
  }

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Некорректный email");

  assertPasswordPolicy(input.password);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const slug = organizationSlug(input.organizationSlug);
  const organizationName = input.organizationName.trim() || "Школа";
  const fullName = input.fullName.trim();
  const orgId = `org_${randomBytes(6).toString("hex")}`;
  const userId = `user_${randomBytes(6).toString("hex")}`;
  const memId = `mem_${randomBytes(6).toString("hex")}`;

  await sql.begin(async (tx) => {
    const [orgs] = await tx`select count(*)::int as n from organizations`;
    const [dirs] = await tx`
      select count(*)::int as n from memberships where role = 'director'
    `;
    if (Number(orgs?.n ?? 0) !== 0 && Number(dirs?.n ?? 0) !== 0) {
      throw new Error("Администратор уже создан — bootstrap недоступен");
    }

    await tx`
      insert into organizations (id, name, slug)
      values (${orgId}, ${organizationName}, ${slug})
    `;
    await tx`
      insert into users (id, email, password_hash, full_name, status)
      values (${userId}, ${email}, ${passwordHash}, ${fullName}, 'active')
    `;
    await tx`
      insert into memberships (id, organization_id, user_id, role)
      values (${memId}, ${orgId}, ${userId}, 'director')
    `;
  });

  return {
    organizationId: orgId,
    organizationSlug: slug,
    userId,
    email,
    role: "director",
  };
}

function printUsage() {
  console.error(
    "Usage: --email --password --name --org [--token] (or BOOTSTRAP_ADMIN_TOKEN)"
  );
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const argv = process.argv.slice(2);
  const email = arg(argv, "email");
  const password = arg(argv, "password");
  const fullName = arg(argv, "name") ?? arg(argv, "fullName");
  const organizationName = arg(argv, "org") ?? arg(argv, "organization");
  const cliToken = arg(argv, "token");
  if (cliToken) process.env.BOOTSTRAP_ADMIN_TOKEN = cliToken;
  const token = cliToken ?? process.env.BOOTSTRAP_ADMIN_TOKEN ?? "";

  if (!email || !password || !fullName || !organizationName || !token) {
    printUsage();
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error(
      "DATABASE_URL не задан. В Timeweb задайте переменную окружения приложения."
    );
    process.exit(1);
  }

  let options;
  try {
    options = toPostgresOptions(parseDatabaseUrl(rawUrl), { max: 1 });
  } catch (err) {
    console.error(sanitizeDbError(err).message);
    process.exit(1);
  }

  const sql = postgres(options);
  try {
    const result = await createFirstDirector(sql, {
      token,
      email,
      password,
      fullName,
      organizationName,
      organizationSlug: arg(argv, "slug"),
    });
    console.log(
      "OK",
      `organizationId=${result.organizationId}`,
      `userId=${result.userId}`,
      `email=${result.email}`,
      `role=${result.role}`
    );
    console.log(
      "Удалите или смените BOOTSTRAP_ADMIN_TOKEN после успешного запуска."
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(sanitizeDbError(err).message);
    process.exit(1);
  });
}
