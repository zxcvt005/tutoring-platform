import { describe, it, expect } from "vitest";

import {
  assertSafeTestDatabase,
  assertTimewebTestDatabase,
  TIMEWEB_ALLOWED_ORG_ID,
} from "../../scripts/lib/seed-safety";

describe("seed safety gates", () => {
  const localUrl = "postgresql://u:p@127.0.0.1:5432/tutoring_platform";

  it("allows local host with ALLOW_TEST_SEED=1", () => {
    const r = assertSafeTestDatabase(localUrl, {
      NODE_ENV: "development",
      ALLOW_TEST_SEED: "1",
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    expect(r.hostname).toBe("127.0.0.1");
  });

  it("blocks production NODE_ENV", () => {
    expect(() =>
      assertSafeTestDatabase(localUrl, {
        NODE_ENV: "production",
        ALLOW_TEST_SEED: "1",
      } as NodeJS.ProcessEnv)
    ).toThrow(/production/i);
  });

  it("requires ALLOW_TEST_SEED", () => {
    expect(() =>
      assertSafeTestDatabase(localUrl, {
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv)
    ).toThrow(/ALLOW_TEST_SEED/);
  });

  it("blocks timeweb-like hosts", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://u:p@db.timeweb.ru:5432/tutoring_platform",
        {
          NODE_ENV: "development",
          ALLOW_TEST_SEED: "1",
        } as NodeJS.ProcessEnv
      )
    ).toThrow(/timeweb|облачн|локальн/i);
  });

  it("blocks non-local hosts even with flag", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://u:p@db.example.com:5432/tutoring_platform",
        {
          NODE_ENV: "development",
          ALLOW_TEST_SEED: "1",
        } as NodeJS.ProcessEnv
      )
    ).toThrow(/не локальный/i);
  });
});

describe("Timeweb test seed gate", () => {
  const timewebUrl =
    "postgresql://u:p@pgsql.timeweb.ru:5432/default_db?sslmode=require";
  const allowEnv = {
    NODE_ENV: "production",
    ALLOW_TIMEWEB_TEST_SEED: "1",
    TIMEWEB_TEST_SEED_ORG: TIMEWEB_ALLOWED_ORG_ID,
    TIMEWEB_TEST_SEED_DB: "default_db",
  } as NodeJS.ProcessEnv;

  it("allows Timeweb host in production when org and db name match", () => {
    const r = assertTimewebTestDatabase(timewebUrl, allowEnv);
    expect(r.ok).toBe(true);
    expect(r.database).toBe("default_db");
  });

  it("does not require changing NODE_ENV away from production", () => {
    expect(allowEnv.NODE_ENV).toBe("production");
    expect(() => assertTimewebTestDatabase(timewebUrl, allowEnv)).not.toThrow();
  });

  it("still requires the explicit Timeweb flag", () => {
    expect(() =>
      assertTimewebTestDatabase(timewebUrl, {
        NODE_ENV: "production",
        ALLOW_TEST_SEED: "1",
        TIMEWEB_TEST_SEED_ORG: TIMEWEB_ALLOWED_ORG_ID,
        TIMEWEB_TEST_SEED_DB: "default_db",
      } as NodeJS.ProcessEnv)
    ).toThrow(/ALLOW_TIMEWEB_TEST_SEED/);
  });

  it("rejects mismatched database name", () => {
    expect(() =>
      assertTimewebTestDatabase(timewebUrl, {
        ...allowEnv,
        TIMEWEB_TEST_SEED_DB: "other_db",
      })
    ).toThrow(/не совпадает/);
  });

  it("rejects wrong organization id", () => {
    expect(() =>
      assertTimewebTestDatabase(timewebUrl, {
        ...allowEnv,
        TIMEWEB_TEST_SEED_ORG: "org_demo",
      })
    ).toThrow(/TIMEWEB_TEST_SEED_ORG/);
  });

  it("rejects localhost even with Timeweb flags", () => {
    expect(() =>
      assertTimewebTestDatabase(
        "postgresql://u:p@127.0.0.1:5432/tutoring_platform",
        {
          ...allowEnv,
          TIMEWEB_TEST_SEED_DB: "tutoring_platform",
        }
      )
    ).toThrow(/localhost/i);
  });

  it("local seed still blocks Timeweb hosts", () => {
    expect(() =>
      assertSafeTestDatabase(timewebUrl, {
        NODE_ENV: "development",
        ALLOW_TEST_SEED: "1",
      } as NodeJS.ProcessEnv)
    ).toThrow(/timeweb|облачн|локальн/i);
  });
});
