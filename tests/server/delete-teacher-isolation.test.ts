import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { memberships, sessions, teachers } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { createOrgUser } from "@/server/services/admin-users-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { deleteTeacher } from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("deleteTeacher isolation", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return { ctx: await resolveAuthContext(db, session.rawToken), session };
  }

  it("revokes sessions and org membership after teacher delete", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const email = `del-teacher-${Date.now()}@demo.local`;
    const created = await createOrgUser(t.db, director.ctx, {
      email,
      password: DEMO_PASSWORD,
      fullName: "Удаляемый Преподаватель",
      role: "teacher",
    });

    const [teacherRow] = await t.db
      .select()
      .from(teachers)
      .where(eq(teachers.userId, created.id))
      .limit(1);
    expect(teacherRow).toBeTruthy();

    const teacherLogin = await asRole(t.db, email);
    expect(teacherLogin.ctx.teacherId).toBe(teacherRow!.id);

    const beforeBoot = await buildBootstrap(t.db, teacherLogin.ctx);
    expect(beforeBoot.students.length).toBeGreaterThanOrEqual(0);

    await deleteTeacher(t.db, director.ctx, teacherRow!.id);

    const mem = await t.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, created.id),
          eq(memberships.organizationId, director.ctx.organizationId)
        )
      );
    expect(mem).toHaveLength(0);

    const sess = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, created.id));
    expect(sess).toHaveLength(0);

    await expect(
      resolveAuthContext(t.db, teacherLogin.session.rawToken)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("buildBootstrap returns empty lists when teacher role has no teacherId", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx } = await asRole(t.db, "anna@example.com");
    const orphan = { ...ctx, teacherId: null as string | null };
    const boot = await buildBootstrap(t.db, orphan);
    expect(boot.students).toEqual([]);
    expect(boot.lessons).toEqual([]);
    expect(boot.teachers).toEqual([]);
    expect(boot.currentTeacherId).toBe("");
  });
});
