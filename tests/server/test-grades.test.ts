import { afterEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { testAssignments } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  saveDraft,
  submitAssignment,
} from "@/server/services/assignments-service";
import {
  assignHomework,
  publishHomework,
  upsertHomework,
} from "@/server/services/platform-mutations";
import { getTestGradesStats } from "@/server/services/test-grades-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("test grades stats", () => {
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

  async function makePublished(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    ctx: Awaited<ReturnType<typeof login>>,
    input: {
      id: string;
      teacherId: string;
      title: string;
      questions: Parameters<typeof upsertHomework>[2]["questions"];
    }
  ) {
    await upsertHomework(db, ctx, {
      ...input,
      status: "draft",
    });
    await publishHomework(db, ctx, input.id);
  }

  it("averages attempts independently, skips missing seconds and unfinished drafts", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await makePublished(t.db, anna, {
      id: "hw_avg",
      teacherId: "t1",
      title: "Средние",
      questions: [
        {
          id: "qA",
          type: "single_choice",
          prompt: "2+2",
          maxScore: 1,
          options: [
            { id: "oa", text: "4" },
            { id: "ob", text: "5" },
          ],
          correctOptionIds: ["oa"],
        },
        {
          id: "qB",
          type: "numeric",
          prompt: "10/2",
          maxScore: 1,
          correctAnswers: ["5"],
        },
      ],
    });
    await assignHomework(t.db, anna, {
      homeworkId: "hw_avg",
      teacherId: "t1",
      studentIds: ["s1", "s2", "s3"],
    });
    const rows = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, "hw_avg"));
    const a1 = rows.find((r) => r.studentId === "s1")!;
    const a2 = rows.find((r) => r.studentId === "s2")!;
    const a3 = rows.find((r) => r.studentId === "s3")!;
    const s1 = await login(t.db, "s1@demo.local");
    const s2 = await login(t.db, "s2@demo.local");
    const s3 = await login(t.db, "s3@demo.local");

    await submitAssignment(
      t.db,
      s1,
      a1.id,
      [
        { questionId: "qA", selectedOptionIds: ["ob"] },
        { questionId: "qB", textAnswer: "5" },
      ],
      1
    );
    await submitAssignment(
      t.db,
      s1,
      a1.id,
      [{ questionId: "qA", selectedOptionIds: ["oa"] }],
      2
    );
    await submitAssignment(
      t.db,
      s2,
      a2.id,
      [
        { questionId: "qA", selectedOptionIds: ["oa"] },
        { questionId: "qB", textAnswer: "5" },
      ],
      1
    );
    await saveDraft(
      t.db,
      s3,
      a3.id,
      [{ questionId: "qA", selectedOptionIds: ["oa"] }],
      1
    );

    const stats = await getTestGradesStats(t.db, anna);
    const row = stats.tests.find((item) => item.testId === "hw_avg");
    expect(row?.studentCount).toBe(2);
    expect(row?.attempt1Average).toBe(75);
    expect(row?.attempt2Average).toBe(100);
    const qa = row?.questions.find((q) => q.questionId === "qA");
    expect(qa?.attempt1Average).toBe(0.5);
    expect(qa?.attempt1Count).toBe(2);
    expect(qa?.attempt2Average).toBe(1);
    expect(qa?.attempt2Count).toBe(1);
    expect(qa?.maxScore).toBe(1);
  });

  it("uses assignment snapshots after the test content changes", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    await makePublished(t.db, anna, {
      id: "hw_versions",
      teacherId: "t1",
      title: "Версии",
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
    await assignHomework(t.db, anna, {
      homeworkId: "hw_versions",
      teacherId: "t1",
      studentIds: ["s1"],
    });
    const first = (
      await t.db
        .select()
        .from(testAssignments)
        .where(eq(testAssignments.testId, "hw_versions"))
    ).find((r) => r.studentId === "s1")!;
    const s1 = await login(t.db, "s1@demo.local");
    await submitAssignment(
      t.db,
      s1,
      first.id,
      [{ questionId: "q1", selectedOptionIds: ["oa"] }],
      1
    );

    await upsertHomework(t.db, anna, {
      id: "hw_versions",
      teacherId: "t1",
      title: "Версии",
      status: "published",
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
          correctOptionIds: ["oa"],
        },
      ],
    });
    await assignHomework(t.db, anna, {
      homeworkId: "hw_versions",
      teacherId: "t1",
      studentIds: ["s2"],
    });
    const second = (
      await t.db
        .select()
        .from(testAssignments)
        .where(eq(testAssignments.testId, "hw_versions"))
    ).find((r) => r.studentId === "s2")!;
    const s2 = await login(t.db, "s2@demo.local");
    await submitAssignment(
      t.db,
      s2,
      second.id,
      [{ questionId: "q1", selectedOptionIds: ["ob"] }],
      1
    );

    const stats = await getTestGradesStats(t.db, anna);
    const row = stats.tests.find((item) => item.testId === "hw_versions");
    expect(row?.questions.map((q) => q.prompt).sort()).toEqual(["2+2", "3+3"]);
    expect(row?.questions.find((q) => q.prompt === "2+2")?.attempt1Average).toBe(1);
    expect(row?.questions.find((q) => q.prompt === "3+3")?.attempt1Average).toBe(0);
  });

  it("hides other teachers and rejects students", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await login(t.db, "anna@example.com");
    const igor = await login(t.db, "igor@example.com");
    const s1 = await login(t.db, "s1@demo.local");
    await makePublished(t.db, igor, {
      id: "hw_igor",
      teacherId: "t2",
      title: "Физика Игоря",
      questions: [
        {
          id: "q1",
          type: "numeric",
          prompt: "F=ma",
          maxScore: 1,
          correctAnswers: ["1"],
        },
      ],
    });
    await assignHomework(t.db, igor, {
      homeworkId: "hw_igor",
      teacherId: "t2",
      studentIds: ["s5"],
    });
    const [igorAssignment] = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.testId, "hw_igor"));
    const s5 = await login(t.db, "s5@demo.local");
    await submitAssignment(
      t.db,
      s5,
      igorAssignment!.id,
      [{ questionId: "q1", textAnswer: "1" }],
      1
    );

    const annaStats = await getTestGradesStats(t.db, anna);
    expect(annaStats.tests.find((item) => item.testId === "hw_igor")).toBeUndefined();
    await expect(getTestGradesStats(t.db, s1)).rejects.toMatchObject({ status: 403 });
    await expect(getTestGradesStats(t.db, igor)).resolves.toMatchObject({
      tests: expect.arrayContaining([
        expect.objectContaining({ testId: "hw_igor", studentCount: 1 }),
      ]),
    });
  });
});
