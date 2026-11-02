import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  assignmentSnapshots,
  lessonTopics,
  lessons,
  materialOrigins,
  organizations,
  teachers,
  testAnswerKeys,
  testAssignments,
  tests,
  theoryAssignments,
  theoryFiles,
  theoryMaterials,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { withIdempotency } from "@/server/idempotency";
import {
  listKnowledgeBase,
  transferKnowledge,
} from "@/server/services/knowledge-service";
import { getTheoryObject } from "@/server/media/theory-storage";
import {
  assignHomework,
  deleteTopic,
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import {
  assignTheory,
  deleteTheory,
  uploadTheoryFile,
  upsertTheory,
} from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("knowledge base copies", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string;
  const previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
  const previousStorageDriver = process.env.CHAT_STORAGE_DRIVER;

  beforeAll(async () => {
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-files-"));
    process.env.CHAT_UPLOAD_ROOT = uploadRoot;
    process.env.CHAT_STORAGE_DRIVER = "local";
  });

  afterAll(async () => {
    if (previousUploadRoot === undefined) delete process.env.CHAT_UPLOAD_ROOT;
    else process.env.CHAT_UPLOAD_ROOT = previousUploadRoot;
    if (previousStorageDriver === undefined) delete process.env.CHAT_STORAGE_DRIVER;
    else process.env.CHAT_STORAGE_DRIVER = previousStorageDriver;
    if (uploadRoot) await rm(uploadRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function openDb() {
    const handle = await createTestDb();
    close = handle.close;
    return handle.db;
  }

  async function login(db: Awaited<ReturnType<typeof openDb>>, email: string) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    const { resolveAuthContext } = await import("@/server/authz/context");
    return resolveAuthContext(db, session.rawToken);
  }

  async function schoolTest(
    db: Awaited<ReturnType<typeof openDb>>,
    director: AuthContext,
    title: string
  ) {
    return upsertHomework(db, director, {
      teacherId: "",
      libraryScope: "school",
      title,
      status: "published",
      purpose: "homework",
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
  }

  it("creates school originals and lists teacher materials from the same rows", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const theory = await upsertTheory(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const test = await schoolTest(db, director, "Поле");
    const topic = await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Электростатика",
      subject: "Физика",
      description: "Базовый раздел",
      status: "active",
    });

    const listed = await listKnowledgeBase(db, director);
    expect(listed.school.theories.map((item) => item.id)).toContain(theory.id);
    expect(listed.school.tests.map((item) => item.id)).toContain(test.id);
    expect(listed.school.topics.map((item) => item.id)).toContain(topic.id);

    const annaBefore = listed.teachers.find((item) => item.id === "t1");
    const ownTopic = annaBefore?.topics.find((item) => !item.origin);
    expect(ownTopic).toBeTruthy();
    await upsertTopic(db, anna, {
      id: ownTopic!.id,
      teacherId: "t1",
      title: `${ownTopic!.title} правка`,
      subject: ownTopic!.subject ?? "Предмет",
      description: "Описание из кафедры",
      status: "active",
      sectionId: null,
    });
    const after = await listKnowledgeBase(db, director);
    const updated = after.teachers
      .find((item) => item.id === "t1")
      ?.topics.find((item) => item.id === ownTopic!.id);
    expect(updated?.title).toContain("правка");

    const teacherBoot = await buildBootstrap(db, anna);
    expect(teacherBoot.theories.map((item) => item.id)).not.toContain(theory.id);
    expect(teacherBoot.homeworks.map((item) => item.id)).not.toContain(test.id);
    expect(teacherBoot.topics.map((item) => item.id)).not.toContain(topic.id);
  });

  it("copies one and many materials without sharing editable rows", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const test = await schoolTest(db, director, "Закон Кулона");
    const theory = await upsertTheory(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      testId: test.id,
      publish: true,
    });
    await uploadTheoryFile(db, director, theory.id, {
      bytes: Buffer.from("%PDF-1.4 notes"),
      filename: "notes.pdf",
    });
    await upsertTheory(db, director, {
      id: theory.id,
      teacherId: "",
      libraryScope: "school",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      testId: test.id,
      publish: true,
    });
    const topic = await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Поле",
      subject: "Физика",
      description: "Описание темы",
      status: "active",
    });

    const one = await transferKnowledge(db, director, {
      items: [{ kind: "theory", id: theory.id }],
      teacherIds: ["t1"],
    });
    expect(one.created).toBe(1);
    expect(one.failed).toEqual([]);

    const many = await transferKnowledge(db, director, {
      items: [
        { kind: "theory", id: theory.id },
        { kind: "test", id: test.id },
        { kind: "topic", id: topic.id },
      ],
      teacherIds: ["t1", "t2"],
      duplicatePolicy: "skip",
    });
    expect(many.created).toBe(5);
    expect(many.skipped).toBe(1);

    const [originalTheory] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, theory.id));
    const copies = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.title, "Электрическое поле"));
    const teacherCopies = copies.filter((row) => row.libraryScope === "teacher");
    expect(teacherCopies).toHaveLength(2);
    expect(new Set(teacherCopies.map((row) => row.testId)).size).toBe(2);
    expect(teacherCopies.every((row) => row.testId !== originalTheory!.testId)).toBe(
      true
    );

    const annaCopy = teacherCopies.find((row) => row.teacherId === "t1")!;
    const igorCopy = teacherCopies.find((row) => row.teacherId === "t2")!;
    const annaFiles = await db
      .select()
      .from(theoryFiles)
      .where(and(eq(theoryFiles.materialId, annaCopy.id), isNull(theoryFiles.versionId)));
    const originalFiles = await db
      .select()
      .from(theoryFiles)
      .where(eq(theoryFiles.materialId, theory.id));
    expect(annaFiles[0]?.objectKey).toBeTruthy();
    expect(annaFiles[0]?.objectKey).not.toBe(originalFiles[0]?.objectKey);
    const annaBytes = await getTheoryObject(annaFiles[0]!.objectKey);
    expect(annaBytes.toString()).toContain("%PDF");

    await upsertTheory(db, anna, {
      id: annaCopy.id,
      teacherId: "t1",
      title: "Копия Анны",
      videoUrl: "https://vk.com/video-9_9",
      testId: annaCopy.testId,
      publish: true,
    });
    const [annaTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, annaCopy.testId!));
    const questions = structuredClone(annaTest!.questionsPublic) as {
      id: string;
      prompt: string;
    }[];
    questions[0]!.prompt = "3+3";
    await upsertHomework(db, anna, {
      id: annaTest!.id,
      teacherId: "t1",
      title: annaTest!.title,
      status: "published",
      purpose: "theory",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "3+3",
          maxScore: 1,
          options: [
            { id: "oa", text: "6" },
            { id: "ob", text: "5" },
          ],
          correctOptionIds: ["ob"],
        },
      ],
    });

    const [originalAfter] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, theory.id));
    const [igorAfter] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, igorCopy.id));
    expect(originalAfter!.title).toBe("Электрическое поле");
    expect(igorAfter!.title).toBe("Электрическое поле");
    expect(igorAfter!.videoUrl).toBe(originalTheory!.videoUrl);
    const [originalTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, originalTheory!.testId!));
    const [originalKey] = await db
      .select()
      .from(testAnswerKeys)
      .where(eq(testAnswerKeys.testId, originalTheory!.testId!));
    expect((originalTest!.questionsPublic as { prompt: string }[])[0]?.prompt).toBe(
      "2+2"
    );
    expect(originalKey!.payload).toMatchObject({ correctOptionIds: ["oa"] });
    const [annaKey] = await db
      .select()
      .from(testAnswerKeys)
      .where(eq(testAnswerKeys.testId, annaCopy.testId!));
    expect(annaKey!.payload).toMatchObject({ correctOptionIds: ["ob"] });

    await upsertTheory(db, director, {
      id: theory.id,
      teacherId: "",
      libraryScope: "school",
      title: "Оригинал изменён",
      videoUrl: "https://vk.com/video-1_2",
      testId: test.id,
      publish: true,
    });
    const [annaAfterEdit] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, annaCopy.id));
    expect(annaAfterEdit!.title).toBe("Копия Анны");

    const assigned = await assignTheory(db, anna, {
      materialId: annaCopy.id,
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);
    await deleteTheory(db, director, theory.id);
    const [surviving] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, annaCopy.id));
    expect(surviving?.title).toBe("Копия Анны");
    const [origin] = await db
      .select()
      .from(materialOrigins)
      .where(eq(materialOrigins.materialId, annaCopy.id));
    expect(origin?.sourceId).toBe(theory.id);
    expect(origin?.sourceTitle).toBe("Электрическое поле");
    const [stillAssigned] = await db
      .select()
      .from(theoryAssignments)
      .where(eq(theoryAssignments.materialId, annaCopy.id));
    expect(stillAssigned?.studentId).toBe("s1");
    await expect(getTheoryObject(annaFiles[0]!.objectKey)).resolves.toBeTruthy();
  });

  it("keeps topic copies independent from lessons and repeated transfers", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const topic = await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Кинематика",
      subject: "Физика",
      description: "Движение",
      status: "active",
    });
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.teacherId, "t1"))
      .limit(1);
    await db.insert(lessonTopics).values({
      id: "lt_knowledge",
      organizationId: "org_demo",
      lessonId: lesson!.id,
      topicId: topic.id,
      title: "Кинематика",
      sortOrder: 0,
    });
    const first = await transferKnowledge(db, director, {
      items: [{ kind: "topic", id: topic.id }],
      teacherIds: ["t1"],
    });
    expect(first.created).toBe(1);
    const repeat = await transferKnowledge(db, director, {
      items: [{ kind: "topic", id: topic.id }],
      teacherIds: ["t1"],
    });
    expect(repeat.created).toBe(0);
    expect(repeat.skipped).toBe(1);
    const again = await transferKnowledge(db, director, {
      items: [{ kind: "topic", id: topic.id }],
      teacherIds: ["t1"],
      duplicatePolicy: "create",
    });
    expect(again.created).toBe(1);

    const copies = await db
      .select()
      .from(topics)
      .where(and(eq(topics.teacherId, "t1"), eq(topics.title, "Кинематика")));
    expect(copies).toHaveLength(2);
    await upsertTopic(db, anna, {
      id: copies[0]!.id,
      teacherId: "t1",
      sectionId: null,
      title: "Кинематика Анны",
      subject: "Физика",
      description: "Своя версия",
      status: "active",
    });
    const [original] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(original?.title).toBe("Кинематика");
    const [link] = await db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.id, "lt_knowledge"));
    expect(link?.topicId).toBe(topic.id);
    await deleteTopic(db, director, topic.id);
    const [linkAfter] = await db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.id, "lt_knowledge"));
    expect(linkAfter?.topicId).toBe(topic.id);
    expect(linkAfter?.title).toBe("Кинематика");
    const [copyAfter] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, copies[0]!.id));
    expect(copyAfter?.status).toBe("active");
    expect(copyAfter?.title).toBe("Кинематика Анны");
  });

  it("rejects other organizations and reports partial transfer errors", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    await db.insert(organizations).values({
      id: "org_other",
      name: "Другая школа",
      slug: "other-school",
    });
    await db.insert(teachers).values({
      id: "t_other",
      organizationId: "org_other",
      fullName: "Чужой преподаватель",
      subjects: [],
    });
    const topic = await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Оптика",
      subject: "Физика",
      description: "Свет",
      status: "active",
    });
    await expect(
      transferKnowledge(db, anna, {
        items: [{ kind: "topic", id: topic.id }],
        teacherIds: ["t1"],
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      upsertTopic(db, anna, {
        id: topic.id,
        teacherId: "t1",
        title: "Чужая",
        subject: "Физика",
        description: "Нет",
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });

    const other: AuthContext = {
      ...director,
      organizationId: "org_other",
      userId: "user_other",
    };
    const foreign = await listKnowledgeBase(db, other);
    expect(foreign.school.topics).toEqual([]);
    expect(foreign.teachers.map((item) => item.id)).not.toContain("t1");

    const result = await transferKnowledge(db, director, {
      items: [
        { kind: "topic", id: topic.id },
        { kind: "topic", id: "missing_topic" },
      ],
      teacherIds: ["t2", "t_other"],
    });
    expect(result.created).toBe(1);
    expect(result.failed.length).toBe(3);
    const [copy] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.teacherId, "t2"), eq(topics.title, "Оптика")));
    expect(copy?.organizationId).toBe("org_demo");
  });

  it("keeps test assignment history and ignores a repeated idempotent transfer", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const test = await schoolTest(db, director, "Контрольная");
    const payload = {
      items: [{ kind: "test" as const, id: test.id }],
      teacherIds: ["t1"],
    };
    const first = await withIdempotency(
      db,
      director,
      "POST:/api/platform:transferKnowledge",
      "transfer-once",
      async () => ({ status: 200, body: await transferKnowledge(db, director, payload) })
    );
    const replay = await withIdempotency(
      db,
      director,
      "POST:/api/platform:transferKnowledge",
      "transfer-once",
      async () => ({ status: 200, body: await transferKnowledge(db, director, payload) })
    );
    expect(first.body.created).toBe(1);
    expect(replay.replayed).toBe(true);
    const copies = await db
      .select()
      .from(tests)
      .where(and(eq(tests.teacherId, "t1"), eq(tests.title, "Контрольная")));
    expect(copies).toHaveLength(1);
    const assigned = await assignHomework(db, anna, {
      homeworkId: copies[0]!.id,
      teacherId: "t1",
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);
    const [assignment] = await db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, copies[0]!.id));
    const [snapshot] = await db
      .select()
      .from(assignmentSnapshots)
      .where(eq(assignmentSnapshots.assignmentId, assignment!.id));
    expect(snapshot).toBeTruthy();
    await db
      .update(tests)
      .set({ status: "archived" })
      .where(eq(tests.id, test.id));
    const [assignmentAfter] = await db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.id, assignment!.id));
    const [snapshotAfter] = await db
      .select()
      .from(assignmentSnapshots)
      .where(eq(assignmentSnapshots.assignmentId, assignment!.id));
    expect(assignmentAfter?.id).toBe(assignment!.id);
    expect(snapshotAfter?.questions).toBeTruthy();
  });
});
