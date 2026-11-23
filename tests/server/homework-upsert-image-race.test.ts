import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { withIdempotency } from "@/server/idempotency";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertHomework } from "@/server/services/platform-mutations";
import { uploadTestQuestionImage } from "@/server/services/test-question-image-service";
import { tests } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import type { TestQuestion } from "@/lib/types";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

function q(id: string, prompt = "x"): TestQuestion {
  return {
    id,
    type: "essay",
    prompt,
    maxScore: 1,
  };
}

function pngBytes(tag = 0) {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag & 0xff,
  ]);
}

describe("homework upsert vs question image upload", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asTeacher(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("replaying upsertHomework idempotency key leaves DB without the new question", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asTeacher(t.db);
    const hwId = "hw_idem_img_race";

    await withIdempotency(
      t.db,
      teacher,
      "POST:/api/platform:upsertHomework",
      `upsertHomework:${hwId}`,
      async () => {
        const body = await upsertHomework(t.db, teacher, {
          id: hwId,
          title: "Draft",
          status: "draft",
          purpose: "homework",
          teacherId: teacher.teacherId!,
          libraryScope: "teacher",
          questions: [q("q1")],
          maxScore: 1,
        });
        return { status: 200, body };
      }
    );

    // Клиент раньше слал тот же Idempotency-Key при втором сохранении
    // (добавлен q2) — сервер реплеил первый ответ без записи q2.
    const replayed = await withIdempotency(
      t.db,
      teacher,
      "POST:/api/platform:upsertHomework",
      `upsertHomework:${hwId}`,
      async () => {
        const body = await upsertHomework(t.db, teacher, {
          id: hwId,
          title: "Draft",
          status: "draft",
          purpose: "homework",
          teacherId: teacher.teacherId!,
          libraryScope: "teacher",
          questions: [q("q1"), q("q2")],
          maxScore: 2,
        });
        return { status: 200, body };
      }
    );
    expect(replayed.replayed).toBe(true);

    const [row] = await t.db
      .select({ questionsPublic: tests.questionsPublic })
      .from(tests)
      .where(
        and(eq(tests.id, hwId), eq(tests.organizationId, teacher.organizationId))
      )
      .limit(1);
    const ids = ((row?.questionsPublic as TestQuestion[]) ?? []).map((x) => x.id);
    expect(ids).toEqual(["q1"]);
    expect(ids).not.toContain("q2");

    await expect(
      uploadTestQuestionImage(t.db, teacher, hwId, "q2", {
        bytes: pngBytes(1),
        filename: "a.png",
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/вопрос не найден/i),
    });
  });

  it("a fresh upsert without reused idempotency key persists the new question for upload", async () => {
    const t = await createTestDb();
    close = t.close;
    const teacher = await asTeacher(t.db);
    const hwId = "hw_idem_img_ok";

    await upsertHomework(t.db, teacher, {
      id: hwId,
      title: "Draft",
      status: "draft",
      purpose: "homework",
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      questions: [q("q1")],
      maxScore: 1,
    });

    await upsertHomework(t.db, teacher, {
      id: hwId,
      title: "Draft",
      status: "draft",
      purpose: "homework",
      teacherId: teacher.teacherId!,
      libraryScope: "teacher",
      questions: [q("q1"), q("q2")],
      maxScore: 2,
    });

    const uploaded = await uploadTestQuestionImage(t.db, teacher, hwId, "q2", {
      bytes: pngBytes(2),
      filename: "b.png",
    });
    expect(uploaded.imageObjectKey).toContain("q2");
  });
});
