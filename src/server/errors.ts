export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_error"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

const DB_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
  "08000",
  "08001",
  "08003",
  "08006",
]);

/** Ошибки недоступности PostgreSQL / сети к БД (без секретов в сообщении). */
export function isDatabaseUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return /ECONNREFUSED|ENOTFOUND|ECONNRESET|too many clients/i.test(String(err));
  }
  const anyErr = err as {
    code?: string;
    errno?: string | number;
    message?: string;
    cause?: unknown;
    errors?: unknown[];
  };
  const code = String(anyErr.code ?? anyErr.errno ?? "");
  const message = String(anyErr.message ?? "");
  if (DB_UNAVAILABLE_CODES.has(code)) {
    return true;
  }
  if (
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|connect ECONNREFUSED|Connection refused|CONNECT_TIMEOUT|too many clients|remaining connection slots|не удалось подключиться|database.*unavailable/i.test(
      message
    )
  ) {
    return true;
  }
  if (anyErr.cause) return isDatabaseUnavailableError(anyErr.cause);
  if (Array.isArray(anyErr.errors)) {
    return anyErr.errors.some((e) => isDatabaseUnavailableError(e));
  }
  return false;
}

function logServerError(err: unknown) {
  console.error(err);
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && "cause" in current) {
    const cause = (current as { cause?: unknown }).cause;
    if (cause == null || seen.has(cause)) break;
    seen.add(cause);
    console.error(cause);
    current = cause;
  }
}

export function databaseUnavailable(
  message = "PostgreSQL недоступен или отклонил подключение. Если база уже запущена, перезапустите локальный сервер (npm run start:local:keep) и обновите страницу."
) {
  return new ApiError(503, "service_unavailable", message);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, "bad_request", message, details);
}

export function unauthorized(message = "Требуется вход") {
  return new ApiError(401, "unauthorized", message);
}

export function forbidden(message = "Недостаточно прав") {
  return new ApiError(403, "forbidden", message);
}

export function notFound(message = "Не найдено") {
  return new ApiError(404, "not_found", message);
}

export function conflict(message: string, details?: unknown) {
  return new ApiError(409, "conflict", message, details);
}

export function validationError(message: string, details?: unknown) {
  return new ApiError(400, "validation_error", message, details);
}

export type ErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
    };
  }
  if (isDatabaseUnavailableError(err)) {
    const unavailable = databaseUnavailable();
    logServerError(err);
    return {
      status: unavailable.status,
      body: {
        error: {
          code: unavailable.code,
          message: unavailable.message,
        },
      },
    };
  }
  logServerError(err);
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Внутренняя ошибка сервера",
      },
    },
  };
}

export function jsonError(err: unknown): Response {
  const { status, body } = toErrorBody(err);
  return Response.json(body, { status });
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init });
}
