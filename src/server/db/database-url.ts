/**
 * Разбор DATABASE_URL (зеркало scripts/lib/database-url.mjs для TS/приложения).
 * Логика должна совпадать с .mjs — тесты покрывают .mjs как source of truth для migrate.
 */

export type ParsedDatabaseUrl = {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: number | undefined;
  database: string;
  searchParams: URLSearchParams;
};

export type PostgresClientOptions = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
};

export function parseDatabaseUrl(connectionString: string): ParsedDatabaseUrl {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error("DATABASE_URL пуст или некорректного типа");
  }

  const trimmed = connectionString.trim();
  const protocolMatch = trimmed.match(/^(postgres(?:ql)?):\/\//i);
  if (!protocolMatch) {
    throw new Error(
      "DATABASE_URL должен начинаться с postgresql:// или postgres://"
    );
  }

  const rest = trimmed.slice(protocolMatch[0].length);
  const queryIndex = rest.indexOf("?");
  const main = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const query = queryIndex >= 0 ? rest.slice(queryIndex + 1) : "";

  const at = main.lastIndexOf("@");
  if (at < 0) {
    throw new Error(
      "DATABASE_URL: не найден разделитель @ между учётными данными и хостом"
    );
  }

  const userinfo = main.slice(0, at);
  const hostAndPath = main.slice(at + 1);

  const colon = userinfo.indexOf(":");
  let username = "";
  let password = "";
  try {
    if (colon >= 0) {
      username = decodeURIComponent(userinfo.slice(0, colon));
      password = decodeURIComponent(userinfo.slice(colon + 1));
    } else {
      username = decodeURIComponent(userinfo);
    }
  } catch {
    throw new Error(
      "DATABASE_URL: некорректное percent-encoding в логине или пароле"
    );
  }

  const slash = hostAndPath.indexOf("/");
  const hostPort = slash >= 0 ? hostAndPath.slice(0, slash) : hostAndPath;
  const pathPart = slash >= 0 ? hostAndPath.slice(slash + 1) : "";
  const databaseRaw = pathPart.split("/")[0] || "";

  let hostname: string;
  let port: number | undefined;
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    if (end < 0) {
      throw new Error("DATABASE_URL: некорректный IPv6-хост");
    }
    hostname = hostPort.slice(1, end);
    const after = hostPort.slice(end + 1);
    if (after.startsWith(":")) {
      port = Number(after.slice(1));
    }
  } else {
    const lastColon = hostPort.lastIndexOf(":");
    if (lastColon >= 0 && /^\d+$/.test(hostPort.slice(lastColon + 1))) {
      hostname = hostPort.slice(0, lastColon);
      port = Number(hostPort.slice(lastColon + 1));
    } else {
      hostname = hostPort;
    }
  }

  if (!hostname) {
    throw new Error("DATABASE_URL: не указан хост");
  }

  let database: string;
  try {
    database = databaseRaw ? decodeURIComponent(databaseRaw) : "";
  } catch {
    throw new Error("DATABASE_URL: некорректное percent-encoding в имени БД");
  }

  if (!database) {
    throw new Error("DATABASE_URL: не указано имя базы данных");
  }

  return {
    protocol: "postgresql",
    username,
    password,
    hostname,
    port: Number.isFinite(port) ? port : undefined,
    database,
    searchParams: new URLSearchParams(query),
  };
}

export function toPostgresOptions(
  parsed: ParsedDatabaseUrl,
  overrides: Partial<PostgresClientOptions> = {}
): PostgresClientOptions {
  const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  let ssl: PostgresClientOptions["ssl"];
  if (
    sslMode === "require" ||
    sslMode === "verify-full" ||
    sslMode === "verify-ca"
  ) {
    ssl = sslMode === "require" ? { rejectUnauthorized: false } : true;
  } else if (sslMode === "disable") {
    ssl = false;
  }

  return {
    host: parsed.hostname,
    port: parsed.port ?? 5432,
    database: parsed.database,
    username: parsed.username,
    password: parsed.password,
    ssl,
    ...overrides,
  };
}

export function sanitizeDbError(err: unknown): Error {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : "Unknown error";

  const scrubbed = raw
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "postgresql://***")
    .replace(/(password|pwd|pass)\s*[:=]\s*([^\s,;]+)/gi, "$1=***")
    .replace(/:[^:@/\s]{4,}@/g, ":***@");

  const out = new Error(
    scrubbed.includes("Invalid URL")
      ? "Некорректный DATABASE_URL (проверьте percent-encoding пароля/логина). Секреты скрыты."
      : scrubbed
  );
  if (err instanceof Error && err.stack) {
    out.stack = err.stack
      .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "postgresql://***")
      .replace(/:[^:@/\s]{4,}@/g, ":***@");
  }
  return out;
}

/** Собрать опции клиента из строки DATABASE_URL. */
export function postgresOptionsFromUrl(
  connectionString: string,
  overrides: Partial<PostgresClientOptions> = {}
): PostgresClientOptions {
  return toPostgresOptions(parseDatabaseUrl(connectionString), overrides);
}
