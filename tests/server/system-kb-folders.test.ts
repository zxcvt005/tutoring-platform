import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { materialFolders, topics } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { pasteMaterialFolderTree } from "@/server/services/folder-copy-service";
import {
  deleteMaterialFolder,
  ensureSystemKnowledgeFolders,
  listMaterialFolders,
  moveMaterialFolder,
  upsertMaterialFolder,
} from "@/server/services/folder-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("system knowledge folders + copy", () => {
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

  it("ensures 12 system folders without duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    await ensureSystemKnowledgeFolders(t.db, director.organizationId, {
      ownerScope: "school",
      teacherId: null,
    });
    await ensureSystemKnowledgeFolders(t.db, director.organizationId, {
      ownerScope: "school",
      teacherId: null,
    });

    const listed = await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    const system = listed.filter((f) => f.systemKey);
    expect(system).toHaveLength(12);
    expect(system.filter((f) => f.parentId == null)).toHaveLength(2);
  });

  it("blocks delete/move/rename/copy of system folders", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const listed = await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    const physics = listed.find((f) => f.systemKey === "subject:physics");
    expect(physics).toBeTruthy();

    await expect(
      deleteMaterialFolder(t.db, director, physics!.id)
    ).rejects.toThrow(/системн/i);

    await expect(
      moveMaterialFolder(t.db, director, physics!.id, null)
    ).rejects.toThrow(/системн/i);

    await expect(
      upsertMaterialFolder(t.db, director, {
        id: physics!.id,
        title: "Другое",
        parentId: null,
        ownerScope: "school",
      })
    ).rejects.toThrow(/системн/i);

    await expect(
      pasteMaterialFolderTree(t.db, director, {
        sourceFolderId: physics!.id,
        targetParentId: null,
      })
    ).rejects.toThrow(/системн/i);
  });

  it("copies nested folder with topic independently", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const listed = await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    const grade7 = listed.find((f) => f.systemKey === "grade:physics:7");
    expect(grade7).toBeTruthy();

    const parent = await upsertMaterialFolder(t.db, director, {
      title: "Блок A",
      parentId: grade7!.id,
      ownerScope: "school",
      contentKind: "topic",
    });
    const child = await upsertMaterialFolder(t.db, director, {
      title: "Вложенная",
      parentId: parent.id,
      ownerScope: "school",
      contentKind: "topic",
    });

    const topicId = `tp_copy_${Date.now()}`;
    await t.db.insert(topics).values({
      id: topicId,
      organizationId: director.organizationId,
      teacherId: null,
      libraryScope: "school",
      folderId: child.id,
      title: "Кинематика",
      subject: "Физика",
      description: "test",
      status: "active",
      sortOrder: 0,
    });

    const target = listed.find((f) => f.systemKey === "grade:physics:8");
    const pasted = await pasteMaterialFolderTree(t.db, director, {
      sourceFolderId: parent.id,
      targetParentId: target!.id,
    });
    expect(pasted.folderId).not.toBe(parent.id);

    const copies = await t.db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.parentId, target!.id));
    const copiedRoot = copies.find((c) => c.title === "Блок A");
    expect(copiedRoot).toBeTruthy();
    expect(copiedRoot!.id).not.toBe(parent.id);

    const nested = await t.db
      .select()
      .from(materialFolders)
      .where(eq(materialFolders.parentId, copiedRoot!.id));
    expect(nested.some((n) => n.title === "Вложенная")).toBe(true);

    const topicCopies = await t.db
      .select()
      .from(topics)
      .where(eq(topics.folderId, nested.find((n) => n.title === "Вложенная")!.id));
    expect(topicCopies).toHaveLength(1);
    expect(topicCopies[0]!.id).not.toBe(topicId);
    expect(topicCopies[0]!.title).toBe("Кинематика");

    await t.db.delete(topics).where(eq(topics.id, topicId));
    const stillThere = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topicCopies[0]!.id));
    expect(stillThere).toHaveLength(1);

    await expect(
      pasteMaterialFolderTree(t.db, director, {
        sourceFolderId: parent.id,
        targetParentId: parent.id,
      })
    ).rejects.toThrow(/внутрь/i);
  });

  it("blocks duplicate Physics at root", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    await expect(
      upsertMaterialFolder(t.db, director, {
        title: "Физика",
        parentId: null,
        ownerScope: "school",
      })
    ).rejects.toThrow(/систем/i);
  });

  it("blocks DnD-equivalent move of system folder via API", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const listed = await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    const physics = listed.find((f) => f.systemKey === "subject:physics")!;
    const math = listed.find((f) => f.systemKey === "subject:math")!;
    await expect(
      moveMaterialFolder(t.db, director, physics.id, math.id)
    ).rejects.toThrow(/системн/i);
  });

  it("ensures teacher space separately from school", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacher = await resolveAuthContext(t.db, session.rawToken);

    const school = await listMaterialFolders(t.db, director, {
      ownerScope: "school",
      teacherId: null,
    });
    const own = await listMaterialFolders(t.db, teacher, {
      ownerScope: "teacher",
      teacherId: teacher.teacherId!,
    });
    expect(school.filter((f) => f.systemKey)).toHaveLength(12);
    expect(own.filter((f) => f.systemKey)).toHaveLength(12);
    expect(
      school.find((f) => f.systemKey === "subject:physics")!.id
    ).not.toBe(own.find((f) => f.systemKey === "subject:physics")!.id);

    const schoolRoot = await t.db
      .select()
      .from(materialFolders)
      .where(
        and(
          eq(materialFolders.organizationId, director.organizationId),
          eq(materialFolders.ownerScope, "school"),
          isNull(materialFolders.parentId)
        )
      );
    expect(schoolRoot.some((r) => r.systemKey === "subject:physics")).toBe(true);
  });
});
