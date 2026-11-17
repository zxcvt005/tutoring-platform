import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { intensives, tests, theoryMaterials, topics } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertIntensive } from "@/server/services/intensives-service";
import {
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import { upsertTheory } from "@/server/services/theory-service";
import { ensureSchoolSubsection } from "../helpers/material-subsection";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("school knowledge base folder placement", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asDirector() {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    const ctx = await resolveAuthContext(t.db, session.rawToken);
    return { db: t.db, ctx };
  }

  it("creates school topics and tests in the open subsection and keeps them on re-save", async () => {
    const { db, ctx } = await asDirector();
    const topicTree = await ensureSchoolSubsection(db, ctx, "topic");
    const testTree = await ensureSchoolSubsection(db, ctx, "test");

    const topic = await upsertTopic(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: topicTree.folderId,
      title: "Школьная тема",
      subject: "Математика",
      description: "В подразделе",
      status: "active",
    });
    const [topicRow] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id));
    expect(topicRow?.folderId).toBe(topicTree.folderId);
    expect(topicRow?.libraryScope).toBe("school");

    await upsertTopic(db, ctx, {
      id: topic.id,
      teacherId: "",
      libraryScope: "school",
      folderId: topicTree.folderId,
      title: "Школьная тема — ред.",
      subject: "Математика",
      description: "Всё ещё в подразделе",
      status: "active",
    });
    expect(
      (
        await db.select().from(topics).where(eq(topics.id, topic.id))
      )[0]?.folderId
    ).toBe(topicTree.folderId);

    const hw = await upsertHomework(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: testTree.folderId,
      title: "Школьный тест",
      status: "draft",
      purpose: "homework",
      questions: [],
    });
    const [hwRow] = await db.select().from(tests).where(eq(tests.id, hw.id));
    expect(hwRow?.folderId).toBe(testTree.folderId);

    await upsertHomework(db, ctx, {
      id: hw.id,
      teacherId: "",
      libraryScope: "school",
      title: "Школьный тест — ред.",
      status: "draft",
      purpose: "homework",
      questions: [],
    });
    expect(
      (await db.select().from(tests).where(eq(tests.id, hw.id)))[0]?.folderId
    ).toBe(testTree.folderId);
  });

  it("creates school theory and intensives in nested folders and allows library root", async () => {
    const { db, ctx } = await asDirector();
    const theoryTree = await ensureSchoolSubsection(db, ctx, "theory");
    const intensiveTree = await ensureSchoolSubsection(db, ctx, "intensive");

    const theory = await upsertTheory(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: theoryTree.folderId,
      title: "Школьная теория",
      description: null,
      videoUrl: null,
      testId: null,
    });
    expect(
      (
        await db
          .select()
          .from(theoryMaterials)
          .where(eq(theoryMaterials.id, theory.id!))
      )[0]?.folderId
    ).toBe(theoryTree.folderId);

    const atRoot = await upsertTheory(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: null,
      title: "Теория в корне",
      description: null,
      videoUrl: null,
      testId: null,
    });
    expect(
      (
        await db
          .select()
          .from(theoryMaterials)
          .where(eq(theoryMaterials.id, atRoot.id!))
      )[0]?.folderId
    ).toBeNull();

    const intensive = await upsertIntensive(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: intensiveTree.folderId,
      title: "Школьный интенсив",
      description: null,
      videoUrl: null,
      testIds: [],
    });
    expect(
      (
        await db
          .select()
          .from(intensives)
          .where(eq(intensives.id, intensive.id!))
      )[0]?.folderId
    ).toBe(intensiveTree.folderId);
  });

  it("allows placing a school topic into a first-level folder and moving to library root", async () => {
    const { db, ctx } = await asDirector();
    const tree = await ensureSchoolSubsection(db, ctx, "topic");
    const topic = await upsertTopic(db, ctx, {
      teacherId: "",
      libraryScope: "school",
      folderId: tree.root.id,
      title: "В папке первого уровня",
      subject: "Математика",
      description: "Можно",
      status: "active",
    });
    expect(
      (await db.select().from(topics).where(eq(topics.id, topic.id)))[0]
        ?.folderId
    ).toBe(tree.root.id);

    const { moveMaterialToFolder } = await import(
      "@/server/services/folder-service"
    );
    await moveMaterialToFolder(
      db,
      ctx,
      { kind: "topic", id: topic.id },
      null
    );
    expect(
      (await db.select().from(topics).where(eq(topics.id, topic.id)))[0]
        ?.folderId
    ).toBeNull();
  });
});
