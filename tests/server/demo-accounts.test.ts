import { describe, it, expect, afterEach } from "vitest";

import { isDemoLoginAllowed } from "@/server/auth/env";
import {
  listDemoAccounts,
  resolveDemoLoginEmail,
} from "@/server/services/demo-accounts";
import {
  SCHOOL_ORG_ID,
  seedSchoolOrganization,
} from "@/server/db/seed-school";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";
import { loginWithPassword } from "@/server/services/auth-service";

describe("demo accounts (school seed)", () => {
  let close: (() => Promise<void>) | undefined;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_DEMO_LOGIN;
  const prevOpen = process.env.ALLOW_OPEN_TEST_LOGIN;

  afterEach(async () => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevAllow === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = prevAllow;
    if (prevOpen === undefined) delete process.env.ALLOW_OPEN_TEST_LOGIN;
    else process.env.ALLOW_OPEN_TEST_LOGIN = prevOpen;
    if (close) await close();
    close = undefined;
  });

  it("lists director, 3 teachers and 20 students after school seed", async () => {
    const t = await createTestDb();
    close = t.close;
    await seedSchoolOrganization(t.db, new Date(2026, 9, 21, 12, 0, 0, 0));

    const { organizationId, accounts } = await listDemoAccounts(t.db);
    expect(organizationId).toBe(SCHOOL_ORG_ID);
    expect(accounts.filter((a) => a.group === "director")).toHaveLength(1);
    expect(accounts.filter((a) => a.group === "teachers")).toHaveLength(3);
    expect(accounts.filter((a) => a.group === "students")).toHaveLength(20);
    expect(accounts.some((a) => a.note === "без преподавателя")).toBe(true);
  });

  it("resolves school emails and logs in with DEMO password", async () => {
    const t = await createTestDb();
    close = t.close;
    await seedSchoolOrganization(t.db, new Date(2026, 9, 21, 12, 0, 0, 0));

    const email = await resolveDemoLoginEmail(t.db, {
      role: "teacher",
      teacherId: "sch_t1",
    });
    expect(email).toBe("morozova@umba-school.test");

    const { user } = await loginWithPassword(t.db, {
      email,
      password: DEMO_PASSWORD,
    });
    expect(user.email).toBe(email);
  });

  it("demo login helper is blocked conceptually in production env flag", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_DEMO_LOGIN;
    delete process.env.ALLOW_OPEN_TEST_LOGIN;
    expect(isDemoLoginAllowed()).toBe(false);
  });

  it("open-test flag allows demo login helper in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_OPEN_TEST_LOGIN = "1";
    expect(isDemoLoginAllowed()).toBe(true);
  });
});
