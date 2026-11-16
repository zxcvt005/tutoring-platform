import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { upsertStudent } from "@/server/services/platform-mutations";
import { physicsDirectionId, seedPaidLessons } from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("student profile fields", () => {
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
    return resolveAuthContext(db, session.rawToken);
  }

  it("creates and edits grade, contacts, parents, notes without losing data", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertStudent(t.db, director, {
      fullName: "Тест Ученик",
      grade: "10",
      telegram: "@test_student",
      phone: "+79991234567",
      parentContacts: "Мама +7…",
      notes: "Внутренняя заметка",
      status: "active",
      teacherId: "t1",
    });

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(row.grade).toBe("10");
    expect(row.telegram).toBe("@test_student");
    expect(row.phone).toBe("+79991234567");
    expect(row.parentContacts).toBe("Мама +7…");
    expect(row.notes).toBe("Внутренняя заметка");

    await upsertStudent(t.db, director, {
      id: created.id,
      fullName: "Тест Ученик",
      grade: "11",
      telegram: "@test_student",
      phone: "+79991234567",
      parentContacts: "Мама +7…",
      notes: "Внутренняя заметка",
      status: "paused",
      teacherId: "t1",
    });

    const [updated] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(updated.grade).toBe("11");
    expect(updated.status).toBe("paused");
    expect(updated.parentContacts).toBe("Мама +7…");
    expect(updated.notes).toBe("Внутренняя заметка");
  });

  it("does not expose parentContacts or notes to student bootstrap", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const studentCtx = await asRole(t.db, "s1@demo.local");

    await upsertStudent(t.db, director, {
      id: "s1",
      fullName: "Ученик Демо",
      grade: "9",
      telegram: "@s1",
      phone: "+70000000001",
      parentContacts: "Секрет родителей",
      notes: "Секрет администрации",
      status: "active",
      teacherId: "t1",
    });

    const studentBoot = await buildBootstrap(t.db, studentCtx);
    const me = studentBoot.students.find((s) => s.id === "s1");
    expect(me).toBeTruthy();
    expect(me!.grade).toBe("9");
    expect(me!.telegram).toBe("@s1");
    expect(me!.phone).toBe("+70000000001");
    expect(me!.parentContacts).toBeUndefined();
    expect(me!.notes).toBeUndefined();

    const directorBoot = await buildBootstrap(t.db, director);
    const staffView = directorBoot.students.find((s) => s.id === "s1");
    expect(staffView!.parentContacts).toBe("Секрет родителей");
    expect(staffView!.notes).toBe("Секрет администрации");
  });

  it("student may update only personal telegram/phone", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const studentCtx = await asRole(t.db, "s1@demo.local");

    await upsertStudent(t.db, director, {
      id: "s1",
      fullName: "Ученик Демо",
      grade: "8",
      telegram: null,
      phone: null,
      parentContacts: "Родители",
      notes: "Заметка",
      status: "active",
      teacherId: "t1",
    });

    await upsertStudent(t.db, studentCtx, {
      id: "s1",
      fullName: "Хакер",
      grade: "11",
      telegram: "@new_tg",
      phone: "+71111111111",
      parentContacts: "Взломано",
      notes: "Взломано",
      status: "paused",
      teacherId: "",
    });

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s1"))
      .limit(1);
    expect(row.fullName).toBe("Ученик Демо");
    expect(row.grade).toBe("8");
    expect(row.telegram).toBe("@new_tg");
    expect(row.phone).toBe("+71111111111");
    expect(row.parentContacts).toBe("Родители");
    expect(row.notes).toBe("Заметка");
    expect(row.status).toBe("active");
  });

  it("editing student does not create duplicate paid lesson orders", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 6,
      tariffId: "tar_profile_no_dup",
    });

    const before = await buildBootstrap(t.db, director);
    const countBefore = before.lessonOrders.filter(
      (o) => o.studentId === "s1" && o.status === "paid"
    ).length;

    await upsertStudent(t.db, director, {
      id: "s1",
      fullName: "Ученик Демо",
      grade: "10",
      telegram: "@s1",
      phone: null,
      parentContacts: null,
      notes: "только заметка",
      status: "active",
      teacherId: "t1",
    });

    const after = await buildBootstrap(t.db, director);
    const countAfter = after.lessonOrders.filter(
      (o) => o.studentId === "s1" && o.status === "paid"
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it("old students without new fields still bootstrap", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const boot = await buildBootstrap(t.db, director);
    const s = boot.students[0];
    expect(s).toBeTruthy();
    expect(s!.grade == null || typeof s!.grade === "string").toBe(true);
    expect(s!.createdAt).toBeTruthy();
  });
});
