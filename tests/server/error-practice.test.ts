import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { ERROR_BANK_DELAY_MS } from "@/lib/error-practice/types";
import { resolveAuthContext } from "@/server/authz/context";
import {
  studentErrorBank,
  testAnswerKeys,
  tests,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getErrorBankSummary,
  recordIncorrectAnswers,
  refreshErrorBankAvailability,
} from "@/server/services/error-bank-service";
import {
  startErrorPracticeSession,
  submitErrorPracticeAnswer,
} from "@/server/services/error-practice-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("error bank and practice", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asStudent(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("records one bank card, delays 7 days, masters on correct practice", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const other = await asStudent(t.db, "s2@demo.local");

    const question = {
      id: "q_err_1",
      type: "single_choice" as const,
      prompt: "F=?",
      maxScore: 1,
      kimNumber: 12,
      options: [
        { id: "a", text: "ma" },
        { id: "b", text: "mv" },
      ],
      correctOptionIds: ["a"],
      explanation: "По второму закону Ньютона \\(F=ma\\).",
    };

    // Относительно «сейчас»: фиксированная дата в прошлом делает availableAt
    // уже просроченным для getErrorBankSummary → refresh → availableCount=1.
    const now = new Date();
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceAssignmentId: null,
      sourceTestId: null,
      questions: [question],
      answers: [
        {
          questionId: question.id,
          selectedOptionIds: ["b"],
          isCorrect: false,
        },
      ],
      now,
      attemptNumber: 1,
      reason: "submit",
    });

    // Повтор той же попытки (тот же HTTP) — без дубля
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        {
          questionId: question.id,
          selectedOptionIds: ["b"],
          isCorrect: false,
        },
      ],
      now: new Date(now.getTime() + 30_000),
      attemptNumber: 1,
      reason: "submit",
    });

    // Новая попытка / другой день — увеличивает счётчик и сдвигает таймер
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        {
          questionId: question.id,
          selectedOptionIds: ["b"],
          isCorrect: false,
        },
      ],
      now: new Date(now.getTime() + 60_000),
      attemptNumber: 2,
      reason: "submit",
    });

    const rows = await t.db
      .select()
      .from(studentErrorBank)
      .where(eq(studentErrorBank.studentId, student.studentId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("waiting");
    expect(rows[0]!.incorrectAttemptsCount).toBe(2);
    expect(rows[0]!.kimNumber).toBe(12);
    expect(rows[0]!.availableAt.getTime()).toBe(
      now.getTime() + 60_000 + ERROR_BANK_DELAY_MS
    );

    const early = await getErrorBankSummary(t.db, student, student.studentId!);
    expect(early.availableCount).toBe(0);
    expect(early.waitingCount).toBe(1);
    expect(early.byKim[0]?.kimNumber).toBe(12);

    await expect(
      getErrorBankSummary(t.db, other, student.studentId!)
    ).rejects.toThrow();

    // открываем доступ
    const openAt = new Date(rows[0]!.availableAt.getTime() + 1000);
    await refreshErrorBankAvailability(t.db, student.studentId!, openAt);
    const open = await getErrorBankSummary(t.db, student, student.studentId!);
    expect(open.availableCount).toBe(1);

    // пул: публикуем тестовый вопрос того же КИМ
    const testId = "test_pool_kim";
    await t.db.insert(tests).values({
      id: testId,
      organizationId: student.organizationId,
      teacherId: null,
      libraryScope: "school",
      title: "База",
      status: "published",
      purpose: "homework",
      questionsPublic: [
        {
          id: "q_pool_1",
          type: "single_choice",
          prompt: "pool",
          maxScore: 1,
          kimNumber: 12,
          explanation: "Пул: верный ответ x.",
          options: [
            { id: "x", text: "1" },
            { id: "y", text: "2" },
          ],
        },
      ],
    });
    await t.db.insert(testAnswerKeys).values({
      id: "tak_pool_1",
      testId,
      questionId: "q_pool_1",
      payload: { correctOptionIds: ["x"] },
    });

    const started = await startErrorPracticeSession(t.db, student, {
      mode: "kim",
      kimNumber: 12,
    });
    expect(started.resumed).toBe(false);
    expect(started.session.questionCount).toBeGreaterThanOrEqual(1);
    expect(
      started.session.items.every(
        (item) => item.kimNumber === 12 || item.kimNumber == null
      )
    ).toBe(true);
    // все с номером 12
    expect(started.session.items.every((item) => item.kimNumber === 12)).toBe(
      true
    );

    const again = await startErrorPracticeSession(t.db, student, {
      mode: "kim",
      kimNumber: 12,
    });
    expect(again.resumed).toBe(true);
    expect(again.session.id).toBe(started.session.id);

    const first = started.session.items[0]!;
    expect(first.question.correctOptionIds).toBeUndefined();
    expect(first.explanation).toBeUndefined();

    const snap = rows[0]!.questionSnapshot as {
      question: { correctOptionIds: string[] };
    };
    const correctId =
      first.sourceKind === "bank"
        ? snap.question.correctOptionIds[0]!
        : "x";

    const answered = await submitErrorPracticeAnswer(t.db, student, {
      sessionId: started.session.id,
      itemId: first.id,
      answer: {
        questionId: first.question.id,
        selectedOptionIds: [correctId],
      },
    });
    expect(answered.item.answered).toBe(true);
    expect(answered.item.isCorrect).toBe(true);
    expect(answered.item.explanation).toBeTruthy();

    const repeat = await submitErrorPracticeAnswer(t.db, student, {
      sessionId: started.session.id,
      itemId: first.id,
      answer: {
        questionId: first.question.id,
        selectedOptionIds: ["b"],
      },
    });
    expect(repeat.item.isCorrect).toBe(true);

    if (first.sourceKind === "bank") {
      const after = await t.db
        .select()
        .from(studentErrorBank)
        .where(
          and(
            eq(studentErrorBank.studentId, student.studentId!),
            eq(studentErrorBank.sourceQuestionId, "q_err_1")
          )
        );
      expect(after[0]!.status).toBe("mastered");
    }
  });
});
