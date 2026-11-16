import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import {
  assignmentSnapshots,
  organizations,
  testAssignments,
  tests,
  topics,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { listKnowledgeBase } from "@/server/services/knowledge-service";
import {
  assignHomework,
  upsertHomework,
  upsertTopic,
} from "@/server/services/platform-mutations";
import {
  assignTheory,
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
    expect(teacherBoot.theories.map((item) => item.id)).toContain(theory.id);
    expect(teacherBoot.homeworks.map((item) => item.id)).toContain(test.id);
    expect(teacherBoot.topics.map((item) => item.id)).toContain(topic.id);
  });

  it("lets teachers see school materials but not edit school rows", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const theory = await upsertTheory(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Школьная теория",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const topic = await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Школьная тема",
      subject: "Физика",
      description: "Только чтение",
      status: "active",
    });

    const boot = await buildBootstrap(db, anna);
    expect(boot.theories.some((row) => row.id === theory.id)).toBe(true);
    expect(boot.topics.some((row) => row.id === topic.id)).toBe(true);

    await expect(
      upsertTheory(db, anna, {
        id: theory.id,
        teacherId: "t1",
        title: "Правка",
        videoUrl: "https://vk.com/video-9_9",
        publish: true,
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      upsertTopic(db, anna, {
        id: topic.id,
        teacherId: "t1",
        title: "Правка",
        subject: "Физика",
        description: "Нет",
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("assigns school published theory but not school homework originals", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    const anna = await login(db, "anna@example.com");
    const theory = await upsertTheory(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Назначаемая теория",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const schoolHw = await schoolTest(db, director, "Школьный тест");
    const teacherHw = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Своё ДЗ",
      status: "published",
      purpose: "homework",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "1+1",
          maxScore: 1,
          options: [
            { id: "oa", text: "2" },
            { id: "ob", text: "3" },
          ],
          correctOptionIds: ["oa"],
        },
      ],
    });

    const theoryAssigned = await assignTheory(db, anna, {
      materialId: theory.id,
      studentIds: ["s1"],
    });
    expect(theoryAssigned.created).toBe(1);

    await expect(
      assignHomework(db, anna, {
        homeworkId: schoolHw.id,
        teacherId: "t1",
        studentIds: ["s1"],
      })
    ).rejects.toMatchObject({
      message: "Оригинал базы знаний нельзя назначить напрямую",
    });

    const hwAssigned = await assignHomework(db, anna, {
      homeworkId: teacherHw.id,
      teacherId: "t1",
      studentIds: ["s1"],
    });
    expect(hwAssigned.created).toBe(1);
  });

  it("isolates listKnowledgeBase by organization", async () => {
    const db = await openDb();
    const director = await login(db, "director@demo.local");
    await upsertTopic(db, director, {
      teacherId: "",
      libraryScope: "school",
      title: "Оптика",
      subject: "Физика",
      description: "Свет",
      status: "active",
    });
    await db.insert(organizations).values({
      id: "org_other",
      name: "Другая школа",
      slug: "other-school",
    });
    const other: AuthContext = {
      ...director,
      organizationId: "org_other",
      userId: "user_other",
    };
    const foreign = await listKnowledgeBase(db, other);
    expect(foreign.school.topics).toEqual([]);
    expect(foreign.teachers.map((item) => item.id)).not.toContain("t1");
  });

  it("keeps assignment snapshot when the source test is archived", async () => {
    const db = await openDb();
    const anna = await login(db, "anna@example.com");
    const test = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Контрольная",
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

    const assigned = await assignHomework(db, anna, {
      homeworkId: test.id,
      teacherId: "t1",
      studentIds: ["s1"],
    });
    expect(assigned.created).toBe(1);

    const [assignment] = await db
      .select()
      .from(testAssignments)
      .where(and(eq(testAssignments.testId, test.id), eq(testAssignments.studentId, "s1")));
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