export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_error"
  | "rate_limited"
  | "internal_error";

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
  console.error(err);
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
