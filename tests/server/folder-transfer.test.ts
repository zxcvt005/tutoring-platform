import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import { resolveAuthContext } from "@/server/authz/context";
import {
  intensives,
  materialFolders,
  teachers,
  tests,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertMaterialFolder } from "@/server/services/folder-service";
import {
  transferFolderToSchool,
  transferFolderToTeachers,
} from "@/server/services/knowledge-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("folder subtree transfer", () => {
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

  async function login(
    db: Awaited<ReturnType<typeof openDb>>,
    email: string
  ): Promise<AuthContext> {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("copies a school folder tree to a teacher with remapped parents", async () => {
    const db = await openDb();
    const ctx = await login(db, "director@demo.local");
    const [teacher] = await db.select().from(teachers).limit(1);
    if (!teacher) throw new Error("expected seeded teacher");
    const orgId = ctx.organizationId;
    const teacherId = teacher.id;

    const root = await upsertMaterialFolder(db, ctx, {
      title: "Школьная физика",
      ownerScope: "school",
      parentId: null,
    });
    const child = await upsertMaterialFolder(db, ctx, {
      title: "Механика",
      ownerScope: "school",
      parentId: root.id,
    });
    await db.insert(topics).values({
      id: `tp_folder_xfer_${Date.now()}`,
      organizationId: orgId,
      teacherId: null,
      libraryScope: "school",
      sectionId: null,
      folderId: child.id,
      title: "Кинематика",
      subject: "Физика",
      description: "Описание",
      status: "active",
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await transferFolderToTeachers(db, ctx, {
      sourceFolderId: root.id,
      teacherIds: [teacherId],
      phase: "commit",
      duplicatePolicy: "skip",
    });

    expect(result.failed).toEqual([]);
    expect(result.foldersCreated).toBeGreaterThanOrEqual(2);
    expect(result.created).toBeGreaterThanOrEqual(1);
    expect(result.intensivesNotTransferred).toBe(0);

    const teacherFolders = await db
      .select()
      .from(materialFolders)
      .where(
        and(
          eq(materialFolders.organizationId, orgId),
          eq(materialFolders.ownerScope, "teacher"),
          eq(materialFolders.teacherId, teacherId)
        )
      );
    const rootCopy = teacherFolders.find((f) => f.title === "Школьная физика");
    const childCopy = teacherFolders.find((f) => f.title === "Механика");
    expect(rootCopy?.parentId).toBeNull();
    expect(childCopy?.parentId).toBe(rootCopy?.id);

    const topicCopies = await db
      .select()
      .from(topics)
      .where(and(eq(topics.organizationId, orgId), eq(topics.teacherId, teacherId)));
    expect(topicCopies.some((t) => t.folderId === childCopy?.id)).toBe(true);
  });

  it("reports intensives in the subtree without copying them (school → teacher)", async () => {
    const db = await openDb();
    const ctx = await login(db, "director@demo.local");
    const [teacher] = await db.select().from(teachers).limit(1);
    if (!teacher) throw new Error("expected seeded teacher");

    const root = await upsertMaterialFolder(db, ctx, {
      title: "Папка с интенсивом",
      ownerScope: "school",
      parentId: null,
    });
    await db.insert(intensives).values({
      id: `int_folder_xfer_${Date.now()}`,
      organizationId: ctx.organizationId,
      teacherId: null,
      libraryScope: "school",
      folderId: root.id,
      title: "Интенсив в папке",
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await transferFolderToTeachers(db, ctx, {
      sourceFolderId: root.id,
      teacherIds: [teacher.id],
      phase: "commit",
      duplicatePolicy: "skip",
    });
    expect(result.intensivesNotTransferred).toBe(1);
    const teacherIntensives = await db
      .select()
      .from(intensives)
      .where(
        and(
          eq(intensives.organizationId, ctx.organizationId),
          eq(intensives.teacherId, teacher.id),
          eq(intensives.title, "Интенсив в папке")
        )
      );
    expect(teacherIntensives).toHaveLength(0);
  });

  it("copies a teacher folder tree into the school library", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const teacherCtx = await login(db, "anna@example.com");
    const teacherId = teacherCtx.teacherId;
    if (!teacherId) throw new Error("expected teacher profile");
    const orgId = director.organizationId;

    const root = await upsertMaterialFolder(db, director, {
      title: "Личная папка",
      ownerScope: "teacher",
      teacherId,
      parentId: null,
    });
    await db.insert(tests).values({
      id: `hw_folder_xfer_${Date.now()}`,
      organizationId: orgId,
      topicId: null,
      sectionId: null,
      folderId: root.id,
      teacherId,
      libraryScope: "teacher",
      title: "Тест из папки",
      description: null,
      status: "published",
      purpose: "homework",
      maxScore: 10,
      questionsPublic: [],
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await transferFolderToSchool(db, teacherCtx, {
      sourceFolderId: root.id,
      phase: "commit",
      duplicatePolicy: "skip",
    });
    expect(result.failed).toEqual([]);
    expect(result.foldersCreated).toBeGreaterThanOrEqual(1);
    expect(result.intensivesNotTransferred).toBe(0);

    const schoolFolders = await db
      .select()
      .from(materialFolders)
      .where(
        and(
          eq(materialFolders.organizationId, orgId),
          eq(materialFolders.ownerScope, "school"),
          isNull(materialFolders.teacherId)
        )
      );
    expect(schoolFolders.some((f) => f.title === "Личная папка")).toBe(true);
  });

  it("reports intensives in the subtree without copying them (teacher → school)", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const teacherCtx = await login(db, "anna@example.com");
    const teacherId = teacherCtx.teacherId;
    if (!teacherId) throw new Error("expected teacher profile");

    const root = await upsertMaterialFolder(db, director, {
      title: "Личная с интенсивом",
      ownerScope: "teacher",
      teacherId,
      parentId: null,
    });
    await db.insert(intensives).values({
      id: `int_folder_school_${Date.now()}`,
      organizationId: director.organizationId,
      teacherId,
      libraryScope: "teacher",
      folderId: root.id,
      title: "Личный интенсив",
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await transferFolderToSchool(db, teacherCtx, {
      sourceFolderId: root.id,
      phase: "commit",
      duplicatePolicy: "skip",
    });
    expect(result.intensivesNotTransferred).toBe(1);
    const schoolCopy = await db
      .select()
      .from(intensives)
      .where(
        and(
          eq(intensives.organizationId, director.organizationId),
          isNull(intensives.teacherId),
          eq(intensives.title, "Личный интенсив")
        )
      );
    expect(schoolCopy).toHaveLength(0);
  });
});
