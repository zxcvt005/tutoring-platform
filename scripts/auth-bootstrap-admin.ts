/**
 * CLI: создать первого директора без HTTP.
 *
 *   BOOTSTRAP_ADMIN_TOKEN=… DATABASE_URL=… npx tsx scripts/auth-bootstrap-admin.ts \
 *     --email admin@school.example \
 *     --password 'YourSecurePass1' \
 *     --name 'Директор' \
 *     --org 'Моя школа'
 *
 * Или передайте токен аргументом --token (предпочтительно через env).
 */
import { config as loadEnv } from "dotenv";

import { createDb, requireDatabaseUrl } from "../src/server/db/client";
import { bootstrapFirstAdmin } from "../src/server/services/bootstrap-admin-service";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const email = arg("email");
  const password = arg("password");
  const fullName = arg("name") ?? arg("fullName");
  const organizationName = arg("org") ?? arg("organization");
  const token =
    arg("token") ?? process.env.BOOTSTRAP_ADMIN_TOKEN ?? "";

  if (!email || !password || !fullName || !organizationName || !token) {
    console.error(
      "Usage: --email --password --name --org [--token] (or BOOTSTRAP_ADMIN_TOKEN)"
    );
    process.exit(1);
  }

  // Временно выставляем токен для сервиса, если передан CLI
  if (arg("token")) {
    process.env.BOOTSTRAP_ADMIN_TOKEN = token;
  }

  const { db, sql } = createDb(requireDatabaseUrl());
  try {
    const result = await bootstrapFirstAdmin(db, {
      token,
      email,
      password,
      fullName,
      organizationName,
    });
    console.log("OK", result);
    console.log(
      "Удалите или смените BOOTSTRAP_ADMIN_TOKEN после успешного запуска."
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
