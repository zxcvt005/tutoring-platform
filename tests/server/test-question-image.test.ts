import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DELETE, GET } from "@/app/api/tests/[testId]/questions/[questionId]/image/route";
import { CSRF_COOKIE, CSRF_HEADER } from "@/server/auth/constants";
import { SESSION_COOKIE } from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { getTestQuestionObject } from "@/server/media/test-question-storage";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  assignHomework,
  publishHomework,
  upsertHomework,
} from "@/server/services/platform-mutations";
import {
  collectOrphanQuestionImageKeys,
  deleteTestQuestionImage,
  getTestQuestionImage,
  uploadTestQuestionImage,
} from "@/server/services/test-question-image-service";
import type { TestQuestion } from "@/lib/types";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

function pngBytes(tag = 0) {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag & 0xff,
  ]);
}

function jpegBytes(tag = 0) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, tag & 0xff]);
}

describe("test question images", () => {
  let close: (() => Promise<void>) | undefined;
  let uploadRoot: string;
  const previousUploadRoot = process.env.CHAT_UPLOAD_ROOT;
  const previousStorageDriver = process.env.CHAT_STORAGE_DRIVER;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "question-img-"));
    process.env.CHAT_UPLOAD_ROOT = uploadRoot;
    process.env.CHAT_STORAGE_DRIVER = "local";
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    if (previousUploadRoot === undefined) delete process.env.CHAT_UPLOAD_ROOT;
    else process.env.CHAT_UPLOAD_ROOT = previousUploadRoot;
    if (previousStorageDriver === undefined) delete process.env.CHAT_STORAGE_DRIVER;
    else process.env.CHAT_STORAGE_DRIVER = previousStorageDriver;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await rm(uploadRoot, { recursive: true, force: true });
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return {
      ctx: await resolveAuthContext(db, session.rawToken),
      sessionToken: session.rawToken,
    };
  }

  async function draftHomework(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>["ctx"],
    questionId = "q_img"
  ) {
    return upsertHomework(db, teacher, {
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "With image",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [
        {
          id: questionId,
          type: "essay",
          prompt: "",
          maxScore: 1,
        },
      ],
    });
  }

  async function persistImageKey(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>["ctx"],
    testId: string,
    questionId: string,
    imageObjectKey: string
  ) {
    await upsertHomework(db, teacher, {
      id: testId,
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "With image",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [
        {
          id: questionId,
          type: "essay",
          prompt: "",
          maxScore: 1,
          imageObjectKey,
        },
      ],
    });
  }

  function mutatingHeaders(sessionToken: string, csrf = "route-csrf") {
    return {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; ${CSRF_COOKIE}=${csrf}`,
      origin: "http://localhost:3000",
      [CSRF_HEADER]: csrf,
    };
  }

  it("uploads an image and lets assigned student read it", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher } = await asRole(t.db, "anna@example.com");
    const saved = await draftHomework(t.db, teacher);
    const uploaded = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(), filename: "shot.png" }
    );
    expect(uploaded.imageObjectKey).toContain("questions/");
    await persistImageKey(t.db, teacher, saved.id, "q_img", uploaded.imageObjectKey);

    const { ctx: student } = await asRole(t.db, "s1@demo.local");
    await expect(
      getTestQuestionImage(t.db, student, saved.id, "q_img")
    ).rejects.toMatchObject({ status: 403 });

    await publishHomework(t.db, teacher, saved.id);
    await assignHomework(t.db, teacher, {
      homeworkId: saved.id,
      teacherId: teacher.teacherId!,
      studentIds: ["s1"],
    });
    const assignedFile = await getTestQuestionImage(
      t.db,
      student,
      saved.id,
      "q_img"
    );
    expect(assignedFile.bytes.length).toBeGreaterThan(0);

    const { ctx: director } = await asRole(t.db, "director@demo.local");
    const file = await getTestQuestionImage(t.db, director, saved.id, "q_img");
    expect(file.bytes.length).toBeGreaterThan(0);
  });

  it("DELETE removes storage object (service and HTTP route)", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher, sessionToken } = await asRole(t.db, "anna@example.com");
    const saved = await draftHomework(t.db, teacher);
    const uploaded = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(1), filename: "shot.png" }
    );
    await persistImageKey(t.db, teacher, saved.id, "q_img", uploaded.imageObjectKey);
    await expect(getTestQuestionObject(uploaded.imageObjectKey)).resolves.toBeDefined();

    await deleteTestQuestionImage(t.db, teacher, saved.id, "q_img");
    await expect(getTestQuestionObject(uploaded.imageObjectKey)).rejects.toMatchObject({
      status: 404,
    });

    const uploaded2 = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(2), filename: "shot2.png" }
    );
    await persistImageKey(t.db, teacher, saved.id, "q_img", uploaded2.imageObjectKey);

    const res = await DELETE(
      new Request(
        `http://localhost:3000/api/tests/${saved.id}/questions/q_img/image`,
        { method: "DELETE", headers: mutatingHeaders(sessionToken) }
      ),
      { params: Promise.resolve({ testId: saved.id, questionId: "q_img" }) }
    );
    expect(res.status).toBe(200);
    await expect(getTestQuestionObject(uploaded2.imageObjectKey)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("replaces image and deletes previous object from storage", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher } = await asRole(t.db, "anna@example.com");
    const saved = await draftHomework(t.db, teacher);
    const first = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(3), filename: "a.png" }
    );
    await persistImageKey(t.db, teacher, saved.id, "q_img", first.imageObjectKey);
    await expect(getTestQuestionObject(first.imageObjectKey)).resolves.toBeDefined();

    const second = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: jpegBytes(4), filename: "b.jpg" }
    );
    expect(second.imageObjectKey).not.toBe(first.imageObjectKey);
    await expect(getTestQuestionObject(first.imageObjectKey)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getTestQuestionObject(second.imageObjectKey)).resolves.toBeDefined();
  });

  it("forbids delete and upload for student and foreign teacher", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher } = await asRole(t.db, "anna@example.com");
    const saved = await draftHomework(t.db, teacher);
    const uploaded = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(5), filename: "shot.png" }
    );
    await persistImageKey(t.db, teacher, saved.id, "q_img", uploaded.imageObjectKey);

    const { ctx: student } = await asRole(t.db, "s1@demo.local");
    await expect(
      deleteTestQuestionImage(t.db, student, saved.id, "q_img")
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      uploadTestQuestionImage(t.db, student, saved.id, "q_img", {
        bytes: pngBytes(6),
        filename: "x.png",
      })
    ).rejects.toMatchObject({ status: 403 });

    const { ctx: igor } = await asRole(t.db, "igor@example.com");
    await expect(
      deleteTestQuestionImage(t.db, igor, saved.id, "q_img")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("GET via route returns 403 for student without assignment", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher } = await asRole(t.db, "anna@example.com");
    const saved = await draftHomework(t.db, teacher);
    const uploaded = await uploadTestQuestionImage(
      t.db,
      teacher,
      saved.id,
      "q_img",
      { bytes: pngBytes(7), filename: "shot.png" }
    );
    await persistImageKey(t.db, teacher, saved.id, "q_img", uploaded.imageObjectKey);

    const { sessionToken } = await asRole(t.db, "s1@demo.local");
    const res = await GET(
      new Request(
        `http://localhost:3000/api/tests/${saved.id}/questions/q_img/image`,
        { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}` } }
      ),
      { params: Promise.resolve({ testId: saved.id, questionId: "q_img" }) }
    );
    expect(res.status).toBe(403);
  });

  it("orphan cleanup removes storage only when key is unused in org", async () => {
    const t = await createTestDb();
    close = t.close;
    const { ctx: teacher } = await asRole(t.db, "anna@example.com");
    const hw1 = await upsertHomework(t.db, teacher, {
      id: "hw_orphan_a",
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "A",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [{ id: "q1", type: "essay", prompt: "x", maxScore: 1 }],
    });
    const uploaded = await uploadTestQuestionImage(
      t.db,
      teacher,
      hw1.id,
      "q1",
      { bytes: pngBytes(8), filename: "a.png" }
    );
    await persistImageKey(t.db, teacher, hw1.id, "q1", uploaded.imageObjectKey);

    const hw2 = await upsertHomework(t.db, teacher, {
      id: "hw_orphan_b",
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "B",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [
        {
          id: "q2",
          type: "essay",
          prompt: "y",
          maxScore: 1,
          imageObjectKey: uploaded.imageObjectKey,
        },
      ],
    });
    expect(hw2.id).toBe("hw_orphan_b");

    const previous: TestQuestion[] = [
      {
        id: "q1",
        type: "essay",
        prompt: "x",
        maxScore: 1,
        imageObjectKey: uploaded.imageObjectKey,
      },
    ];
    const nextWithoutImage: TestQuestion[] = [
      { id: "q1", type: "essay", prompt: "x", maxScore: 1 },
    ];
    const orphansWhileShared = await collectOrphanQuestionImageKeys(
      t.db,
      teacher.organizationId,
      previous,
      nextWithoutImage
    );
    expect(orphansWhileShared).not.toContain(uploaded.imageObjectKey);

    await upsertHomework(t.db, teacher, {
      id: "hw_orphan_b",
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "B",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [{ id: "q2", type: "essay", prompt: "y", maxScore: 1 }],
    });

    const orphansWhileHw1StillReferences = await collectOrphanQuestionImageKeys(
      t.db,
      teacher.organizationId,
      previous,
      nextWithoutImage
    );
    expect(orphansWhileHw1StillReferences).not.toContain(uploaded.imageObjectKey);

    await upsertHomework(t.db, teacher, {
      id: hw1.id,
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      title: "A",
      status: "draft",
      purpose: "homework",
      maxScore: 1,
      questions: [{ id: "q1", type: "essay", prompt: "x", maxScore: 1 }],
    });
    await expect(getTestQuestionObject(uploaded.imageObjectKey)).rejects.toMatchObject({
      status: 404,
    });
  });
});
