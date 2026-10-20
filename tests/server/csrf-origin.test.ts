import { describe, it, expect, afterEach } from "vitest";

import {
  assertSameOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  normalizeOrigin,
} from "@/server/auth/csrf";
import { ApiError } from "@/server/errors";

const PROD_HOST = "zxcvt005-tutoring-platform-302f.twc1.net";
const PROD_ORIGIN = `https://${PROD_HOST}`;

describe("Origin allowlist / CSRF companion checks", () => {
  const prev = {
    APP_BASE_URL: process.env.APP_BASE_URL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    process.env.APP_BASE_URL = prev.APP_BASE_URL;
    process.env.ALLOWED_ORIGINS = prev.ALLOWED_ORIGINS;
    process.env.NODE_ENV = prev.NODE_ENV;
  });

  it("normalizeOrigin strips path and uses scheme+host+port", () => {
    expect(normalizeOrigin(`${PROD_ORIGIN}/setup`)).toBe(PROD_ORIGIN);
    expect(normalizeOrigin(`${PROD_ORIGIN}/`)).toBe(PROD_ORIGIN);
    expect(normalizeOrigin("http://localhost:43127/foo")).toBe(
      "http://localhost:43127"
    );
    expect(normalizeOrigin("not-a-url")).toBeNull();
    expect(normalizeOrigin("ftp://x.example")).toBeNull();
  });

  it("allows production Origin matching APP_BASE_URL", () => {
    const env = {
      NODE_ENV: "production",
      APP_BASE_URL: `${PROD_ORIGIN}/`,
    } as NodeJS.ProcessEnv;

    expect(getAllowedOrigins(env)).toEqual([PROD_ORIGIN]);
    expect(isOriginAllowed(PROD_ORIGIN, env)).toBe(true);
    expect(isOriginAllowed(`${PROD_ORIGIN}/setup`, env)).toBe(true);
  });

  it("rejects foreign Origin in production", () => {
    const env = {
      NODE_ENV: "production",
      APP_BASE_URL: PROD_ORIGIN,
    } as NodeJS.ProcessEnv;

    expect(isOriginAllowed("https://evil.example", env)).toBe(false);
    // Prefix / suffix attacks must not pass (strict origin equality)
    expect(
      isOriginAllowed(`https://${PROD_HOST}.evil.example`, env)
    ).toBe(false);
    expect(isOriginAllowed(`https://evil-${PROD_HOST}`, env)).toBe(false);
    expect(isOriginAllowed("http://" + PROD_HOST, env)).toBe(false);
  });

  it("ALLOWED_ORIGINS adds extra origins without loosening APP_BASE_URL", () => {
    const env = {
      NODE_ENV: "production",
      APP_BASE_URL: PROD_ORIGIN,
      ALLOWED_ORIGINS: "https://www.example.com, https://cdn.example.com/path",
    } as NodeJS.ProcessEnv;

    const allowed = getAllowedOrigins(env);
    expect(allowed).toContain(PROD_ORIGIN);
    expect(allowed).toContain("https://www.example.com");
    expect(allowed).toContain("https://cdn.example.com");
    expect(isOriginAllowed("https://www.example.com", env)).toBe(true);
    expect(isOriginAllowed("https://other.example", env)).toBe(false);
  });

  it("does not include localhost in production allowlist by default", () => {
    const env = {
      NODE_ENV: "production",
      APP_BASE_URL: PROD_ORIGIN,
    } as NodeJS.ProcessEnv;
    expect(getAllowedOrigins(env)).not.toContain("http://localhost:43127");
    expect(isOriginAllowed("http://127.0.0.1:43127", env)).toBe(false);
  });

  it("includes localhost outside production for local development", () => {
    const env = {
      NODE_ENV: "development",
      APP_BASE_URL: undefined,
    } as unknown as NodeJS.ProcessEnv;
    delete env.APP_BASE_URL;
    expect(getAllowedOrigins(env)).toContain("http://127.0.0.1:43127");
    expect(isOriginAllowed("http://localhost:3000", env)).toBe(true);
  });

  it("assertSameOrigin accepts Timeweb Origin when APP_BASE_URL is set", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = PROD_ORIGIN;
    delete process.env.ALLOWED_ORIGINS;

    const req = new Request(`${PROD_ORIGIN}/api/auth/bootstrap-admin`, {
      method: "POST",
      headers: { origin: PROD_ORIGIN },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("assertSameOrigin rejects outsider when APP_BASE_URL is Timeweb domain", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = PROD_ORIGIN;

    const req = new Request(`${PROD_ORIGIN}/api/auth/bootstrap-admin`, {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(() => assertSameOrigin(req)).toThrow(ApiError);
    try {
      assertSameOrigin(req);
    } catch (e) {
      expect(e).toMatchObject({ status: 403, message: "Недопустимый Origin" });
    }
  });
});
