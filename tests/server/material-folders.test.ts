import { afterEach, describe, expect, it } from "vitest";

import {
  deleteMaterialFolder,
  getFolderContents,
  getFolderBreadcrumbs,
  listMaterialFolders,
  moveMaterialFolder,
  moveMaterialToFolder,
  searchFolderSpace,
  upsertMaterialFolder,
} from "@/server/services/folder-service";
import {
  deleteTopicSection,
  upsertHomework,
  upsertTopic,
  upsertTopicSection,
} from "@/server/services/platform-mutations";
import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { materialFolders, tests, topics } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("material folders service", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asTeacher() {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);
    return { db: t.db, ctx };
  }

  it("creates nested folders, breadcrumbs, mixed contents and blocks cycles", async () => {
    const { db, ctx } = await asTeacher();
    const root = await upsertMaterialFolder(db, ctx, {
      title: "Механика",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: null,
    });
    const child = await upsertMaterialFolder(db, ctx, {
      title: "Кинематика",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: root.id,
    });
    const deep = await upsertMaterialFolder(db, ctx, {
      title: "Ускорение",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: child.id,
    });

    const crumbs = await getFolderBreadcrumbs(db, ctx, deep.id, {
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
    });
    expect(crumbs.map((c) => c.title)).toEqual([
      "Корень",
      "Механика",
      "Кинематика",
      "Ускорение",
    ]);

    const topic = await upsertTopic(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тема кинематики",
      subject: "Физика",
      description: "Описание темы кинематики для теста папок",
      status: "active",
      folderId: child.id,
    });
    const hw = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тест кинематики",
      status: "draft",
      purpose: "homework",
      questions: [],
      folderId: child.id,
      sectionId: null,
    });

    const contents = await getFolderContents(
      db,
      ctx,
      { ownerScope: "teacher", teacherId: ctx.teacherId! },
      child.id
    );
    expect(contents.items.some((i) => i.kind === "folder" && i.id === deep.id)).toBe(
      true
    );
    expect(contents.items.some((i) => i.kind === "topic" && i.id === topic.id)).toBe(
      true
    );
    expect(contents.items.some((i) => i.kind === "test" && i.id === hw.id)).toBe(
      true
    );

    await expect(
      moveMaterialFolder(db, ctx, root.id, deep.id)
    ).rejects.toMatchObject({ status: 400 });

    await moveMaterialToFolder(
      db,
      ctx,
      { kind: "topic", id: topic.id },
      deep.id
    );
    const [moved] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(moved?.folderId).toBe(deep.id);

    const listed = await listMaterialFolders(db, ctx, {
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
    });
    expect(listed.length).toBeGreaterThanOrEqual(3);
  });

  it("deletes non-empty folder by moving contents to parent without deleting materials", async () => {
    const { db, ctx } = await asTeacher();
    const root = await upsertMaterialFolder(db, ctx, {
      title: "Корень-раздел",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
    });
    const nested = await upsertMaterialFolder(db, ctx, {
      title: "Вложенная",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: root.id,
    });
    const topic = await upsertTopic(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тема во вложенной",
      subject: "Физика",
      description: "Описание темы для удаления папки",
      status: "active",
      folderId: nested.id,
    });

    await deleteMaterialFolder(db, ctx, nested.id, "move_to_parent");
    const [still] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(still?.folderId).toBe(root.id);

    const gone = await db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.id, nested.id));
    expect(gone).toHaveLength(0);
  });

  it("migrates legacy sections via upsertTopicSection and remaps tests on delete (E0)", async () => {
    const { db, ctx } = await asTeacher();
    const sec = await upsertTopicSection(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Legacy раздел",
    });
    const folders = await db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.id, sec.id));
    expect(folders).toHaveLength(1);

    const topic = await upsertTopic(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тема в разделе",
      subject: "Физика",
      description: "Описание темы в legacy разделе",
      status: "active",
      sectionId: sec.id,
    });
    const hw = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тест в разделе",
      status: "draft",
      purpose: "homework",
      questions: [],
      sectionId: sec.id,
    });

    await deleteTopicSection(db, ctx, sec.id, null);
    const [t] = await db.select().from(topics).where(eq(topics.id, topic.id));
    const [h] = await db.select().from(tests).where(eq(tests.id, hw.id));
    expect(t?.folderId).toBeNull();
    expect(h?.folderId).toBeNull();
  });

  it("forbids teacher from managing another teacher space", async () => {
    const { db, ctx } = await asTeacher();
    await expect(
      upsertMaterialFolder(db, ctx, {
        title: "Чужая",
        ownerScope: "teacher",
        teacherId: "t_other_fake",
      })
    ).rejects.toMatchObject({ status: expect.any(Number) });
  });

  it("lists mixed material kinds in one folder and searches without per-folder N+1", async () => {
    const { db, ctx } = await asTeacher();
    const root = await upsertMaterialFolder(db, ctx, {
      title: "Смешанная",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
    });
    await upsertTopic(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тема смесь",
      subject: "Физика",
      description: "Описание темы для mixed explorer",
      status: "active",
      folderId: root.id,
    });
    await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Тест смесь",
      status: "draft",
      purpose: "homework",
      questions: [],
      folderId: root.id,
      sectionId: null,
    });
    const nested = await upsertMaterialFolder(db, ctx, {
      title: "Вложенная смесь",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: root.id,
    });

    const contents = await getFolderContents(
      db,
      ctx,
      { ownerScope: "teacher", teacherId: ctx.teacherId! },
      root.id
    );
    const kinds = new Set(contents.items.map((i) => i.kind));
    expect(kinds.has("folder")).toBe(true);
    expect(kinds.has("topic")).toBe(true);
    expect(kinds.has("test")).toBe(true);
    expect(contents.items.find((i) => i.id === nested.id)?.kind).toBe("folder");

    const found = await searchFolderSpace(
      db,
      ctx,
      { ownerScope: "teacher", teacherId: ctx.teacherId! },
      "смесь",
      "all",
      null
    );
    expect(found.items.some((i) => i.title.includes("Тема"))).toBe(true);
    expect(found.items.some((i) => i.title.includes("Тест"))).toBe(true);
    expect(found.items.some((i) => i.kind === "folder")).toBe(true);
  });

  it("forbids reading a folder from another teacher by id", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session: annaSession } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const anna = await resolveAuthContext(t.db, annaSession.rawToken);
    const folder = await upsertMaterialFolder(t.db, anna, {
      title: "Только Анна",
      ownerScope: "teacher",
      teacherId: anna.teacherId!,
    });

    const { session: igorSession } = await loginWithPassword(t.db, {
      email: "igor@example.com",
      password: DEMO_PASSWORD,
    });
    const igor = await resolveAuthContext(t.db, igorSession.rawToken);
    await expect(
      getFolderContents(
        t.db,
        igor,
        { ownerScope: "teacher", teacherId: anna.teacherId! },
        folder.id
      )
    ).rejects.toMatchObject({ status: expect.any(Number) });
  });

  it("forbids student school folders via API and omits them from bootstrap", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session: directorSession } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const director = await resolveAuthContext(t.db, directorSession.rawToken);
    const schoolFolder = await upsertMaterialFolder(t.db, director, {
      title: "Школьная секретная",
      ownerScope: "school",
      teacherId: null,
    });

    const { session: studentSession } = await loginWithPassword(t.db, {
      email: "s1@demo.local",
      password: DEMO_PASSWORD,
    });
    const student = await resolveAuthContext(t.db, studentSession.rawToken);
    await expect(
      listMaterialFolders(t.db, student, { ownerScope: "school", teacherId: null })
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(
      getFolderContents(
        t.db,
        student,
        { ownerScope: "school", teacherId: null },
        schoolFolder.id
      )
    ).rejects.toMatchObject({ status: expect.any(Number) });

    const boot = await buildBootstrap(t.db, student);
    expect(
      (boot.materialFolders ?? []).some(
        (f) => f.ownerScope === "school" || f.id === schoolFolder.id
      )
    ).toBe(false);

    const { session: pressSession } = await loginWithPassword(t.db, {
      email: "press@demo.local",
      password: DEMO_PASSWORD,
    });
    const press = await resolveAuthContext(t.db, pressSession.rawToken);
    const pressBoot = await buildBootstrap(t.db, press);
    expect(pressBoot.materialFolders ?? []).toEqual([]);
  });
});
