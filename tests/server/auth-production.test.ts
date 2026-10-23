import { describe, it, expect, afterEach } from "vitest";

import {
  isDemoLoginAllowed,
  isOpenTestLoginEnabled,
  isProductionRuntime,
} from "@/server/auth/env";
import {
  assertLoginNotRateLimited,
  recordLoginAttempt,
  rateLimited,
} from "@/server/auth/rate-limit";
import { assertPasswordPolicy, hashPassword } from "@/server/auth/password";
import { resolveAuthContext } from "@/server/authz/context";
import { memberships, organizations, users } from "@/server/db/schema";
import {
  bootstrapFirstAdmin,
  needsBootstrapAdmin,
} from "@/server/services/bootstrap-admin-service";
import {
  createOrgUser,
  listOrgUsers,
} from "@/server/services/admin-users-service";
import {
  loginWithPassword,
  logout,
} from "@/server/services/auth-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("production auth hardening", () => {
  let close: (() => Promise<void>) | undefined;
  const prevDemo = process.env.ALLOW_DEMO_LOGIN;
  const prevOpen = process.env.ALLOW_OPEN_TEST_LOGIN;
  const prevNode = process.env.NODE_ENV;
  const prevToken = process.env.BOOTSTRAP_ADMIN_TOKEN;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    process.env.ALLOW_DEMO_LOGIN = prevDemo;
    process.env.NODE_ENV = prevNode;
    process.env.BOOTSTRAP_ADMIN_TOKEN = prevToken;
    if (prevOpen === undefined) delete process.env.ALLOW_OPEN_TEST_LOGIN;
    else process.env.ALLOW_OPEN_TEST_LOGIN = prevOpen;
  });

  it("demo login is never allowed when NODE_ENV=production without open-test flag", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEMO_LOGIN = "1";
    delete process.env.ALLOW_OPEN_TEST_LOGIN;
    expect(isProductionRuntime()).toBe(true);
    expect(isOpenTestLoginEnabled()).toBe(false);
    expect(isDemoLoginAllowed()).toBe(false);
  });

  it("open-test flag enables demo login in production without changing NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_OPEN_TEST_LOGIN = "1";
    delete process.env.ALLOW_DEMO_LOGIN;
    expect(isProductionRuntime()).toBe(true);
    expect(isOpenTestLoginEnabled()).toBe(true);
    expect(isDemoLoginAllowed()).toBe(true);
  });

  it("open-test flag off keeps ordinary production locked", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_OPEN_TEST_LOGIN = "0";
    process.env.ALLOW_DEMO_LOGIN = "1";
    expect(isDemoLoginAllowed()).toBe(false);
  });

  it("demo login allowed in development with ALLOW_DEMO_LOGIN=1", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_LOGIN = "1";
    delete process.env.ALLOW_OPEN_TEST_LOGIN;
    expect(isDemoLoginAllowed()).toBe(true);
  });

  it("password policy rejects weak passwords", () => {
    expect(() => assertPasswordPolicy("short")).toThrow();
    expect(() => assertPasswordPolicy("onlylettersxxxx")).toThrow();
    expect(() => assertPasswordPolicy("12345678901")).toThrow();
    expect(() => assertPasswordPolicy("GoodPass12")).not.toThrow();
  });

  it("logout revokes session token", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    await logout(t.db, session.rawToken);
    await expect(
      resolveAuthContext(t.db, session.rawToken)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rate limit blocks after repeated failures", async () => {
    const t = await createTestDb();
    close = t.close;
    const email = "director@demo.local";
    for (let i = 0; i < 8; i++) {
      await recordLoginAttempt(t.db, { email, ip: "1.2.3.4", success: false });
    }
    await expect(
      assertLoginNotRateLimited(t.db, { email, ip: "1.2.3.4" })
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    expect(rateLimited().status).toBe(429);
  });

  it("bootstrap creates first director only once", async () => {
    const t = await createTestDb();
    close = t.close;

    // очищаем seed org — имитация пустой БД для bootstrap
    await t.db.delete(organizations);
    await t.db.delete(users);

    expect(await needsBootstrapAdmin(t.db)).toBe(true);

    process.env.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-token-for-tests-32chars!!";

    const created = await bootstrapFirstAdmin(t.db, {
      token: "bootstrap-token-for-tests-32chars!!",
      email: "admin@school.test",
      password: "AdminPass99xx",
      fullName: "Админ",
      organizationName: "Тест-школа",
      organizationSlug: "test-school",
    });
    expect(created.role).toBe("director");
    expect(await needsBootstrapAdmin(t.db)).toBe(false);

    await expect(
      bootstrapFirstAdmin(t.db, {
        token: "bootstrap-token-for-tests-32chars!!",
        email: "other@school.test",
        password: "AdminPass99xx",
        fullName: "Другой",
        organizationName: "Ещё",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("director can create users; student cannot; org isolation", async () => {
    const t = await createTestDb();
    close = t.close;

    const dirLogin = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const dirCtx = await resolveAuthContext(t.db, dirLogin.session.rawToken);

    const created = await createOrgUser(t.db, dirCtx, {
      email: "new.teacher@demo.local",
      password: "TeacherPass1x",
      fullName: "Новый Учитель",
      role: "teacher",
    });
    expect(created.role).toBe("teacher");

    const list = await listOrgUsers(t.db, dirCtx);
    expect(list.some((u) => u.email === "new.teacher@demo.local")).toBe(true);

    const stuLogin = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const stuCtx = await resolveAuthContext(t.db, stuLogin.session.rawToken);
    await expect(
      createOrgUser(t.db, stuCtx, {
        email: "hack@demo.local",
        password: "HackerPass1x",
        fullName: "Hack",
        role: "director",
      })
    ).rejects.toMatchObject({ status: 403 });

    // чужая org: membership другого org не попадает в list
    await t.db.insert(organizations).values({
      id: "org_other",
      name: "Other",
      slug: "other-school",
    });
    const hash = await hashPassword("OtherAdmin1x");
    await t.db.insert(users).values({
      id: "user_other_admin",
      email: "other-admin@other.test",
      passwordHash: hash,
      fullName: "Other",
      status: "active",
    });
    await t.db.insert(memberships).values({
      id: "mem_other",
      organizationId: "org_other",
      userId: "user_other_admin",
      role: "director",
    });

    const again = await listOrgUsers(t.db, dirCtx);
    expect(again.some((u) => u.email === "other-admin@other.test")).toBe(false);
  });

  it("wrong bootstrap token is rejected", async () => {
    const t = await createTestDb();
    close = t.close;
    await t.db.delete(organizations);
    await t.db.delete(users);
    process.env.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-token-for-tests-32chars!!";
    await expect(
      bootstrapFirstAdmin(t.db, {
        token: "wrong-token-wrong-token-wrong!!",
        email: "a@b.c",
        password: "AdminPass99xx",
        fullName: "X",
        organizationName: "Y",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
