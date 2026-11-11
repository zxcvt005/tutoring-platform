import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonStudents,
  materialFolders,
  organizations,
  students,
  teachers,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  deleteMaterialFolder,
  moveMaterialToFolder,
  upsertMaterialFolder,
} from "@/server/services/folder-service";
import {
  archiveStudent,
  restoreStudent,
  setAttendance,
  upsertLesson,
  upsertStudent,
  upsertTeacher,
  upsertTopic,
} from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

/**
 * Sprint integrity suite: mandatory Director/Kafedra/cross-entity flows.
 * Uses isolated test DB only (createTestDb) — never Production.
 */
describe("biz integrity sprint scenarios", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function openDb() {
    const handle = await createTestDb();
    close = handle.close;
    return handle.db;
  }

  async function asRole(
    db: Awaited<ReturnType<typeof openDb>>,
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("director creates student linked to teacher; row appears in bootstrap", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const [teacher] = await db.select().from(teachers).limit(1);
    if (!teacher) throw new Error("expected teacher");

    const created = await upsertStudent(db, director, {
      fullName: "Спринт Ученик",
      grade: "9",
      status: "active",
      teacherId: teacher.id,
    });

    const [row] = await db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(row?.primaryTeacherId).toBe(teacher.id);
    expect(row?.organizationId).toBe(director.organizationId);
    expect(row?.status).toBe("active");

    const boot = await buildBootstrap(db, director);
    const listed = boot.students.find((s) => s.id === created.id);
    expect(listed?.fullName).toBe("Спринт Ученик");
    expect(listed?.teacherId).toBe(teacher.id);
  });

  it("director edits student and reassigns teacher", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const teacherRows = await db.select().from(teachers).limit(2);
    expect(teacherRows.length).toBeGreaterThanOrEqual(2);

    const created = await upsertStudent(db, director, {
      fullName: "Переназначение",
      grade: "10",
      status: "active",
      teacherId: teacherRows[0]!.id,
    });
    await upsertStudent(db, director, {
      id: created.id,
      fullName: "Переназначение Изм",
      grade: "11",
      status: "active",
      teacherId: teacherRows[1]!.id,
    });

    const [row] = await db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(row?.fullName).toBe("Переназначение Изм");
    expect(row?.grade).toBe("11");
    expect(row?.primaryTeacherId).toBe(teacherRows[1]!.id);
  });

  it("director creates teacher; student cannot", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const student = await asRole(db, "s1@demo.local");

    const created = await upsertTeacher(db, director, {
      fullName: "Спринт Преподаватель",
      subjects: ["Физика"],
      status: "active",
      email: `sprint-teacher-${Date.now()}@demo.local`,
    });
    expect(created.id).toBeTruthy();

    await expect(
      upsertTeacher(db, student, {
        fullName: "Hack",
        subjects: [],
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("creates one-student lessons, rejects multi-student, marks attendance", async () => {
    const db = await openDb();
    const anna = await asRole(db, "anna@example.com");
    const teacherId = anna.teacherId!;
    const startsAt = new Date(Date.now() + 9 * 86_400_000);
    startsAt.setHours(18, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    await expect(
      upsertLesson(db, anna, {
        teacherId,
        studentIds: ["s1", "s11"],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: "planned",
        subject: "Группа запрещена",
      })
    ).rejects.toMatchObject({ status: 400 });

    const lessonA = await upsertLesson(db, anna, {
      teacherId,
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Спринт занятие A",
    });
    const startsB = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const endsB = new Date(startsB.getTime() + 60 * 60_000);
    const lessonB = await upsertLesson(db, anna, {
      teacherId,
      studentIds: ["s11"],
      startsAt: startsB.toISOString(),
      endsAt: endsB.toISOString(),
      status: "planned",
      subject: "Спринт занятие B",
    });

    const linksA = await db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, lessonA.id));
    expect(linksA.map((l) => l.studentId)).toEqual(["s1"]);
    const linksB = await db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, lessonB.id));
    expect(linksB.map((l) => l.studentId)).toEqual(["s11"]);

    await setAttendance(db, anna, lessonA.id, "s1", "present");
    await setAttendance(db, anna, lessonB.id, "s11", "absent_excused");

    const boot = await buildBootstrap(db, anna);
    expect(
      boot.attendances.some(
        (a) => a.lessonId === lessonA.id && a.studentId === "s1" && a.status === "present"
      )
    ).toBe(true);
    expect(
      boot.attendances.some(
        (a) =>
          a.lessonId === lessonB.id &&
          a.studentId === "s11" &&
          a.status === "absent_excused"
      )
    ).toBe(true);
  });

  it("creates folder, moves topic into it, archives and restores student", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const anna = await asRole(db, "anna@example.com");
    const teacherId = anna.teacherId!;

    const folder = await upsertMaterialFolder(db, anna, {
      title: "Спринт папка",
      ownerScope: "teacher",
      teacherId,
      parentId: null,
    });
    const topic = await upsertTopic(db, anna, {
      teacherId,
      title: "Спринт тема",
      subject: "Физика",
      description: "Описание для спринт-теста папок",
      status: "active",
    });
    await moveMaterialToFolder(
      db,
      anna,
      { kind: "topic", id: topic.id },
      folder.id
    );

    const [moved] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id))
      .limit(1);
    expect(moved?.folderId).toBe(folder.id);

    const created = await upsertStudent(db, director, {
      fullName: "Архив Спринт",
      grade: "8",
      status: "active",
      teacherId,
    });
    await archiveStudent(db, director, {
      id: created.id,
      reason: "stopped",
    });
    const [archived] = await db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(archived?.status).toBe("archived");
    expect(archived?.primaryTeacherId).toBeNull();

    await restoreStudent(db, director, created.id);
    const [restored] = await db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(restored?.status).toBe("active");

    await deleteMaterialFolder(db, anna, folder.id, "move_to_parent");
    const leftover = await db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.id, folder.id));
    expect(leftover).toHaveLength(0);
  });

  it("blocks cross-organization student mutation", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const created = await upsertStudent(db, director, {
      fullName: "Чужая орг",
      grade: "9",
      status: "active",
      teacherId: "",
    });

    const slug = `other-school-${Date.now()}`;
    const [otherOrg] = await db
      .insert(organizations)
      .values({
        id: `org_other_${Date.now()}`,
        name: "Other School",
        slug,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await db
      .update(students)
      .set({ organizationId: otherOrg!.id })
      .where(eq(students.id, created.id));

    await expect(
      upsertStudent(db, director, {
        id: created.id,
        fullName: "Hack rename",
        grade: "9",
        status: "active",
        teacherId: "",
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      archiveStudent(db, director, { id: created.id, reason: "stopped" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("teacher cannot assign student to another teacher on create", async () => {
    const db = await openDb();
    const anna = await asRole(db, "anna@example.com");
    const igor = await asRole(db, "igor@example.com");

    await expect(
      upsertStudent(db, anna, {
        fullName: "Ученик Анны",
        grade: "9",
        status: "active",
        teacherId: igor.teacherId!,
      })
    ).rejects.toMatchObject({ status: 403 });

    const created = await upsertStudent(db, anna, {
      fullName: "Ученик Анны",
      grade: "9",
      status: "active",
      teacherId: anna.teacherId!,
    });
    const [row] = await db
      .select()
      .from(students)
      .where(eq(students.id, created.id))
      .limit(1);
    expect(row?.primaryTeacherId).toBe(anna.teacherId);
  });

  it("school folders stay school-scoped (null teacherId)", async () => {
    const db = await openDb();
    const director = await asRole(db, "director@demo.local");
    const folder = await upsertMaterialFolder(db, director, {
      title: "Школьный корень спринт",
      ownerScope: "school",
      parentId: null,
    });
    const [row] = await db
      .select()
      .from(materialFolders)
      .where(
        and(
          eq(materialFolders.id, folder.id),
          eq(materialFolders.ownerScope, "school"),
          isNull(materialFolders.teacherId)
        )
      )
      .limit(1);
    expect(row).toBeTruthy();
  });
});
