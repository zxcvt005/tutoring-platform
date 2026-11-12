import { describe, expect, it } from "vitest";

import {
  diagnoseAvitoEnv,
  isAvitoConfigured,
  readAvitoEnv,
  requireAvitoEnv,
} from "@/server/avito/env";

describe("diagnoseAvitoEnv", () => {
  it("reports missing keys without exposing values", () => {
    const diagnosis = diagnoseAvitoEnv({
      AVITO_CLIENT_ID: "  ",
      AVITO_CLIENT_SECRET: "secret-value",
      AVITO_USER_ID: "178228957",
    });
    expect(diagnosis).toEqual({
      hasClientId: false,
      hasClientSecret: true,
      hasUserId: true,
      userIdIsNumeric: true,
      configured: false,
      missingKeys: ["AVITO_CLIENT_ID"],
    });
    expect(JSON.stringify(diagnosis)).not.toContain("secret-value");
  });

  it("flags non-numeric user id", () => {
    const diagnosis = diagnoseAvitoEnv({
      AVITO_CLIENT_ID: "id",
      AVITO_CLIENT_SECRET: "secret",
      AVITO_USER_ID: "abc",
    });
    expect(diagnosis.hasUserId).toBe(true);
    expect(diagnosis.userIdIsNumeric).toBe(false);
    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.missingKeys).toEqual([]);
  });

  it("requireAvitoEnv lists only missing key names", () => {
    expect(() =>
      requireAvitoEnv({
        AVITO_CLIENT_ID: "id",
        AVITO_CLIENT_SECRET: "",
        AVITO_USER_ID: "1",
      })
    ).toThrow(/AVITO_CLIENT_SECRET/);
    expect(() =>
      requireAvitoEnv({
        AVITO_CLIENT_ID: "id",
        AVITO_CLIENT_SECRET: "",
        AVITO_USER_ID: "1",
      })
    ).not.toThrow(/secret/);
  });

  it("reads env dynamically at call time", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(isAvitoConfigured(env)).toBe(false);
    env.AVITO_CLIENT_ID = "id";
    env.AVITO_CLIENT_SECRET = "secret";
    env.AVITO_USER_ID = "178228957";
    expect(isAvitoConfigured(env)).toBe(true);
    expect(readAvitoEnv(env)?.userId).toBe("178228957");
  });
});
