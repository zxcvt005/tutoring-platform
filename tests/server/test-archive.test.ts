import { afterEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { testAssignments, tests, topics } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { submitAssignment } from "@/server/services/assignments-service";
import {
  assignHomework,
  deleteHomework,
  deleteTopic,
  publishHomework,
  restoreHomework,
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("homework archive restore", () => {
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

  it("archives a test, restores it, and keeps assignments and topics unchanged", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      title: "Тема для архива",
      subject: "Математика",
      description: "Каталог",
      status: "active",
    });
    await upsertHomework(t.db, anna, {
      id: "hw_archive",
      teacherId: "t1",
      topicId: topic.id,
      title: "Тест архива",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "2+2",
          maxScore: 1,
          options: [
            { id: "oa", text: "4" },
            { id: "ob", text: "5" },
          ],
          correctOptionIds: ["oa"],
        },
      ],
    });
    await publishHomework(t.db, anna, "hw_archive");
    const assigned = await assignHomework(t.db, anna, {
      homeworkId: "hw_archive",
      teacherId: "t1",
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);
    const s1 = await login(t.db, "s1@demo.local");
    const [assignment] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, "hw_archive"));
    await submitAssignment(
      t.db,
      s1,
      assignment!.id,
      [{ questionId: "q1", selectedOptionIds: ["oa"] }],
      1
    );

    await deleteHomework(t.db, anna, "hw_archive");
    const [archived] = await t.db.select().from(tests).where(eq(tests.id, "hw_archive"));
    expect(archived?.status).toBe("archived");

    const restored = await restoreHomework(t.db, anna, "hw_archive");
    expect(restored.status).toBe("published");
    const [active] = await t.db.select().from(tests).where(eq(tests.id, "hw_archive"));
    expect(active?.status).toBe("published");
    expect(active?.topicId).toBe(topic.id);

    const [topicRow] = await t.db.select().from(topics).where(eq(topics.id, topic.id));
    expect(topicRow?.status).toBe("active");
    const [history] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.id, assignment!.id));
    expect(["completed", "reviewed"]).toContain(history?.status);
    expect(Number(history?.attempt1Percent)).toBe(100);
  });

  it("does not unarchive a topic when restoring a related test", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const topic = await upsertTopic(t.db, anna, {
      teacherId: "t1",
      title: "Тема архива",
      subject: "Математика",
      description: "Каталог",
      status: "active",
    });
    await upsertHomework(t.db, anna, {
      id: "hw_topic_archive",
      teacherId: "t1",
      topicId: topic.id,
      title: "Связанный тест",
      status: "draft",
      questions: [
        {
          id: "q1",
          type: "numeric",
          prompt: "1+1",
          maxScore: 1,
          correctAnswers: ["2"],
        },
      ],
    });
    await publishHomework(t.db, anna, "hw_topic_archive");
    await deleteTopic(t.db, anna, topic.id);
    const [archivedTopic] = await t.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    const [archivedTest] = await t.db
      .select()
      .from(tests)
      .where(eq(tests.id, "hw_topic_archive"));
    expect(archivedTopic?.status).toBe("archived");
    expect(archivedTest?.status).toBe("archived");

    await restoreHomework(t.db, anna, "hw_topic_archive");
    const [topicAfter] = await t.db.select().from(topics).where(eq(topics.id, topic.id));
    const [testAfter] = await t.db
      .select()
      .from(tests)
      .where(eq(tests.id, "hw_topic_archive"));
    expect(testAfter?.status).toBe("published");
    expect(topicAfter?.status).toBe("archived");
  });

  it("forbids restoring another teacher's archived test", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const igor = await login(t.db, "igor@example.com");
    const { ensureTeacherSubsection } = await import(
      "../helpers/material-subsection"
    );
    const { folderId } = await ensureTeacherSubsection(t.db, anna, "test");
    await upsertHomework(t.db, anna, {
      id: "hw_anna_only",
      teacherId: "t1",
      folderId,
      title: "Чужой",
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
    await publishHomework(t.db, anna, "hw_anna_only");
    await assignHomework(t.db, anna, {
      homeworkId: "hw_anna_only",
      teacherId: "t1",
      studentIds: ["s1"],
    });
    const archived = await deleteHomework(t.db, anna, "hw_anna_only");
    expect(archived.archived).toBe(true);
    await expect(restoreHomework(t.db, igor, "hw_anna_only")).rejects.toMatchObject({
      status: 403,
    });
  });
});
