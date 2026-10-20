/**
 * Разбор DATABASE_URL с percent-encoded логином/паролем.
 * В postgres() передаём объект опций — без повторной склейки URL-строки.
 */

/**
 * @typedef {object} ParsedDatabaseUrl
 * @property {string} protocol
 * @property {string} username
 * @property {string} password
 * @property {string} hostname
 * @property {number | undefined} port
 * @property {string} database
 * @property {URLSearchParams} searchParams
 */

/**
 * @param {string} connectionString
 * @returns {ParsedDatabaseUrl}
 */
export function parseDatabaseUrl(connectionString) {
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

  // При корректном percent-encoding символ «@» в пароле — это %40,
  // поэтому последний «@» отделяет userinfo от host.
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

  let hostname;
  let port;
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

  let database;
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

/**
 * Опции для postgres.js (без URL-строки).
 * @param {ParsedDatabaseUrl} parsed
 * @param {Record<string, unknown>} [overrides]
 */
export function toPostgresOptions(parsed, overrides = {}) {
  const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  /** @type {boolean | object | undefined} */
  let ssl;
  if (sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca") {
    ssl = sslMode === "require" ? { rejectUnauthorized: false } : true;
  } else if (sslMode === "disable" || sslMode === "allow" || sslMode === "prefer") {
    ssl = sslMode === "disable" ? false : undefined;
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

/**
 * Убирает секреты из текста ошибки / URL-подобных фрагментов.
 * @param {unknown} err
 * @returns {Error}
 */
export function sanitizeDbError(err) {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : "Unknown error";

  const scrubbed = raw
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "postgresql://***")
    .replace(
      /(password|pwd|pass)\s*[:=]\s*([^\s,;]+)/gi,
      "$1=***"
    )
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
