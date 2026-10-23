import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isDatabaseUnavailableError,
  toErrorBody,
} from "@/server/errors";

describe("database unavailable error mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects ECONNREFUSED-style errors", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), {
      code: "ECONNREFUSED",
    });
    expect(isDatabaseUnavailableError(err)).toBe(true);
  });

  it("maps connection errors to 503 with actionable message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), {
      code: "ECONNREFUSED",
    });
    const { status, body } = toErrorBody(err);
    expect(status).toBe(503);
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message).toMatch(/PostgreSQL/i);
    expect(body.error.message).not.toMatch(/postgres:\/\//i);
  });

  it("keeps generic errors as 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = toErrorBody(new Error("unexpected boom"));
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("detects PostgreSQL too-many-clients (53300)", () => {
    const err = Object.assign(new Error("sorry, too many clients already"), {
      code: "53300",
    });
    expect(isDatabaseUnavailableError(err)).toBe(true);
  });

  it("walks Drizzle Failed query cause", () => {
    const cause = Object.assign(new Error("sorry, too many clients already"), {
      code: "53300",
    });
    const wrapped = Object.assign(
      new Error('Failed query: select count(*) from "organizations"\nparams:'),
      { cause }
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = toErrorBody(wrapped);
    expect(status).toBe(503);
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message).not.toMatch(/postgres:\/\//i);
    expect(body.error.message).not.toMatch(/53300/);
  });

  it("logs nested cause without exposing it to the client", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), {
      code: "ECONNREFUSED",
    });
    const wrapped = Object.assign(new Error("Failed query: select 1"), { cause });
    toErrorBody(wrapped);
    expect(errorSpy).toHaveBeenCalled();
    const printed = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(printed.some((line) => /ECONNREFUSED/.test(line))).toBe(true);
  });
});
