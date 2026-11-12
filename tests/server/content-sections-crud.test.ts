import { afterEach, describe, expect, it } from "vitest";

import { and, eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import {
  intensives,
  materialFolders,
  testAssignments,
  tests,
  theoryMaterials,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { moveMaterialToFolder } from "@/server/services/folder-service";
import {
  deleteIntensive,
  upsertIntensive,
} from "@/server/services/intensives-service";
import {
  assignHomework,
  deleteHomework,
  deleteTopic,
  publishHomework,
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import { deleteTheory, upsertTheory } from "@/server/services/theory-service";
import { ensureTeacherSubsection } from "../helpers/material-subsection";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("content sections CRUD + delete integrity", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function login(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("creates topic only in subsection and hard-deletes when no linked tests", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const { root, folderId } = await ensureTeacherSubsection(
      t.db,
      anna,
      "topic"
    );

    await expect(
      upsertTopic(t.db, anna, {
        teacherId: "t1",
        folderId: root.id,
        title: "В корне",
        subject: "Физика",
        description: "Нельзя",
        status: "active",
      })
    ).rejects.toMatchObject({ status: 400 });

    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      folderId,
      title: "Кинематика",
      subject: "Физика",
      description: "Введение",
      status: "active",
    });
    const [saved] = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    expect(saved?.folderId).toBe(folderId);
    expect(saved?.title).toBe("Кинематика");

    await upsertTopic(t.db, anna, {
      id: topic.id,
      teacherId: "t1",
      folderId,
      title: "Кинематика (ред.)",
      subject: "Физика",
      description: "Обновлено",
      status: "active",
    });
    const [edited] = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    expect(edited?.title).toBe("Кинематика (ред.)");

    const del = await deleteTopic(t.db, anna, topic.id);
    expect(del.archived).toBe(false);
    const [gone] = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    expect(gone).toBeUndefined();
  });

  it("archives topic with linked tests instead of cascading delete", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const topicsTree = await ensureTeacherSubsection(t.db, anna, "topic");
    const testsTree = await ensureTeacherSubsection(t.db, anna, "test");
    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      folderId: topicsTree.folderId,
      title: "Тема с тестом",
      subject: "Физика",
      description: "Связь",
      status: "active",
    });
    await upsertHomework(t.db, anna, {
      id: "hw_linked_topic",
      teacherId: "t1",
      topicId: topic.id,
      folderId: testsTree.folderId,
      title: "Тест по теме",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "numeric",
          prompt: "1",
          maxScore: 1,
          correctAnswers: ["1"],
        },
      ],
    });

    const del = await deleteTopic(t.db, anna, topic.id);
    expect(del.archived).toBe(true);
    expect(del.relatedTestsArchived).toBe(1);
    const [topicRow] = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    const [testRow] = await t.db
      .select()
      .from(tests)
      .where(eq(tests.id, "hw_linked_topic"));
    expect(topicRow?.status).toBe("archived");
    expect(testRow?.status).toBe("archived");
  });

  it("hard-deletes homework without assignments; archives when assigned", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const { folderId } = await ensureTeacherSubsection(t.db, anna, "test");

    await upsertHomework(t.db, anna, {
      id: "hw_hard_delete",
      teacherId: "t1",
      folderId,
      title: "Черновик",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "numeric",
          prompt: "2",
          maxScore: 1,
          correctAnswers: ["2"],
        },
      ],
    });
    const hard = await deleteHomework(t.db, anna, "hw_hard_delete");
    expect(hard.archived).toBe(false);
    const [gone] = await t.db
      .select()
      .from(tests)
      .where(eq(tests.id, "hw_hard_delete"));
    expect(gone).toBeUndefined();

    await upsertHomework(t.db, anna, {
      id: "hw_assigned_keep",
      teacherId: "t1",
      folderId,
      title: "Назначенный",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "numeric",
          prompt: "3",
          maxScore: 1,
          correctAnswers: ["3"],
        },
      ],
    });
    await publishHomework(t.db, anna, "hw_assigned_keep");
    await assignHomework(t.db, anna, {
      homeworkId: "hw_assigned_keep",
      teacherId: "t1",
      studentIds: ["s1"],
    });
    const soft = await deleteHomework(t.db, anna, "hw_assigned_keep");
    expect(soft.archived).toBe(true);
    const [archived] = await t.db
      .select()
      .from(tests)
      .where(eq(tests.id, "hw_assigned_keep"));
    expect(archived?.status).toBe("archived");
    const [assignment] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, "hw_assigned_keep"));
    expect(assignment).toBeTruthy();
  });

  it("rejects wrong content_kind placement and foreign delete", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const igor = await login(t.db, "igor@example.com");
    const theoryTree = await ensureTeacherSubsection(t.db, anna, "theory");
    const topicTree = await ensureTeacherSubsection(t.db, anna, "topic");

    await expect(
      upsertTopic(t.db, anna, {
        teacherId: "t1",
        folderId: theoryTree.folderId,
        title: "Чужой раздел",
        subject: "Физика",
        description: "Нельзя",
        status: "active",
      })
    ).rejects.toMatchObject({ status: 400 });

    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      folderId: topicTree.folderId,
      title: "Чужая тема",
      subject: "Физика",
      description: "Только Анна",
      status: "active",
    });
    await expect(deleteTopic(t.db, igor, topic.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(deleteTopic(t.db, anna, "tp_missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("creates and hard-deletes theory without assignments", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const { folderId } = await ensureTeacherSubsection(t.db, anna, "theory");
    const created = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      libraryScope: "teacher",
      folderId,
      title: "Теория МКТ",
      description: "Текст",
    });
    const [saved] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, created.id));
    expect(saved?.folderId).toBe(folderId);
    expect(saved?.title).toBe("Теория МКТ");

    const del = await deleteTheory(t.db, anna, created.id);
    expect(del.archived).toBe(false);
    const [gone] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, created.id));
    expect(gone).toBeUndefined();
  });

  it("creates intensive in subsection and hard-deletes without assignments", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const { root, folderId } = await ensureTeacherSubsection(
      t.db,
      anna,
      "intensive"
    );

    await expect(
      upsertIntensive(t.db, anna, {
        teacherId: "t1",
        libraryScope: "teacher",
        folderId: root.id,
        title: "В корне",
        description: "Нельзя",
        testIds: [],
      })
    ).rejects.toMatchObject({ status: 400 });

    const created = await upsertIntensive(t.db, anna, {
      teacherId: "t1",
      libraryScope: "teacher",
      folderId,
      title: "Интенсив механика",
      description: "Видео",
      testIds: [],
    });
    const [saved] = await t.db
      .select()
      .from(intensives)
      .where(eq(intensives.id, created.id));
    expect(saved?.folderId).toBe(folderId);

    const del = await deleteIntensive(t.db, anna, created.id);
    expect(del.archived).toBe(false);
    const [gone] = await t.db
      .select()
      .from(intensives)
      .where(eq(intensives.id, created.id));
    expect(gone).toBeUndefined();
  });

  it("keeps content_kind folders separated when moving materials", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const topicsTree = await ensureTeacherSubsection(t.db, anna, "topic");
    const testsTree = await ensureTeacherSubsection(t.db, anna, "test");
    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      folderId: topicsTree.folderId,
      title: "Только темы",
      subject: "Физика",
      description: "A",
      status: "active",
    });
    await expect(
      moveMaterialToFolder(
        t.db,
        anna,
        { kind: "topic", id: topic.id },
        testsTree.folderId
      )
    ).rejects.toMatchObject({ status: 400 });

    const [folder] = await t.db
      .select()
      .from(materialFolders)
      .where(
        and(
          eq(materialFolders.id, topicsTree.folderId),
          eq(materialFolders.contentKind, "topic")
        )
      );
    expect(folder).toBeTruthy();
  });
});
