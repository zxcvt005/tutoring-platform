import { describe, it, expect } from "vitest";
import postgres from "postgres";

import {
  parseDatabaseUrl,
  sanitizeDbError,
  toPostgresOptions,
} from "../../scripts/lib/database-url.mjs";
import {
  parseDatabaseUrl as parseTs,
  toPostgresOptions as toOptsTs,
  sanitizeDbError as sanitizeTs,
} from "@/server/db/database-url";

describe("DATABASE_URL parsing (migrate mjs + app ts)", () => {
  it("decodes percent-encoded special characters in password", () => {
    // password: p@ss#w/rd:x!
    const encodedPass = encodeURIComponent("p@ss#w/rd:x!");
    const url = `postgresql://myuser:${encodedPass}@db.example.com:5432/umba_prod?sslmode=require`;

    const parsed = parseDatabaseUrl(url);
    expect(parsed.username).toBe("myuser");
    expect(parsed.password).toBe("p@ss#w/rd:x!");
    expect(parsed.hostname).toBe("db.example.com");
    expect(parsed.port).toBe(5432);
    expect(parsed.database).toBe("umba_prod");

    const opts = toPostgresOptions(parsed, { max: 1 });
    expect(opts).toMatchObject({
      host: "db.example.com",
      port: 5432,
      database: "umba_prod",
      username: "myuser",
      password: "p@ss#w/rd:x!",
      max: 1,
    });
    expect(opts.ssl).toEqual({ rejectUnauthorized: false });

    // TS-зеркало совпадает
    const parsedTs = parseTs(url);
    expect(parsedTs.password).toBe(parsed.password);
    expect(toOptsTs(parsedTs).password).toBe(opts.password);
  });

  it("handles username with encoded symbols and default port", () => {
    const user = encodeURIComponent("app+admin");
    const pass = encodeURIComponent("a/b:c@d#e");
    const url = `postgres://${user}:${pass}@127.0.0.1/mydb`;
    const parsed = parseDatabaseUrl(url);
    expect(parsed.username).toBe("app+admin");
    expect(parsed.password).toBe("a/b:c@d#e");
    expect(parsed.port).toBeUndefined();
    expect(toPostgresOptions(parsed).port).toBe(5432);
  });

  it("does not throw Invalid URL when passing options to postgres.js", () => {
    const pass = encodeURIComponent("x@y#z/w:1");
    const url = `postgresql://u:${pass}@localhost:5432/testdb`;
    const opts = toPostgresOptions(parseDatabaseUrl(url), { max: 1 });
    // Конструктор не должен падать на Invalid URL (подключение может не удасться)
    const sql = postgres(opts);
    expect(typeof sql.end).toBe("function");
    void sql.end({ timeout: 1 });
  });

  it("sanitizeDbError never echoes connection secrets", () => {
    const secretUrl =
      "postgresql://admin:Super@Secret#Pass@db.timeweb.ru:5432/umba";
    const err = new TypeError(`Invalid URL: ${secretUrl}`);
    const safe = sanitizeDbError(err);
    expect(safe.message).not.toContain("Super");
    expect(safe.message).not.toContain("Secret");
    expect(safe.message).not.toMatch(/postgresql:\/\/admin:/i);
    expect(sanitizeTs(err).message).not.toContain("Super@Secret");
  });
});
