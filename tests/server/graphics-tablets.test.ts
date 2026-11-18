import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { studentGraphicsTablets, students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  listGraphicsTablets,
  updateGraphicsTablet,
} from "@/server/services/graphics-tablets-service";
import { upsertStudent } from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("graphics tablets (Пресса)", () => {
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

  it("lists all students with defaults and persists manual fields", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertStudent(t.db, director, {
      fullName: "Новый Ученик Планшет",
      grade: "9",
      status: "active",
      teacherId: "",
    });

    const listed = await listGraphicsTablets(t.db, press);
    const ids = listed.map((r) => r.studentId);
    expect(new Set(ids).size).toBe(ids.length);
    const row = listed.find((r) => r.studentId === created.id);
    expect(row).toMatchObject({
      studentFullName: "Новый Ученик Планшет",
      trialCompleted: false,
      address: "",
      tabletStatus: "not_needed",
      updatedAt: null,
    });

    const saved = await updateGraphicsTablet(t.db, press, {
      studentId: created.id,
      expectedUpdatedAt: null,
      trialCompleted: true,
      address: "Москва, ул. Примерная, 1",
      tabletStatus: "ordered",
    });
    expect(saved.trialCompleted).toBe(true);
    expect(saved.address).toBe("Москва, ул. Примерная, 1");
    expect(saved.tabletStatus).toBe("ordered");
    expect(saved.updatedAt).toBeTruthy();

    await upsertStudent(t.db, director, {
      id: created.id,
      fullName: "Новый Ученик Планшет (переименован)",
      grade: "9",
      status: "active",
      teacherId: "",
    });

    const afterRename = await listGraphicsTablets(t.db, press);
    const renamed = afterRename.find((r) => r.studentId === created.id)!;
    expect(renamed.studentFullName).toBe("Новый Ученик Планшет (переименован)");
    expect(renamed.trialCompleted).toBe(true);
    expect(renamed.address).toBe("Москва, ул. Примерная, 1");
    expect(renamed.tabletStatus).toBe("ordered");

    const toggled = await updateGraphicsTablet(t.db, press, {
      studentId: created.id,
      expectedUpdatedAt: renamed.updatedAt,
      trialCompleted: false,
      tabletStatus: "not_needed",
    });
    expect(toggled.trialCompleted).toBe(false);
    expect(toggled.tabletStatus).toBe("not_needed");
    expect(toggled.address).toBe("Москва, ул. Примерная, 1");
  });

  it("forbids director and students; keeps one row per student", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");
    const student = await asRole(t.db, "s1@demo.local");

    await expect(listGraphicsTablets(t.db, director)).rejects.toMatchObject({
      status: 403,
    });
    await expect(listGraphicsTablets(t.db, student)).rejects.toMatchObject({
      status: 403,
    });

    const listed = await listGraphicsTablets(t.db, press);
    const target = listed[0]!;
    await updateGraphicsTablet(t.db, press, {
      studentId: target.studentId,
      expectedUpdatedAt: null,
      address: "А",
    });
    await expect(
      updateGraphicsTablet(t.db, press, {
        studentId: target.studentId,
        expectedUpdatedAt: null,
        address: "Б",
      })
    ).rejects.toMatchObject({ status: 409 });

    const tabletRows = await t.db
      .select()
      .from(studentGraphicsTablets)
      .where(eq(studentGraphicsTablets.studentId, target.studentId));
    expect(tabletRows).toHaveLength(1);
  });

  it("drops tablet row when student is deleted without orphan errors", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");

    const created = await upsertStudent(t.db, director, {
      fullName: "Удаляемый для планшета",
      status: "active",
      teacherId: "",
    });
    await updateGraphicsTablet(t.db, press, {
      studentId: created.id,
      expectedUpdatedAt: null,
      address: "адрес",
      tabletStatus: "ordered",
    });

    await t.db.delete(students).where(eq(students.id, created.id));

    const orphans = await t.db
      .select()
      .from(studentGraphicsTablets)
      .where(eq(studentGraphicsTablets.studentId, created.id));
    expect(orphans).toHaveLength(0);

    const listed = await listGraphicsTablets(t.db, press);
    expect(listed.find((r) => r.studentId === created.id)).toBeUndefined();
  });
});
