import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import { GET as getInvitations, POST as postInvitations } from "@/app/api/admin/invitations/route";
import { cabinetHomeForRole } from "@/lib/auth/roles";
import { CSRF_COOKIE, CSRF_HEADER } from "@/server/auth/constants";
import { SESSION_COOKIE } from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { accountInvitations, teachers, users } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  acceptInvitation,
  createProfileInvitation,
  getProfileAccessStatus,
  getPublicInvitation,
  hashInviteToken,
  revokeProfileInvitation,
} from "@/server/services/invitation-service";
import { upsertStudent, upsertTeacher } from "@/server/services/platform-mutations";
import { registerStudent } from "@/server/services/registration-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("account invitations", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asDirector(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("invites a teacher, activates account, and routes to kafedra", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const profile = await upsertTeacher(t.db, director, {
      fullName: "Invite Teacher",
      subjects: ["Математика"],
      status: "active",
    });

    const before = await getProfileAccessStatus(t.db, director, {
      teacherId: profile.id,
    });
    expect(before.accessStatus).toBe("unregistered");

    const created = await createProfileInvitation(t.db, director, {
      teacherId: profile.id,
    });
    expect(created.accessStatus).toBe("invited");
    expect(created.invitation).toBeTruthy();

    const publicView = await getPublicInvitation(t.db, created.rawToken);
    expect(publicView.status).toBe("pending");
    expect(publicView.kind).toBe("teacher");
    expect(publicView.cabinetLabel).toBe("Кафедра");

    const accepted = await acceptInvitation(t.db, {
      rawToken: created.rawToken,
      email: "invite.teacher@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(accepted.role).toBe("teacher");
    expect(accepted.teacherId).toBe(profile.id);
    expect(cabinetHomeForRole(accepted.role)).toBe("/kafedra");

    const ctx = await resolveAuthContext(t.db, accepted.session.rawToken);
    expect(ctx.role).toBe("teacher");
    expect(ctx.teacherId).toBe(profile.id);

    const after = await getProfileAccessStatus(t.db, director, {
      teacherId: profile.id,
    });
    expect(after.accessStatus).toBe("activated");
    expect(after.accountEmail).toBe("invite.teacher@example.com");

    const [hashRow] = await t.db
      .select({ tokenHash: accountInvitations.tokenHash })
      .from(accountInvitations)
      .where(eq(accountInvitations.id, created.invitation!.id))
      .limit(1);
    expect(hashRow?.tokenHash).toBe(hashInviteToken(created.rawToken));
    expect(hashRow?.tokenHash).not.toBe(created.rawToken);
  });

  it("invites a student, activates account, and routes to auditoria", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const profile = await upsertStudent(t.db, director, {
      fullName: "Invite Student",
      teacherId: "t1",
      status: "active",
    });

    const created = await createProfileInvitation(t.db, director, {
      studentId: profile.id,
    });
    const accepted = await acceptInvitation(t.db, {
      rawToken: created.rawToken,
      email: "invite.student@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(accepted.role).toBe("student");
    expect(accepted.studentId).toBe(profile.id);
    expect(cabinetHomeForRole(accepted.role)).toBe("/auditoria");

    const ctx = await resolveAuthContext(t.db, accepted.session.rawToken);
    expect(ctx.role).toBe("student");
    expect(ctx.studentId).toBe(profile.id);
  });

  it("rejects reuse, expiry, revoke, and occupied profile", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const profile = await upsertTeacher(t.db, director, {
      fullName: "Reuse Teacher",
      subjects: [],
      status: "active",
    });
    const created = await createProfileInvitation(t.db, director, {
      teacherId: profile.id,
    });

    await acceptInvitation(t.db, {
      rawToken: created.rawToken,
      email: "reuse.teacher@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });

    await expect(
      acceptInvitation(t.db, {
        rawToken: created.rawToken,
        email: "reuse.teacher2@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toMatchObject({ code: "conflict" });

    const profile2 = await upsertTeacher(t.db, director, {
      fullName: "Expire Teacher",
      subjects: [],
      status: "active",
    });
    const expiring = await createProfileInvitation(t.db, director, {
      teacherId: profile2.id,
    });
    await t.db
      .update(accountInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(accountInvitations.id, expiring.invitation!.id));
    await expect(
      acceptInvitation(t.db, {
        rawToken: expiring.rawToken,
        email: "expire.teacher@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    const expiredView = await getPublicInvitation(t.db, expiring.rawToken);
    expect(expiredView.status).toBe("expired");

    const profile3 = await upsertTeacher(t.db, director, {
      fullName: "Revoke Teacher",
      subjects: [],
      status: "active",
    });
    const revocable = await createProfileInvitation(t.db, director, {
      teacherId: profile3.id,
    });
    await revokeProfileInvitation(t.db, director, revocable.invitation!.id);
    await expect(
      acceptInvitation(t.db, {
        rawToken: revocable.rawToken,
        email: "revoke.teacher@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    const revokedView = await getPublicInvitation(t.db, revocable.rawToken);
    expect(revokedView.status).toBe("revoked");
    const afterRevoke = await getProfileAccessStatus(t.db, director, {
      teacherId: profile3.id,
    });
    expect(afterRevoke.accessStatus).toBe("unregistered");

    const profile4 = await upsertTeacher(t.db, director, {
      fullName: "Occupied Teacher",
      subjects: [],
      status: "active",
    });
    const occupiedInvite = await createProfileInvitation(t.db, director, {
      teacherId: profile4.id,
    });
    await acceptInvitation(t.db, {
      rawToken: occupiedInvite.rawToken,
      email: "occupied.teacher@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    await expect(
      createProfileInvitation(t.db, director, { teacherId: profile4.id })
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("allows recreating invite and rejects duplicate email", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const profile = await upsertStudent(t.db, director, {
      fullName: "Resend Student",
      teacherId: "t1",
      status: "active",
    });
    const first = await createProfileInvitation(t.db, director, {
      studentId: profile.id,
    });
    const second = await createProfileInvitation(t.db, director, {
      studentId: profile.id,
    });
    expect(second.invitation!.id).not.toBe(first.invitation!.id);

    const firstView = await getPublicInvitation(t.db, first.rawToken);
    expect(firstView.status).toBe("revoked");

    await expect(
      acceptInvitation(t.db, {
        rawToken: second.rawToken,
        email: "director@demo.local",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toMatchObject({ code: "conflict" });

    await acceptInvitation(t.db, {
      rawToken: second.rawToken,
      email: "resend.student@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
  });

  it("keeps public student registration and ignores role escalation attempts", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const publicReg = await registerStudent(t.db, {
      fullName: "Public Student",
      email: "public.student@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(publicReg.role).toBe("student");
    expect(publicReg.studentId).toBeTruthy();

    const profile = await upsertTeacher(t.db, director, {
      fullName: "Role Locked Teacher",
      subjects: [],
      status: "active",
    });
    const created = await createProfileInvitation(t.db, director, {
      teacherId: profile.id,
    });

    // Клиент не передаёт role — сервис всегда берёт kind из приглашения.
    const accepted = await acceptInvitation(t.db, {
      rawToken: created.rawToken,
      email: "role.locked@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(accepted.role).toBe("teacher");
    expect(accepted.role).not.toBe("director");

    const [memUser] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "role.locked@example.com"))
      .limit(1);
    expect(memUser).toBeTruthy();
  });

  it("returns a migration hint when account_invitations table is missing", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const profile = await upsertTeacher(t.db, director, {
      fullName: "Missing Table Teacher",
      subjects: [],
      status: "active",
    });

    const { sql } = await import("drizzle-orm");
    await t.db.execute(sql`drop table if exists account_invitations cascade`);

    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const res = await getInvitations(
      new Request(
        `http://localhost/api/admin/invitations?teacherId=${encodeURIComponent(profile.id)}`,
        {
          headers: {
            cookie: `${SESSION_COOKIE}=${session.rawToken}`,
          },
        }
      )
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { message: string; code: string } };
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message).toMatch(/0034_account_invitations/);
    expect(body.error.message).not.toBe("Внутренняя ошибка сервера");
  });

  it("creates an invitation through the admin HTTP API", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const profile = await upsertTeacher(t.db, director, {
      fullName: "Http Invite Teacher",
      subjects: [],
      status: "active",
    });
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const res = await postInvitations(
      new Request("http://localhost/api/admin/invitations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${session.rawToken}; ${CSRF_COOKIE}=csrf-test`,
          [CSRF_HEADER]: "csrf-test",
          origin: "http://localhost:43127",
        },
        body: JSON.stringify({ teacherId: profile.id }),
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      accessStatus: string;
      inviteUrl: string;
    };
    expect(body.accessStatus).toBe("invited");
    expect(body.inviteUrl).toMatch(/\/invite\//);
  });

  it("handles parallel accept of the same invite", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const profile = await upsertTeacher(t.db, director, {
      fullName: "Parallel Teacher",
      subjects: [],
      status: "active",
    });
    const created = await createProfileInvitation(t.db, director, {
      teacherId: profile.id,
    });

    const results = await Promise.allSettled([
      acceptInvitation(t.db, {
        rawToken: created.rawToken,
        email: "parallel.a@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      }),
      acceptInvitation(t.db, {
        rawToken: created.rawToken,
        email: "parallel.b@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [linked] = await t.db
      .select({ userId: teachers.userId })
      .from(teachers)
      .where(eq(teachers.id, profile.id))
      .limit(1);
    expect(linked?.userId).toBeTruthy();

    const openInvites = await t.db
      .select({ id: accountInvitations.id })
      .from(accountInvitations)
      .where(
        and(
          eq(accountInvitations.teacherId, profile.id),
          isNull(accountInvitations.usedAt),
          isNull(accountInvitations.revokedAt)
        )
      );
    expect(openInvites).toHaveLength(0);

    // Не создаём второй профиль преподавателя
    const teacherRows = await t.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.fullName, "Parallel Teacher"));
    expect(teacherRows).toHaveLength(1);
  });
});
