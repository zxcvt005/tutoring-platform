import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { tests, topics } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertMaterialFolder } from "@/server/services/folder-service";
import {
  publishHomework,
  upsertHomework,
  upsertTopic,
  upsertTopicSection,
} from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";
import { ensureTeacherSubsection } from "../helpers/material-subsection";

const question = {
  id: "q_folder",
  type: "numeric" as const,
  prompt: "2+2",
  maxScore: 1,
  correctAnswers: ["4"],
};

describe("homework folder placement", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asAnna() {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);
    return { db: t.db, ctx };
  }

  async function nestedTestFolders(
    db: Awaited<ReturnType<typeof asAnna>>["db"],
    ctx: Awaited<ReturnType<typeof asAnna>>["ctx"]
  ) {
    const root = await upsertMaterialFolder(db, ctx, {
      title: "Раздел тестов",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      contentKind: "test",
    });
    const sub = await upsertMaterialFolder(db, ctx, {
      title: "Обычная папка",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: root.id,
      contentKind: "test",
    });
    const deep = await upsertMaterialFolder(db, ctx, {
      title: "Вложенная папка",
      ownerScope: "teacher",
      teacherId: ctx.teacherId!,
      parentId: sub.id,
      contentKind: "test",
    });
    return { root, sub, deep };
  }

  async function saved(db: Awaited<ReturnType<typeof asAnna>>["db"], id: string) {
    const [row] = await db.select().from(tests).where(eq(tests.id, id));
    return row;
  }

  it("creates a homework in the library root without a section", async () => {
    const { db, ctx } = await asAnna();
    const hw = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Корень",
      status: "draft",
      purpose: "homework",
      questions: [],
      folderId: null,
    });
    const row = await saved(db, hw.id);
    expect(row?.folderId).toBeNull();
    expect(row?.sectionId).toBeNull();
  });

  it("keeps a homework in the selected folder and in a nested folder", async () => {
    const { db, ctx } = await asAnna();
    const { root, sub, deep } = await nestedTestFolders(db, ctx);

    const inSub = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "В обычной папке",
      status: "draft",
      purpose: "homework",
      questions: [question],
      folderId: sub.id,
      sectionId: null,
    });
    const inDeep = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Во вложенной",
      status: "draft",
      purpose: "homework",
      questions: [question],
      folderId: deep.id,
      sectionId: root.id,
    });

    expect((await saved(db, inSub.id))?.folderId).toBe(sub.id);
    const deepRow = await saved(db, inDeep.id);
    expect(deepRow?.folderId).toBe(deep.id);
    expect(deepRow?.folderId).not.toBe(root.id);
    expect(deepRow?.folderId).not.toBe(sub.id);

    await publishHomework(db, ctx, inDeep.id);
    expect((await saved(db, inDeep.id))?.folderId).toBe(deep.id);
    expect((await saved(db, inDeep.id))?.status).toBe("published");
  });

  it("accepts a legacy payload that sends the current folder as sectionId", async () => {
    const { db, ctx } = await asAnna();
    const { deep } = await nestedTestFolders(db, ctx);
    const hw = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Старый клиент",
      status: "draft",
      purpose: "homework",
      questions: [],
      sectionId: deep.id,
    });
    expect((await saved(db, hw.id))?.folderId).toBe(deep.id);
  });

  it("does not move a homework when an edit omits the folder", async () => {
    const { db, ctx } = await asAnna();
    const { root, deep } = await nestedTestFolders(db, ctx);
    const hw = await upsertHomework(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Держим папку",
      description: "Было",
      status: "draft",
      purpose: "homework",
      questions: [question],
      folderId: deep.id,
    });

    await upsertHomework(db, ctx, {
      id: hw.id,
      teacherId: ctx.teacherId!,
      title: "Держим папку — ред.",
      status: "draft",
      purpose: "homework",
      questions: [question],
      sectionId: null,
    });
    const row = await saved(db, hw.id);
    expect(row?.folderId).toBe(deep.id);
    expect(row?.folderId).not.toBe(root.id);
    expect(row?.description).toBe("Было");

    await upsertHomework(db, ctx, {
      id: hw.id,
      teacherId: ctx.teacherId!,
      title: "Явная та же папка",
      status: "published",
      purpose: "homework",
      questions: [question],
      folderId: deep.id,
      sectionId: root.id,
    });
    expect((await saved(db, hw.id))?.folderId).toBe(deep.id);
  });

  it("allows a missing, empty, or blank description and does not invent one", async () => {
    const { db, ctx } = await asAnna();
    const base = {
      teacherId: ctx.teacherId!,
      status: "draft" as const,
      purpose: "homework" as const,
      questions: [],
      folderId: null,
    };
    const omitted = await upsertHomework(db, ctx, {
      ...base,
      title: "Без поля",
    });
    const empty = await upsertHomework(db, ctx, {
      ...base,
      title: "Пустая строка",
      description: "",
    });
    const blank = await upsertHomework(db, ctx, {
      ...base,
      title: "Пробелы",
      description: "   ",
    });
    const explicitNull = await upsertHomework(db, ctx, {
      ...base,
      title: "Null",
      description: null,
    });
    for (const id of [omitted.id, empty.id, blank.id, explicitNull.id]) {
      expect((await saved(db, id))?.description).toBeNull();
    }

    const withText = await upsertHomework(db, ctx, {
      ...base,
      title: "С текстом",
      description: "  Условие  ",
    });
    expect((await saved(db, withText.id))?.description).toBe("Условие");
    await upsertHomework(db, ctx, {
      id: withText.id,
      ...base,
      title: "Очистили",
      description: null,
    });
    expect((await saved(db, withText.id))?.description).toBeNull();
  });

  it("still stores topics inside their subsection and requires a topic description", async () => {
    const { db, ctx } = await asAnna();
    const section = await upsertTopicSection(db, ctx, {
      teacherId: ctx.teacherId!,
      title: "Раздел тем",
    });
    const tree = await ensureTeacherSubsection(db, ctx, "topic");
    const topic = await upsertTopic(db, ctx, {
      teacherId: ctx.teacherId!,
      folderId: tree.folderId,
      title: "Тема с разделом",
      subject: "Физика",
      description: "Описание темы остаётся обязательным",
      status: "active",
    });
    const [row] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(row?.folderId).toBe(tree.folderId);
    expect(row?.description).toBe("Описание темы остаётся обязательным");
    expect(section.id).toBeTruthy();

    await expect(
      upsertTopic(db, ctx, {
        teacherId: ctx.teacherId!,
        folderId: tree.folderId,
        title: "Без описания",
        subject: "Физика",
        description: "  ",
        status: "active",
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
