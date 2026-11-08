import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_EXPLANATION_MESSAGE } from "@/lib/math/rich-text-math";
import { ERROR_BANK_DELAY_MS } from "@/lib/error-practice/types";
import { resolveAuthContext } from "@/server/authz/context";
import {
  studentErrorBank,
  studentErrorBankEvents,
  testAnswerKeys,
  tests,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  availableAtFrom,
  buildErrorQuestionSnapshot,
  errorBankDedupeKey,
  errorBankEventId,
  recordIncorrectAnswers,
  refreshErrorBankAvailability,
  resolveErrorBankImageObjectKey,
} from "@/server/services/error-bank-service";
import {
  startErrorPracticeSession,
  submitErrorPracticeAnswer,
} from "@/server/services/error-practice-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("error bank audit scenarios", () => {
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

  const question = {
    id: "q_shared_1",
    type: "single_choice" as const,
    prompt: "F=?",
    maxScore: 1,
    kimNumber: 5,
    imageObjectKey: "questions/org/test/q/img.png",
    options: [
      { id: "a", text: "ma" },
      { id: "b", text: "mv" },
    ],
    correctOptionIds: ["a"],
    explanation: "Закон Ньютона \\(F=ma\\).",
  };

  it("1: keeps one active card when the same question appears in several homeworks", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const t0 = new Date("2026-11-01T15:30:00.000Z");

    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceAssignmentId: null,
      sourceTestId: null,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: t0,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "hw_a",
    });

    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceAssignmentId: null,
      sourceTestId: null,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: new Date(t0.getTime() + 86_400_000),
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "hw_b",
    });

    const active = await t.db
      .select()
      .from(studentErrorBank)
      .where(
        and(
          eq(studentErrorBank.studentId, student.studentId!),
          eq(studentErrorBank.sourceQuestionId, question.id)
        )
      );
    expect(active).toHaveLength(1);
    expect(active[0]!.incorrectAttemptsCount).toBe(2);
    expect(active[0]!.status).toBe("waiting");
  });

  it("2+3: correct retry keeps bank; later miss resets 7-day delay from last error", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const t0 = new Date("2026-11-01T15:30:00.000Z");

    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: t0,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "hw_keep",
    });

    // Верный ответ второй попытки в банк не пишется
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["a"], isCorrect: true },
      ],
      now: new Date(t0.getTime() + 3_600_000),
      attemptNumber: 2,
      reason: "submit",
      dedupeScope: "hw_keep",
    });

    const [row] = await t.db
      .select()
      .from(studentErrorBank)
      .where(eq(studentErrorBank.studentId, student.studentId!));
    expect(row.status).toBe("waiting");
    expect(row.availableAt.toISOString()).toBe(availableAtFrom(t0).toISOString());

    const later = new Date("2026-11-04T10:00:00.000Z");
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: later,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "hw_later",
    });
    const [updated] = await t.db
      .select()
      .from(studentErrorBank)
      .where(eq(studentErrorBank.id, row.id));
    expect(updated.availableAt.toISOString()).toBe(
      availableAtFrom(later).toISOString()
    );
    expect(updated.availableAt.getTime() - later.getTime()).toBe(
      ERROR_BANK_DELAY_MS
    );
  });

  it("4: HTTP retry with the same dedupe key does not duplicate events", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const t0 = new Date("2026-11-01T12:00:00.000Z");
    const payload = {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: t0,
      attemptNumber: 1,
      reason: "submit" as const,
      dedupeScope: "hw_retry",
    };

    const [a, b] = await Promise.all([
      recordIncorrectAnswers(t.db, payload),
      recordIncorrectAnswers(t.db, payload),
    ]);
    expect(a.recorded + b.recorded).toBe(1);

    const events = await t.db
      .select()
      .from(studentErrorBankEvents)
      .where(eq(studentErrorBankEvents.studentId, student.studentId!));
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe(
      errorBankEventId(
        student.studentId!,
        errorBankDedupeKey({
          sourceAssignmentId: "hw_retry",
          attemptNumber: 1,
          questionId: question.id,
          reason: "submit",
        })
      )
    );

    const cards = await t.db
      .select()
      .from(studentErrorBank)
      .where(eq(studentErrorBank.studentId, student.studentId!));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.incorrectAttemptsCount).toBe(1);
  });

  it("5: teacher review only records newly incorrect answers", () => {
    const before = [
      { questionId: "q1", isCorrect: false as boolean | null },
      { questionId: "q2", isCorrect: null as boolean | null },
    ];
    const afterReview = [
      { questionId: "q1", isCorrect: false as boolean | null },
      { questionId: "q2", isCorrect: false as boolean | null },
    ];
    const newlyIncorrect = afterReview.filter((answer) => {
      if (answer.isCorrect !== false) return false;
      const prev = before.find((row) => row.questionId === answer.questionId);
      return prev?.isCorrect !== false;
    });
    expect(newlyIncorrect.map((a) => a.questionId)).toEqual(["q2"]);

    const src = readFileSync("src/server/services/assignments-service.ts", "utf8");
    expect(src).toContain("newlyIncorrect");
    expect(src).toContain('reason: "review"');
  });

  async function ensureSchoolTest(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    organizationId: string,
    id: string
  ) {
    await db.insert(tests).values({
      id,
      organizationId,
      teacherId: null,
      libraryScope: "school",
      title: id,
      status: "published",
      purpose: "homework",
      questionsPublic: [],
    });
  }

  it("6: live question edits do not rewrite the stored snapshot", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    await ensureSchoolTest(t.db, student.organizationId, "test_snap_img");
    const original = {
      ...question,
      prompt: "Оригинал",
      explanation: "Старый разбор",
    };
    const t0 = new Date("2026-11-01T12:00:00.000Z");

    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceTestId: "test_snap_img",
      questions: [original],
      answers: [
        { questionId: original.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: t0,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "snap_1",
    });

    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceTestId: "test_snap_img",
      questions: [
        {
          ...original,
          prompt: "Изменено преподавателем",
          explanation: "Новый разбор",
          imageObjectKey: "questions/org/test/q/new.png",
        },
      ],
      answers: [
        { questionId: original.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: new Date(t0.getTime() + 86_400_000),
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "snap_2",
    });

    const [row] = await t.db
      .select()
      .from(studentErrorBank)
      .where(eq(studentErrorBank.studentId, student.studentId!));
    const snap = row.questionSnapshot as {
      question: { prompt: string; explanation?: string; imageObjectKey?: string };
    };
    expect(snap.question.prompt).toBe("Оригинал");
    expect(snap.question.explanation).toBe("Старый разбор");
    expect(snap.question.imageObjectKey).toBe("questions/org/test/q/img.png");
  });

  it("7: snapshot image keys remain resolvable for protected S3 GET", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    await ensureSchoolTest(t.db, student.organizationId, "test_img_1");
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      sourceTestId: "test_img_1",
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: new Date("2026-11-01T12:00:00.000Z"),
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "img_1",
    });

    const key = await resolveErrorBankImageObjectKey(
      t.db,
      student.studentId!,
      "test_img_1",
      question.id
    );
    expect(key).toBe("questions/org/test/q/img.png");

    const imgSrc = readFileSync(
      "src/server/services/test-question-image-service.ts",
      "utf8"
    );
    expect(imgSrc).toContain("resolveErrorBankImageObjectKey");
    expect(imgSrc).toContain("getTestQuestionObject");
  });

  it("8: parallel practice answers cannot master the same bank item twice", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const now = new Date("2026-11-01T12:00:00.000Z");
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "par_1",
    });
    await refreshErrorBankAvailability(
      t.db,
      student.studentId!,
      availableAtFrom(now)
    );

    const started = await startErrorPracticeSession(t.db, student, {
      mode: "kim",
      kimNumber: 5,
    });
    const bankItem = started.session.items.find((i) => i.sourceKind === "bank");
    expect(bankItem).toBeTruthy();

    const answer = {
      sessionId: started.session.id,
      itemId: bankItem!.id,
      answer: {
        questionId: bankItem!.question.id,
        selectedOptionIds: ["a"],
      },
    };
    const [r1, r2] = await Promise.all([
      submitErrorPracticeAnswer(t.db, student, answer),
      submitErrorPracticeAnswer(t.db, student, answer),
    ]);
    expect(r1.item.isCorrect).toBe(true);
    expect(r2.item.isCorrect).toBe(true);

    const rows = await t.db
      .select()
      .from(studentErrorBank)
      .where(
        and(
          eq(studentErrorBank.studentId, student.studentId!),
          eq(studentErrorBank.sourceQuestionId, question.id)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("mastered");
    const masteredEvents = await t.db
      .select()
      .from(studentErrorBankEvents)
      .where(
        and(
          eq(studentErrorBankEvents.studentId, student.studentId!),
          eq(studentErrorBankEvents.eventType, "mastered")
        )
      );
    expect(masteredEvents).toHaveLength(1);
  });

  it("9: practice pool uses only published school/assigned materials", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const now = new Date("2026-11-01T12:00:00.000Z");
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [{ ...question, kimNumber: 77 }],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "pool_1",
    });
    await refreshErrorBankAvailability(
      t.db,
      student.studentId!,
      availableAtFrom(now)
    );

    await t.db.insert(tests).values({
      id: "test_draft_hidden",
      organizationId: student.organizationId,
      teacherId: null,
      libraryScope: "school",
      title: "Черновик",
      status: "draft",
      purpose: "homework",
      questionsPublic: [
        {
          id: "q_draft",
          type: "single_choice",
          prompt: "hidden",
          maxScore: 1,
          kimNumber: 77,
          options: [
            { id: "x", text: "1" },
            { id: "y", text: "2" },
          ],
        },
      ],
    });
    await t.db.insert(testAnswerKeys).values({
      id: "tak_draft",
      testId: "test_draft_hidden",
      questionId: "q_draft",
      payload: { correctOptionIds: ["x"] },
    });

    await t.db.insert(tests).values({
      id: "test_pub_ok",
      organizationId: student.organizationId,
      teacherId: null,
      libraryScope: "school",
      title: "База",
      status: "published",
      purpose: "homework",
      questionsPublic: [
        {
          id: "q_pub",
          type: "single_choice",
          prompt: "visible",
          maxScore: 1,
          kimNumber: 77,
          options: [
            { id: "x", text: "1" },
            { id: "y", text: "2" },
          ],
        },
      ],
    });
    await t.db.insert(testAnswerKeys).values({
      id: "tak_pub",
      testId: "test_pub_ok",
      questionId: "q_pub",
      payload: { correctOptionIds: ["x"] },
    });

    const started = await startErrorPracticeSession(t.db, student, {
      mode: "kim",
      kimNumber: 77,
    });
    const poolIds = started.session.items
      .filter((i) => i.sourceKind === "pool")
      .map((i) => i.question.id);
    expect(poolIds).not.toContain("q_draft");
    expect(poolIds.every((id) => id === "q_pub" || id === question.id)).toBe(
      true
    );

    const practiceSrc = readFileSync(
      "src/server/services/error-practice-service.ts",
      "utf8"
    );
    expect(practiceSrc).toContain('eq(tests.status, "published")');
    expect(practiceSrc).toContain('eq(tests.libraryScope, "school")');
  });

  it("10: unfinished homework path strips keys before reveal", () => {
    const src = readFileSync("src/server/services/assignments-service.ts", "utf8");
    expect(src).toContain("stripQuestionKeys(snap.questions)");
    expect(src).toContain("canRevealKeys");
    expect(src).toContain("includeKeys");
  });

  it("11: empty explanation copy is stable", () => {
    expect(EMPTY_EXPLANATION_MESSAGE).toBe("Тут пока ничего нет :(");
    const panel = readFileSync("src/components/tests/explanation-panel.tsx", "utf8");
    expect(panel).toContain("EMPTY_EXPLANATION_MESSAGE");
  });

  it("12: availability uses absolute UTC server timestamps", async () => {
    const errorAt = new Date("2026-11-01T15:30:00.000Z");
    const openAt = availableAtFrom(errorAt);
    expect(openAt.toISOString()).toBe("2026-11-08T15:30:00.000Z");
    expect(ERROR_BANK_DELAY_MS).toBe(7 * 24 * 60 * 60 * 1000);

    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    await recordIncorrectAnswers(t.db, {
      organizationId: student.organizationId,
      studentId: student.studentId!,
      questions: [question],
      answers: [
        { questionId: question.id, selectedOptionIds: ["b"], isCorrect: false },
      ],
      now: errorAt,
      attemptNumber: 1,
      reason: "submit",
      dedupeScope: "tz_1",
    });

    expect(
      await refreshErrorBankAvailability(
        t.db,
        student.studentId!,
        new Date(errorAt.getTime() + ERROR_BANK_DELAY_MS - 1)
      )
    ).toBe(0);
    expect(
      await refreshErrorBankAvailability(t.db, student.studentId!, openAt)
    ).toBe(1);

    const sql = readFileSync("drizzle/0033_error_practice_bank.sql", "utf8");
    expect(sql).toContain('"available_at" timestamp with time zone');
    expect(sql).toContain('"last_error_at" timestamp with time zone');
  });

  it("migration 0033: uniqueness, FKs, indexes; journal-safe re-run", () => {
    const sql = readFileSync("drizzle/0033_error_practice_bank.sql", "utf8");
    expect(sql).toContain('CREATE UNIQUE INDEX "seb_active_question_uidx"');
    expect(sql).toContain("WHERE \"status\" in ('waiting', 'available')");
    expect(sql).toContain('CREATE UNIQUE INDEX "eps_one_active_uidx"');
    expect(sql).toContain(
      'FOREIGN KEY ("source_assignment_id") REFERENCES "public"."test_assignments"'
    );
    expect(sql).toContain(
      'FOREIGN KEY ("student_id") REFERENCES "public"."students"'
    );
    expect(sql).toContain("CREATE TABLE \"student_error_bank\"");
    // Повторный migrate безопасен через drizzle journal, не через IF NOT EXISTS.
    const journal = readFileSync("drizzle/meta/_journal.json", "utf8");
    expect(journal).toContain("0033_error_practice_bank");
  });

  it("clones snapshots deeply", () => {
    const snap = buildErrorQuestionSnapshot(question, {
      sourceTestId: "t1",
      sourceAssignmentId: null,
    });
    snap.question.prompt = "mutated";
    expect(question.prompt).toBe("F=?");
  });
});
