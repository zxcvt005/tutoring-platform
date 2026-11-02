import { describe, expect, it } from "vitest";

import {
  arg,
  assertPasswordPolicy,
  createFirstDirector,
  organizationSlug,
  readBootstrapToken,
  tokensMatch,
} from "../../scripts/auth-bootstrap-admin.mjs";

const TOKEN = "bootstrap-token-for-tests-32chars!!";

function fakeSql(counts: { orgs: number; directors: number }) {
  const statements: string[] = [];
  const tx = (strings: TemplateStringsArray) => {
    const text = strings.join(" ");
    statements.push(text);
    if (text.includes("from organizations")) {
      return Promise.resolve([{ n: counts.orgs }]);
    }
    if (text.includes("from memberships")) {
      return Promise.resolve([{ n: counts.directors }]);
    }
    return Promise.resolve([]);
  };
  return {
    statements,
    sql: {
      begin: async (fn: (tx: typeof tx) => Promise<void>) => fn(tx),
    },
  };
}

describe("production bootstrap cli", () => {
  it("reads the same token rule as the app", () => {
    expect(readBootstrapToken({ BOOTSTRAP_ADMIN_TOKEN: TOKEN })).toBe(TOKEN);
    expect(readBootstrapToken({ BOOTSTRAP_ADMIN_TOKEN: "short" })).toBeNull();
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch("wrong-token-wrong-token-wrong!!", TOKEN)).toBe(false);
  });

  it("parses cli args and keeps an explicit slug", () => {
    const argv = ["--email", "a@b.c", "--password", "Secret"];
    expect(arg(argv, "email")).toBe("a@b.c");
    expect(arg(argv, "name")).toBeUndefined();
    expect(organizationSlug("My School")).toBe("my-school");
  });

  it("rejects a weak password before any insert", () => {
    expect(() => assertPasswordPolicy("short1")).toThrow(/10/);
    expect(() => assertPasswordPolicy("onlyletters")).toThrow(/буквы и цифры/);
  });

  it("inserts only the first organization, director and membership", async () => {
    const db = fakeSql({ orgs: 0, directors: 0 });
    const created = await createFirstDirector(db.sql as never, {
      token: TOKEN,
      email: " Admin@School.test ",
      password: "AdminPass99xx",
      fullName: "Директор",
      organizationName: "Школа",
      organizationSlug: "neodin",
      env: { BOOTSTRAP_ADMIN_TOKEN: TOKEN },
    });

    expect(created).toMatchObject({
      email: "admin@school.test",
      organizationSlug: "neodin",
      role: "director",
    });
    expect(db.statements).toHaveLength(5);
    expect(db.statements.some((sql) => sql.includes("insert into organizations"))).toBe(
      true
    );
    expect(db.statements.some((sql) => sql.includes("insert into users"))).toBe(true);
    expect(
      db.statements.some((sql) => sql.includes("insert into memberships"))
    ).toBe(true);
    expect(db.statements.some((sql) => /seed|demo|student/i.test(sql))).toBe(false);
  });

  it("does not insert when a director already exists", async () => {
    const db = fakeSql({ orgs: 1, directors: 1 });
    await expect(
      createFirstDirector(db.sql as never, {
        token: TOKEN,
        email: "admin@school.test",
        password: "AdminPass99xx",
        fullName: "Директор",
        organizationName: "Школа",
        env: { BOOTSTRAP_ADMIN_TOKEN: TOKEN },
      })
    ).rejects.toThrow("Администратор уже создан — bootstrap недоступен");
    expect(db.statements.some((sql) => sql.includes("insert into"))).toBe(false);
  });

  it("rejects a wrong token before writing", async () => {
    const db = fakeSql({ orgs: 0, directors: 0 });
    await expect(
      createFirstDirector(db.sql as never, {
        token: "wrong-token-wrong-token-wrong!!",
        email: "admin@school.test",
        password: "AdminPass99xx",
        fullName: "Директор",
        organizationName: "Школа",
        env: { BOOTSTRAP_ADMIN_TOKEN: TOKEN },
      })
    ).rejects.toThrow("Неверный bootstrap-токен");
    expect(db.statements).toHaveLength(0);
  });
});
