import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  lessonTopics,
  lessons,
  materialOrigins,
  organizations,
  teachers,
  testAnswerKeys,
  tests,
  theoryFiles,
  theoryMaterials,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  listKnowledgeBase,
  saveToSchoolLibrary,
} from "@/server/services/knowledge-service";
import { getTheoryObject } from "@/server/media/theory-storage";
import {
  deleteHomework,
  deleteTopic,
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import {
  deleteTheory,
  uploadTheoryFile,
  upsertTheory,
} from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("save teacher materials to school library", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string;
  const previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
  const previousStorageDriver = process.env.CHAT_STORAGE_DRIVER;

  beforeAll(async () => {
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "school-save-files-"));
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

  async function teacherTheory(
    db: Awaited<ReturnType<typeof openDb>>,
    anna: AuthContext
  ) {
    const nested = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Тест теории",
      status: "published",
      purpose: "theory",
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
    const theory = await upsertTheory(db, anna, {
      teacherId: "t1",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      testId: nested.id,
      publish: true,
    });
    await uploadTheoryFile(db, anna, theory.id, {
      bytes: Buffer.from("%PDF-1.4 notes"),
      filename: "notes.pdf",
    });
    await upsertTheory(db, anna, {
      id: theory.id,
      teacherId: "t1",
      title: "Электрическое поле",
      videoUrl: "https://vk.com/video-1_2",
      testId: nested.id,
      publish: true,
    });
    return { theory, nested };
  }

  it("saves teacher theory into school originals as an independent copy", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const { theory, nested } = await teacherTheory(db, anna);

    const saved = await saveToSchoolLibrary(db, director, {
      kind: "theory",
      id: theory.id,
    });
    expect(saved.created).toBe(true);
    expect(saved.id).not.toBe(theory.id);

    const listed = await listKnowledgeBase(db, director);
    expect(listed.school.theories.map((item) => item.id)).toContain(saved.id);
    const schoolTheory = listed.school.theories.find((item) => item.id === saved.id);
    expect(schoolTheory?.libraryScope).toBe("school");
    expect(schoolTheory?.origin?.sourceId).toBe(theory.id);
    expect(schoolTheory?.origin?.sourceScope).toBe("teacher");
    expect(schoolTheory?.origin?.sourceAuthorName).toBe("Анна Сергеева");
    expect(listed.school.tests.filter((item) => item.purpose !== "theory").map((item) => item.id)).not.toContain(
      saved.id
    );

    const [copy] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, saved.id));
    expect(copy?.libraryScope).toBe("school");
    expect(copy?.teacherId).toBeNull();
    expect(copy?.testId).toBeTruthy();
    expect(copy?.testId).not.toBe(nested.id);

    const [copyTest] = await db.select().from(tests).where(eq(tests.id, copy!.testId!));
    const [copyKey] = await db
      .select()
      .from(testAnswerKeys)
      .where(eq(testAnswerKeys.testId, copy!.testId!));
    expect(copyTest?.libraryScope).toBe("school");
    expect(copyTest?.purpose).toBe("theory");
    expect((copyTest?.questionsPublic as { prompt: string }[])[0]?.prompt).toBe("2+2");
    expect(copyKey?.payload).toMatchObject({ correctOptionIds: ["oa"] });

    const [copyFile] = await db
      .select()
      .from(theoryFiles)
      .where(and(eq(theoryFiles.materialId, saved.id), isNull(theoryFiles.versionId)));
    const [sourceFile] = await db
      .select()
      .from(theoryFiles)
      .where(and(eq(theoryFiles.materialId, theory.id), isNull(theoryFiles.versionId)));
    expect(copyFile?.objectKey).not.toBe(sourceFile?.objectKey);
    await expect(getTheoryObject(copyFile!.objectKey)).resolves.toBeTruthy();

    await upsertTheory(db, anna, {
      id: theory.id,
      teacherId: "t1",
      title: "Поле Анны",
      videoUrl: "https://vk.com/video-9_9",
      testId: nested.id,
      publish: true,
    });
    await upsertHomework(db, anna, {
      id: nested.id,
      teacherId: "t1",
      title: "Тест теории",
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
    const [copyAfter] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, saved.id));
    const [copyTestAfter] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, copy!.testId!));
    expect(copyAfter?.title).toBe("Электрическое поле");
    expect((copyTestAfter?.questionsPublic as { prompt: string }[])[0]?.prompt).toBe("2+2");

    const again = await saveToSchoolLibrary(db, director, {
      kind: "theory",
      id: theory.id,
    });
    expect(again.created).toBe(false);
    expect(again.id).toBe(saved.id);

    await deleteTheory(db, anna, theory.id);
    const [schoolAfterDelete] = await db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, saved.id));
    expect(schoolAfterDelete?.title).toBe("Электрическое поле");
    const [origin] = await db
      .select()
      .from(materialOrigins)
      .where(eq(materialOrigins.materialId, saved.id));
    expect(origin?.sourceTitle).toBe("Электрическое поле");
    expect(origin?.sourceAuthorName).toBe("Анна Сергеева");

    const schoolTheories = await db
      .select()
      .from(theoryMaterials)
      .where(
        and(
          eq(theoryMaterials.libraryScope, "school"),
          eq(theoryMaterials.title, "Электрическое поле")
        )
      );
    expect(schoolTheories).toHaveLength(1);
  });

  it("saves a teacher test with questions and answer keys", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const test = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Закон Кулона",
      status: "published",
      purpose: "homework",
      questions: [
        {
          id: "qA",
          type: "numeric",
          prompt: "F=kqq/r^2",
          maxScore: 2,
          correctAnswers: ["9"],
        },
      ],
    });
    const saved = await saveToSchoolLibrary(db, director, {
      kind: "test",
      id: test.id,
    });
    expect(saved.created).toBe(true);
    const listed = await listKnowledgeBase(db, director);
    expect(
      listed.school.tests
        .filter((item) => item.purpose !== "theory")
        .map((item) => item.id)
    ).toContain(saved.id);

    const [copy] = await db.select().from(tests).where(eq(tests.id, saved.id));
    const [key] = await db
      .select()
      .from(testAnswerKeys)
      .where(eq(testAnswerKeys.testId, saved.id));
    expect(copy?.libraryScope).toBe("school");
    expect(copy?.teacherId).toBeNull();
    expect((copy?.questionsPublic as { prompt: string }[])[0]?.prompt).toBe(
      "F=kqq/r^2"
    );
    expect(key?.payload).toMatchObject({ correctAnswers: ["9"] });

    await upsertHomework(db, anna, {
      id: test.id,
      teacherId: "t1",
      title: "Другой тест",
      status: "published",
      questions: [
        {
          id: "qA",
          type: "numeric",
          prompt: "изменено",
          maxScore: 2,
          correctAnswers: ["0"],
        },
      ],
    });
    const [copyAfter] = await db.select().from(tests).where(eq(tests.id, saved.id));
    expect(copyAfter?.title).toBe("Закон Кулона");
    await deleteHomework(db, anna, test.id);
    const [still] = await db.select().from(tests).where(eq(tests.id, saved.id));
    expect(still?.status).not.toBe("archived");
    expect(still?.title).toBe("Закон Кулона");
  });

  it("saves a teacher topic without rewriting lessons", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const topic = await upsertTopic(db, anna, {
      teacherId: "t1",
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
      id: "lt_save_school",
      organizationId: "org_demo",
      lessonId: lesson!.id,
      topicId: topic.id,
      title: "Кинематика",
      sortOrder: 0,
    });
    const saved = await saveToSchoolLibrary(db, director, {
      kind: "topic",
      id: topic.id,
    });
    expect(saved.created).toBe(true);
    const listed = await listKnowledgeBase(db, director);
    expect(listed.school.topics.map((item) => item.id)).toContain(saved.id);
    const [copy] = await db.select().from(topics).where(eq(topics.id, saved.id));
    expect(copy?.libraryScope).toBe("school");
    expect(copy?.teacherId).toBeNull();
    const [link] = await db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.id, "lt_save_school"));
    expect(link?.topicId).toBe(topic.id);
    await deleteTopic(db, anna, topic.id);
    const [copyAfter] = await db.select().from(topics).where(eq(topics.id, saved.id));
    expect(copyAfter?.status).toBe("active");
    const [linkAfter] = await db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.id, "lt_save_school"));
    expect(linkAfter?.topicId).toBe(topic.id);
  });

  it("rejects teachers, school originals and other organizations", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const own = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Свой тест",
      status: "published",
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
    await expect(
      saveToSchoolLibrary(db, anna, { kind: "test", id: own.id })
    ).rejects.toMatchObject({ status: 403 });

    const school = await upsertHomework(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Школьный",
      status: "published",
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
    await expect(
      saveToSchoolLibrary(db, director, { kind: "test", id: school.id })
    ).rejects.toMatchObject({ status: 400 });

    await db.insert(organizations).values({
      id: "org_other_save",
      name: "Другая школа",
      slug: "other-save",
    });
    await db.insert(teachers).values({
      id: "t_other_save",
      organizationId: "org_other_save",
      fullName: "Чужой",
      subjects: [],
    });
    await db.insert(tests).values({
      id: "hw_other_save",
      organizationId: "org_other_save",
      teacherId: "t_other_save",
      libraryScope: "teacher",
      title: "Чужой тест",
      status: "published",
      purpose: "homework",
      questionsPublic: [],
    });
    await expect(
      saveToSchoolLibrary(db, director, { kind: "test", id: "hw_other_save" })
    ).rejects.toMatchObject({ status: 404 });
  });
});
