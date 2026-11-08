import { describe, expect, it } from "vitest";

import {
  isMissingRelationError,
  serviceUnavailable,
  toErrorBody,
} from "@/server/errors";

describe("infra error mapping", () => {
  it("detects missing PostgreSQL relations", () => {
    expect(
      isMissingRelationError(
        { code: "42P01", message: 'relation "account_invitations" does not exist' },
        "account_invitations"
      )
    ).toBe(true);
    expect(
      isMissingRelationError(
        { code: "42P01", message: 'relation "users" does not exist' },
        "account_invitations"
      )
    ).toBe(false);
  });

  it("maps missing account_invitations to a migration hint instead of generic 500", () => {
    const mapped = toErrorBody({
      code: "42P01",
      message: 'relation "account_invitations" does not exist',
    });
    expect(mapped.status).toBe(503);
    expect(mapped.body.error.code).toBe("service_unavailable");
    expect(mapped.body.error.message).toMatch(/0034_account_invitations/);
    expect(mapped.body.error.message).not.toBe("Внутренняя ошибка сервера");
  });

  it("keeps S3 ApiError message for the client", () => {
    const err = serviceUnavailable(
      "Не удалось записать файл в хранилище (HTTP 403). Проверьте права ключа S3 на запись в бакет."
    );
    const mapped = toErrorBody(err);
    expect(mapped.status).toBe(503);
    expect(mapped.body.error.message).toMatch(/HTTP 403/);
  });
});
