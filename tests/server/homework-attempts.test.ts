import { describe, it, expect, afterEach } from "vitest";

import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { testAttempts } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getAssignmentForViewer,
  reviewAssignment,
  saveDraft,
  submitAssignment,
} from "@/server/services/assignments-service";
import {
  assignHomework,
  publishHomework,
  upsertHomework,
} from "@/server/services/platform-mutations";
import { DONT_KNOW_TEXT } from "@/lib/tests/attempts";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("homework two attempts", () => {
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

  async function makeAssignment(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    extra?: { homeworkId?: string; dueAt?: string }
  ) {
    const anna = await login(db, "anna@example.com");
    const homeworkId = extra?.homeworkId ?? "hw_try";
    await upsertHomework(db, anna, {
      id: homeworkId,
      teacherId: "t1",
      title: "Две попытки",
      status: "draft",
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
          explanation: "Потому что 4",
        },
        {
          id: "qB",
          type: "numeric",
          prompt: "10/2",
          maxScore: 1,
          answerKind: "number",
          correctAnswers: ["5"],
        },
        {
          id: "qC",
          type: "essay",
          prompt: "Рассуждение",
          maxScore: 2,
        },
      ],
    });
    await publishHomework(db, anna, homeworkId);
    const assigned = await assignHomework(db, anna, {
      homeworkId,
      teacherId: "t1",
      studentIds: ["s1"],
      dueAt: extra?.dueAt,
    });
    expect(assigned.created).toBe(1);
    const s1 = await login(db, "s1@demo.local");
    const { testAssignments } = await import("@/server/db/schema");
    const rows = await db.select().from(testAssignments);
    const row = rows.find((x) => x.testId === homeworkId && x.studentId === "s1")!;
    return { anna, s1, assignmentId: row.id, status: row.status };
  }

  it("early submit, resume unanswered, retry only wrong, dont-know, no third attempt, no keys leak", async () => {
    const t = await createTestDb();
    close = t.close;
    const { anna, s1, assignmentId } = await makeAssignment(t.db);

    await saveDraft(t.db, s1, assignmentId, [
      { questionId: "qA", selectedOptionIds: ["ob"] },
    ]);

    const afterDraft = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(JSON.stringify(afterDraft.snapshot.questions)).not.toContain("Потому что 4");
    expect(afterDraft.snapshot.answerKeys).toBeUndefined();

    const first = await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", selectedOptionIds: ["ob"] }],
      1
    );
    expect(first.status).toBe("remaining_questions");
    expect(first.revealKeys).toBe(false);

    const mid = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(mid.assignment.unansweredQuestionIds).toEqual(
      expect.arrayContaining(["qB", "qC"])
    );
    expect(JSON.stringify(mid.snapshot.questions)).not.toContain("correctOptionIds");

    await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [
        { questionId: "qB", textAnswer: "5" },
        { questionId: "qC", textAnswer: "черновик эссе" },
      ],
      1
    );

    const afterFirst = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(afterFirst.assignment.retryQuestionIds).toEqual(["qA"]);
    expect(afterFirst.assignment.revealKeys).toBe(false);

    await saveDraft(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", textAnswer: DONT_KNOW_TEXT, selectedOptionIds: [] }],
      2
    );
    const second = await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", textAnswer: DONT_KNOW_TEXT, selectedOptionIds: [] }],
      2
    );
    expect(second.status).toBe("completed");

    await expect(
      submitAssignment(t.db, s1, assignmentId, [], 2)
    ).rejects.toMatchObject({ status: 409 });

    const attempts = await t.db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.assignmentId, assignmentId));
    expect(attempts).toHaveLength(2);

    const studentView = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(studentView.assignment.revealKeys).toBe(true);
    expect(JSON.stringify(studentView.snapshot.questions)).toContain("Потому что 4");

    const other = await login(t.db, "s2@demo.local");
    await expect(
      getAssignmentForViewer(t.db, other, assignmentId)
    ).rejects.toMatchObject({ status: 403 });

    const igor = await login(t.db, "igor@example.com");
    await expect(
      getAssignmentForViewer(t.db, igor, assignmentId)
    ).rejects.toMatchObject({ status: 403 });

    await reviewAssignment(
      t.db,
      anna,
      assignmentId,
      [{ questionId: "qC", manualScore: 2, teacherComment: "ок" }]
    );
    const reviewed = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(reviewed.assignment.status).toBe("reviewed");
    expect(reviewed.assignment.score).toBeGreaterThan(0);
  });

  it("refresh does not duplicate attempts", async () => {
    const t = await createTestDb();
    close = t.close;
    const { s1, assignmentId } = await makeAssignment(t.db);
    await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", selectedOptionIds: ["oa"] }],
      1
    );
    await saveDraft(t.db, s1, assignmentId, [
      { questionId: "qB", textAnswer: "5" },
    ]);
    const rows = await t.db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.assignmentId, assignmentId));
    expect(rows.filter((r) => r.attemptNumber === 1)).toHaveLength(1);
  });

  it("resubmitting a finished first attempt does not create a duplicate", async () => {
    const t = await createTestDb();
    close = t.close;
    const { s1, assignmentId } = await makeAssignment(t.db);
    await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [
        { questionId: "qA", selectedOptionIds: ["oa"] },
        { questionId: "qB", textAnswer: "5" },
        { questionId: "qC", textAnswer: "эссе" },
      ],
      1
    );
    await expect(
      submitAssignment(
        t.db,
        s1,
        assignmentId,
        [{ questionId: "qA", selectedOptionIds: ["ob"] }],
        1
      )
    ).rejects.toMatchObject({ status: 409 });
    const rows = await t.db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.assignmentId, assignmentId));
    expect(rows.filter((r) => r.attemptNumber === 1)).toHaveLength(1);
  });

  it("lets a student take an overdue assignment through both attempts", async () => {
    const t = await createTestDb();
    close = t.close;
    const dueAt = new Date(Date.now() - 86_400_000).toISOString();
    const { s1, assignmentId, status } = await makeAssignment(t.db, {
      homeworkId: "hw_overdue",
      dueAt,
    });
    expect(status).toBe("overdue");

    const draft = await saveDraft(t.db, s1, assignmentId, [
      { questionId: "qA", selectedOptionIds: ["ob"] },
    ]);
    expect(draft.status).toBe("in_progress");

    const first = await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [
        { questionId: "qA", selectedOptionIds: ["ob"] },
        { questionId: "qB", textAnswer: "5" },
        { questionId: "qC", textAnswer: "эссе" },
      ],
      1
    );
    expect(first.status).toBe("attempt1_submitted");
    expect(first.revealKeys).toBe(false);

    const afterFirst = await getAssignmentForViewer(t.db, s1, assignmentId);
    expect(afterFirst.assignment.retryQuestionIds).toEqual(["qA"]);
    expect(afterFirst.assignment.attempt1Submitted).toBe(true);

    const secondDraft = await saveDraft(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", selectedOptionIds: ["oa"] }],
      2
    );
    expect(secondDraft.status).toBe("attempt2_in_progress");

    const second = await submitAssignment(
      t.db,
      s1,
      assignmentId,
      [{ questionId: "qA", selectedOptionIds: ["oa"] }],
      2
    );
    expect(second.status).toBe("completed");

    await expect(
      submitAssignment(
        t.db,
        s1,
        assignmentId,
        [{ questionId: "qA", selectedOptionIds: ["ob"] }],
        2
      )
    ).rejects.toMatchObject({ status: 409 });

    const rows = await t.db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.assignmentId, assignmentId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.attemptNumber === 1)).toHaveLength(1);
    expect(rows.filter((r) => r.attemptNumber === 2)).toHaveLength(1);
  });
});
