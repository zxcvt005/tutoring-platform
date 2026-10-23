import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/constants";
import { middleware } from "@/middleware";

describe("cabinet middleware open-test flag", () => {
  const prevNode = process.env.NODE_ENV;
  const prevOpen = process.env.ALLOW_OPEN_TEST_LOGIN;
  const prevDemo = process.env.ALLOW_DEMO_LOGIN;

  afterEach(() => {
    process.env.NODE_ENV = prevNode;
    if (prevOpen === undefined) delete process.env.ALLOW_OPEN_TEST_LOGIN;
    else process.env.ALLOW_OPEN_TEST_LOGIN = prevOpen;
    if (prevDemo === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = prevDemo;
  });

  function cabinetRequest(cookie?: string) {
    const headers = new Headers();
    if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
    return new NextRequest("https://zxcvt005-tutoring-platform-302f.twc1.net/auditoria", {
      headers,
    });
  }

  it("ordinary production without session redirects to login", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_OPEN_TEST_LOGIN;
    process.env.ALLOW_DEMO_LOGIN = "1";
    const res = middleware(cabinetRequest());
    expect(res.headers.get("location")).toContain("/login");
  });

  it("open-test production allows cabinets without a session cookie", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_OPEN_TEST_LOGIN = "1";
    const res = middleware(cabinetRequest());
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("ordinary production with a session cookie is allowed", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_OPEN_TEST_LOGIN;
    const res = middleware(cabinetRequest("raw-session-token"));
    expect(res.headers.get("location")).toBeNull();
  });
});
