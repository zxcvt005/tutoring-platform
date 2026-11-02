import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { tests, theoryMaterials } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  publishHomework,
  upsertHomework,
} from "@/server/services/platform-mutations";
import { upsertTheory } from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("theory publish with attached test", () => {
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

  function multiQuestions() {
    return [
      {
        id: "q1",
        type: "single_choice" as const,
        prompt: "Сколько будет 2+2?",
        maxScore: 1,
        options: [
          { id: "oa", text: "4" },
          { id: "ob", text: "5" },
        ],
        correctOptionIds: ["oa"],
      },
      {
        id: "q2",
        type: "short_answer" as const,
        prompt: "Единица силы тока",
        maxScore: 1,
        correctAnswers: ["ампер", "А"],
      },
      {
        id: "q3",
        type: "essay" as const,
        prompt: "Объясните закон Ома",
        maxScore: 2,
      },
    ];
  }

  it("publishHomework on a missing test returns the default «Не найдено»", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await expect(
      publishHomework(t.db, anna, "hw_missing_race")
    ).rejects.toMatchObject({
      status: 404,
      message: "Не найдено",
    });
  });

  it("saves a theory test with several questions then publishes it before attaching", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const testId = "hw_theory_multi_q";

    // Регрессия гонки: публикация без предварительного upsert даёт «Не найдено».
    await expect(publishHomework(t.db, anna, testId)).rejects.toMatchObject({
      status: 404,
      message: "Не найдено",
    });

    const saved = await upsertHomework(t.db, anna, {
      id: testId,
      teacherId: "t1",
      title: "Тест к теории с несколькими заданиями",
      status: "draft",
      purpose: "theory",
      questions: multiQuestions(),
    });
    expect(saved.id).toBe(testId);

    await publishHomework(t.db, anna, saved.id);
    const [row] = await t.db.select().from(tests).where(eq(tests.id, testId));
    expect(row.status).toBe("published");
    expect((row.questionsPublic as unknown[]).length).toBe(3);

    const theory = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Теория с тестом",
      testId,
      publish: true,
    });
    const [material] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, theory.id));
    expect(material.status).toBe("published");
    expect(material.testId).toBe(testId);
    expect(material.currentVersionId).toBeTruthy();
  });

  it("auto-publishes a draft theory-purpose test when the theory is published", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const testId = "hw_theory_draft_auto";

    await upsertHomework(t.db, anna, {
      id: testId,
      teacherId: "t1",
      title: "Черновик теста теории",
      status: "draft",
      purpose: "theory",
      questions: multiQuestions(),
    });

    const theory = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Публикация с черновиком теста",
      testId,
      publish: true,
    });

    const [testRow] = await t.db.select().from(tests).where(eq(tests.id, testId));
    const [material] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, theory.id));
    expect(testRow.status).toBe("published");
    expect(material.status).toBe("published");
    expect(material.testId).toBe(testId);
  });

  it("still publishes theory without a test", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const theory = await upsertTheory(t.db, anna, {
      teacherId: "t1",
      title: "Только видео",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const [material] = await t.db
      .select()
      .from(theoryMaterials)
      .where(eq(theoryMaterials.id, theory.id));
    expect(material.status).toBe("published");
    expect(material.testId).toBeNull();
  });

  it("rejects publishing theory with a missing test id", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await expect(
      upsertTheory(t.db, anna, {
        teacherId: "t1",
        title: "Битый testId",
        testId: "hw_does_not_exist",
        publish: true,
      })
    ).rejects.toMatchObject({
      status: 404,
      message: "Тест не найден",
    });
  });
});
