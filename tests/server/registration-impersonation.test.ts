import { and, eq } from "drizzle-orm";
import { describe, it, expect, afterEach } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { ApiError } from "@/server/errors";
import { auditLog, users } from "@/server/db/schema";
import {
  loginWithPassword,
  mePayload,
} from "@/server/services/auth-service";
import {
  startImpersonation,
  stopImpersonation,
} from "@/server/services/impersonation-service";
import {
  registerStudent,
  registerTeacher,
} from "@/server/services/registration-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("registration + impersonation", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("registers teacher with hashed password and allows login", async () => {
    const t = await createTestDb();
    close = t.close;

    const reg = await registerTeacher(t.db, {
      fullName: "Новый Преподаватель",
      email: "new.teacher@example.com",
      password: "SecurePass12",
      passwordConfirm: "SecurePass12",
      phone: "+79990001122",
      subjects: ["Математика"],
    });

    expect(reg.role).toBe("teacher");
    expect(reg.teacherId).toBeTruthy();

    const [row] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "new.teacher@example.com"))
      .limit(1);
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toContain("SecurePass12");
    expect(row?.passwordHash.startsWith("$2")).toBe(true);

    const login = await loginWithPassword(t.db, {
      email: "new.teacher@example.com",
      password: "SecurePass12",
    });
    const ctx = await resolveAuthContext(t.db, login.session.rawToken);
    expect(ctx.role).toBe("teacher");
    expect(ctx.teacherId).toBe(reg.teacherId);
    expect(ctx.impersonation).toBeNull();
  });

  it("rejects teacher registration when passwords differ", async () => {
    const t = await createTestDb();
    close = t.close;

    await expect(
      registerTeacher(t.db, {
        fullName: "X",
        email: "mismatch@example.com",
        password: "SecurePass12",
        passwordConfirm: "SecurePass99",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "Пароль и подтверждение не совпадают",
    });

    const [row] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, "mismatch@example.com"))
      .limit(1);
    expect(row).toBeUndefined();
  });

  it("registers student without self-assigning teacher or director role", async () => {
    const t = await createTestDb();
    close = t.close;

    const reg = await registerStudent(t.db, {
      fullName: "Новый Ученик",
      email: "new.student@example.com",
      password: "SecurePass12",
      passwordConfirm: "SecurePass12",
      contacts: "telegram @kid",
    });

    const ctx = await resolveAuthContext(t.db, reg.session.rawToken);
    expect(ctx.role).toBe("student");
    expect(ctx.studentId).toBe(reg.studentId);
    expect(ctx.teacherId).toBeNull();

    await expect(() => requireRoles(ctx, ["director"])).toThrow(ApiError);
  });

  it("rejects duplicate email on registration", async () => {
    const t = await createTestDb();
    close = t.close;

    await expect(
      registerTeacher(t.db, {
        fullName: "Dup",
        email: "anna@example.com",
        password: "SecurePass12",
        passwordConfirm: "SecurePass12",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("director can impersonate teacher and stop, with audit trail", async () => {
    const t = await createTestDb();
    close = t.close;

    const adminLogin = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const adminCtx = await resolveAuthContext(t.db, adminLogin.session.rawToken);
    expect(adminCtx.role).toBe("director");

    const teacherLogin = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacherUserId = teacherLogin.user.id;

    const started = await startImpersonation(t.db, adminCtx, {
      targetUserId: teacherUserId,
    });
    const impCtx = await resolveAuthContext(t.db, started.session.rawToken);
    expect(impCtx.role).toBe("teacher");
    expect(impCtx.userId).toBe(teacherUserId);
    expect(impCtx.impersonation?.active).toBe(true);
    expect(impCtx.impersonation?.actorUserId).toBe(adminCtx.userId);
    expect(mePayload(impCtx).impersonation?.actorUserId).toBe(adminCtx.userId);

    // В режиме просмотра нет директорских прав
    expect(() => requireRoles(impCtx, ["director"])).toThrow(ApiError);

    const stopped = await stopImpersonation(t.db, {
      impersonationRawToken: started.session.rawToken,
      adminRawToken: adminLogin.session.rawToken,
    });
    expect(stopped.adminUserId).toBe(adminCtx.userId);

    const restored = await resolveAuthContext(t.db, stopped.adminRawToken);
    expect(restored.role).toBe("director");
    expect(restored.impersonation).toBeNull();

    // Impersonation-сессия отозвана
    await expect(
      resolveAuthContext(t.db, started.session.rawToken)
    ).rejects.toMatchObject({ status: 401 });

    const audits = await t.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, adminCtx.userId),
          eq(auditLog.entityId, teacherUserId)
        )
      );
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toContain("impersonation_start");
    expect(actions).toContain("impersonation_stop");
  });

  it("forbids impersonation for non-director and by forging target id alone", async () => {
    const t = await createTestDb();
    close = t.close;

    const teacherLogin = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacherCtx = await resolveAuthContext(
      t.db,
      teacherLogin.session.rawToken
    );

    const studentLogin = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });

    await expect(
      startImpersonation(t.db, teacherCtx, {
        targetUserId: studentLogin.user.id,
      })
    ).rejects.toMatchObject({ status: 403 });

    const adminLogin = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const adminCtx = await resolveAuthContext(t.db, adminLogin.session.rawToken);

    await expect(
      startImpersonation(t.db, adminCtx, {
        targetUserId: "user_does_not_exist",
      })
    ).rejects.toMatchObject({ status: 404 });

    // Директора нельзя impersonate
    await expect(
      startImpersonation(t.db, adminCtx, {
        targetUserId: adminCtx.userId,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("stop rejects when admin cookie does not match impersonator", async () => {
    const t = await createTestDb();
    close = t.close;

    const adminLogin = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const adminCtx = await resolveAuthContext(t.db, adminLogin.session.rawToken);
    const teacherLogin = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });

    const started = await startImpersonation(t.db, adminCtx, {
      targetUserId: teacherLogin.user.id,
    });

    const otherAdmin = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });

    // Чужой/другой admin-токен не подходит, если userId другой — здесь тот же user,
    // но сессия другая; stop сравнивает userId impersonator, так что ok.
    // Проверяем отсутствие admin-токена:
    await expect(
      stopImpersonation(t.db, {
        impersonationRawToken: started.session.rawToken,
        adminRawToken: null,
      })
    ).rejects.toMatchObject({ status: 401 });

    // Токен обычного преподавателя как «admin» — forbidden
    await expect(
      stopImpersonation(t.db, {
        impersonationRawToken: started.session.rawToken,
        adminRawToken: teacherLogin.session.rawToken,
      })
    ).rejects.toMatchObject({ status: 403 });

    // Корректный stop с исходной сессией
    await stopImpersonation(t.db, {
      impersonationRawToken: started.session.rawToken,
      adminRawToken: adminLogin.session.rawToken,
    });
    expect(otherAdmin.user.id).toBe(adminCtx.userId);
  });
});
