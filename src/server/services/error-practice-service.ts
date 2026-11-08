import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  ERROR_PRACTICE_TARGET_COUNT,
  type ErrorPracticeItemPublic,
  type ErrorPracticeMode,
  type ErrorPracticeSessionPublic,
  type ErrorQuestionSnapshot,
} from "@/lib/error-practice/types";
import { createRng, shuffleInPlace } from "@/lib/formula-trainer/rng";
import { normalizeKimNumber } from "@/lib/math/rich-text-math";
import { gradeSubmission } from "@/lib/tests/grading";
import type { StudentAnswer, TestQuestion } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireStudentProfile } from "@/server/authz/require";
import {
  errorPracticeSessionItems,
  errorPracticeSessions,
  testAnswerKeys,
  testAssignments,
  tests,
} from "@/server/db/schema";
import { errorBankDedupeKey } from "@/server/services/error-bank-service";
import type { AppDb } from "@/server/db/types";
import { badRequest, conflict, forbidden, notFound, validationError } from "@/server/errors";
import {
  listAvailableErrorBankRows,
  masterErrorBankEntry,
  recordIncorrectAnswers,
  reopenErrorBankAfterPracticeMiss,
} from "@/server/services/error-bank-service";
import { mergeQuestionsWithKeys, stripQuestionKeys } from "@/server/services/question-merge";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function isUniqueViolation(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

async function requireOwnStudent(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudentProfile(ctx);
  if (ctx.role !== "student" || ctx.studentId !== studentId) {
    throw forbidden("Доступно только ученику");
  }
  return studentId;
}

function readSnapshot(raw: unknown): ErrorQuestionSnapshot {
  const data = raw as ErrorQuestionSnapshot;
  if (!data?.question?.id) {
    throw validationError("Повреждённый снимок вопроса");
  }
  return data;
}

function publicQuestionFromSnapshot(
  snapshot: ErrorQuestionSnapshot,
  withKeys: boolean
): TestQuestion {
  if (withKeys) return { ...snapshot.question };
  const stripped = stripQuestionKeys([snapshot.question])[0]!;
  return stripped as unknown as TestQuestion;
}

function toItemPublic(
  row: typeof errorPracticeSessionItems.$inferSelect,
  opts: { includeExplanation: boolean }
): ErrorPracticeItemPublic {
  const snapshot = readSnapshot(row.questionSnapshot);
  const answered = Boolean(row.answeredAt);
  const question = publicQuestionFromSnapshot(snapshot, answered);
  return {
    id: row.id,
    position: row.position,
    sourceKind: row.sourceKind as "bank" | "pool",
    kimNumber: row.kimNumber,
    sourceTestId: row.sourceTestId,
    answered,
    isCorrect: row.isCorrect,
    question,
    explanation:
      answered && opts.includeExplanation
        ? snapshot.question.explanation ?? null
        : undefined,
    answer: answered
      ? ({
          ...(row.answerPayload as StudentAnswer),
          questionId: snapshot.question.id,
          isCorrect: row.isCorrect,
        } as StudentAnswer)
      : null,
  };
}

async function findActiveSession(db: AppDb, studentId: string) {
  const [row] = await db
    .select()
    .from(errorPracticeSessions)
    .where(
      and(
        eq(errorPracticeSessions.studentId, studentId),
        eq(errorPracticeSessions.status, "active")
      )
    )
    .limit(1);
  return row ?? null;
}

async function loadSessionItems(db: AppDb, sessionId: string) {
  return db
    .select()
    .from(errorPracticeSessionItems)
    .where(eq(errorPracticeSessionItems.sessionId, sessionId))
    .orderBy(asc(errorPracticeSessionItems.position));
}

async function toSessionPublic(
  db: AppDb,
  session: typeof errorPracticeSessions.$inferSelect
): Promise<ErrorPracticeSessionPublic> {
  const items = await loadSessionItems(db, session.id);
  const answered = items.filter((i) => i.answeredAt).length;
  return {
    id: session.id,
    mode: session.mode as ErrorPracticeMode,
    kimNumber: session.kimNumber,
    status: session.status === "completed" ? "completed" : "active",
    questionCount: session.questionCount,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    percent: session.percent != null ? Number(session.percent) : null,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    currentIndex: Math.min(answered, Math.max(session.questionCount - 1, 0)),
    items: items.map((item) =>
      toItemPublic(item, { includeExplanation: Boolean(item.answeredAt) })
    ),
  };
}

type PoolCandidate = {
  question: TestQuestion;
  sourceTestId: string;
};

async function loadPublishedPool(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  kimNumber?: number | null
): Promise<PoolCandidate[]> {
  const assigned = await db
    .select({ testId: testAssignments.testId })
    .from(testAssignments)
    .where(
      and(
        eq(testAssignments.organizationId, ctx.organizationId),
        eq(testAssignments.studentId, studentId)
      )
    );
  const assignedIds = [...new Set(assigned.map((row) => row.testId))];

  // Только школьная опубликованная база и тесты, уже назначавшиеся ученику.
  // Чужие «опубликованные» шаблоны преподавателя без назначения не берём.
  const published = await db
    .select()
    .from(tests)
    .where(
      and(
        eq(tests.organizationId, ctx.organizationId),
        eq(tests.status, "published"),
        eq(tests.purpose, "homework"),
        or(
          eq(tests.libraryScope, "school"),
          assignedIds.length > 0 ? inArray(tests.id, assignedIds) : sql`false`
        )
      )
    );

  const out: PoolCandidate[] = [];
  for (const test of published) {
    const keys = await db
      .select()
      .from(testAnswerKeys)
      .where(eq(testAnswerKeys.testId, test.id));
    const keyMap = Object.fromEntries(keys.map((k) => [k.questionId, k.payload]));
    const questions = mergeQuestionsWithKeys(
      test.questionsPublic as unknown[],
      keyMap
    );
    for (const question of questions) {
      if (question.type === "essay") continue;
      const kim = normalizeKimNumber(question.kimNumber) ?? null;
      if (kimNumber != null && kim !== kimNumber) continue;
      out.push({ question, sourceTestId: test.id });
    }
  }
  return out;
}

function pickUnique(
  bank: PoolCandidate[],
  pool: PoolCandidate[],
  count: number,
  seed: number
): { picks: PoolCandidate[]; sources: ("bank" | "pool")[] } {
  const rng = createRng(seed);
  const bankShuffled = shuffleInPlace([...bank], rng);
  const chosen: PoolCandidate[] = [];
  const sources: ("bank" | "pool")[] = [];
  const seen = new Set<string>();

  for (const item of bankShuffled) {
    if (chosen.length >= count) break;
    if (seen.has(item.question.id)) continue;
    seen.add(item.question.id);
    chosen.push(item);
    sources.push("bank");
  }

  const poolShuffled = shuffleInPlace(
    pool.filter((p) => !seen.has(p.question.id)),
    rng
  );
  for (const item of poolShuffled) {
    if (chosen.length >= count) break;
    seen.add(item.question.id);
    chosen.push(item);
    sources.push("pool");
  }

  const order = shuffleInPlace(
    chosen.map((c, i) => ({ c, s: sources[i]! })),
    createRng(seed ^ 0x9e3779b9)
  );
  return {
    picks: order.map((o) => o.c),
    sources: order.map((o) => o.s),
  };
}

export async function startErrorPracticeSession(
  db: AppDb,
  ctx: AuthContext,
  input: { mode?: unknown; kimNumber?: unknown }
) {
  const studentId = await requireOwnStudent(db, ctx);
  const existing = await findActiveSession(db, studentId);
  if (existing) {
    return { resumed: true as const, session: await toSessionPublic(db, existing) };
  }

  const mode: ErrorPracticeMode =
    String(input.mode ?? "random") === "kim" ? "kim" : "random";
  const kimNumber =
    mode === "kim" ? normalizeKimNumber(input.kimNumber) ?? null : null;
  if (mode === "kim" && kimNumber == null) {
    throw validationError("Укажите номер КИМ");
  }

  const bankRows = await listAvailableErrorBankRows(
    db,
    studentId,
    mode === "kim" ? kimNumber : null
  );
  const bankCandidates: PoolCandidate[] = bankRows.map((row) => {
    const snap = readSnapshot(row.questionSnapshot);
    return { question: snap.question, sourceTestId: row.sourceTestId ?? "" };
  });

  const pool = await loadPublishedPool(
    db,
    ctx,
    studentId,
    mode === "kim" ? kimNumber : null
  );

  const target = ERROR_PRACTICE_TARGET_COUNT;
  const { picks, sources } = pickUnique(
    bankCandidates,
    pool,
    target,
    Date.now() ^ studentId.length
  );
  const bankByQuestion = new Map(bankRows.map((r) => [r.sourceQuestionId, r]));

  if (picks.length === 0) {
    throw badRequest(
      mode === "kim"
        ? "Пока нет заданий для этого номера КИМ"
        : "Пока нет заданий для отработки"
    );
  }

  const sessionId = newId("eps");
  try {
    await db.transaction(async (tx) => {
      const again = await findActiveSession(tx as unknown as AppDb, studentId);
      if (again) throw new Error("ACTIVE_SESSION");
      await tx.insert(errorPracticeSessions).values({
        id: sessionId,
        organizationId: ctx.organizationId,
        studentId,
        mode,
        kimNumber,
        status: "active",
        questionCount: picks.length,
      });
      for (let position = 0; position < picks.length; position++) {
        const pick = picks[position]!;
        const sourceKind = sources[position]!;
        const bank = bankByQuestion.get(pick.question.id);
        const snapshot =
          sourceKind === "bank" && bank
            ? readSnapshot(bank.questionSnapshot)
            : {
                question: pick.question,
                sourceTestId: pick.sourceTestId,
                sourceAssignmentId: null,
              };
        await tx.insert(errorPracticeSessionItems).values({
          id: newId("epsi"),
          sessionId,
          position,
          sourceKind,
          errorBankId: sourceKind === "bank" ? bank?.id ?? null : null,
          sourceQuestionId: pick.question.id,
          sourceTestId: pick.sourceTestId || null,
          sourceAssignmentId:
            sourceKind === "bank" ? bank?.sourceAssignmentId ?? null : null,
          questionSnapshot: snapshot as unknown as Record<string, unknown>,
          kimNumber: normalizeKimNumber(pick.question.kimNumber) ?? null,
        });
      }
    });
  } catch (err) {
    const active = await findActiveSession(db, studentId);
    if (
      active &&
      (isUniqueViolation(err) ||
        (err instanceof Error && err.message === "ACTIVE_SESSION"))
    ) {
      return { resumed: true as const, session: await toSessionPublic(db, active) };
    }
    throw err;
  }

  const [created] = await db
    .select()
    .from(errorPracticeSessions)
    .where(eq(errorPracticeSessions.id, sessionId))
    .limit(1);
  if (!created) throw notFound("Сессия не найдена");
  return { resumed: false as const, session: await toSessionPublic(db, created) };
}

export async function getErrorPracticeSession(
  db: AppDb,
  ctx: AuthContext,
  sessionId?: string
) {
  const studentId = await requireOwnStudent(db, ctx);
  const session = sessionId
    ? (
        await db
          .select()
          .from(errorPracticeSessions)
          .where(
            and(
              eq(errorPracticeSessions.id, sessionId),
              eq(errorPracticeSessions.studentId, studentId)
            )
          )
          .limit(1)
      )[0]
    : await findActiveSession(db, studentId);
  if (!session) return { session: null };
  return { session: await toSessionPublic(db, session) };
}

export async function listErrorPracticeHistory(db: AppDb, ctx: AuthContext) {
  const studentId = await requireOwnStudent(db, ctx);
  const rows = await db
    .select()
    .from(errorPracticeSessions)
    .where(
      and(
        eq(errorPracticeSessions.studentId, studentId),
        eq(errorPracticeSessions.status, "completed")
      )
    )
    .orderBy(desc(errorPracticeSessions.completedAt))
    .limit(50);
  return {
    sessions: rows.map((row) => ({
      id: row.id,
      mode: row.mode as ErrorPracticeMode,
      kimNumber: row.kimNumber,
      questionCount: row.questionCount,
      correctCount: row.correctCount,
      incorrectCount: row.incorrectCount,
      percent: row.percent != null ? Number(row.percent) : null,
      completedAt: row.completedAt?.toISOString() ?? null,
      startedAt: row.startedAt.toISOString(),
    })),
  };
}

export async function submitErrorPracticeAnswer(
  db: AppDb,
  ctx: AuthContext,
  input: {
    sessionId?: unknown;
    itemId?: unknown;
    answer?: unknown;
  }
) {
  const studentId = await requireOwnStudent(db, ctx);
  const sessionId = String(input.sessionId ?? "").trim();
  const itemId = String(input.itemId ?? "").trim();
  if (!sessionId || !itemId) throw validationError("Не указан вопрос сессии");

  const [session] = await db
    .select()
    .from(errorPracticeSessions)
    .where(
      and(
        eq(errorPracticeSessions.id, sessionId),
        eq(errorPracticeSessions.studentId, studentId)
      )
    )
    .limit(1);
  if (!session) throw notFound("Сессия не найдена");
  if (session.status !== "active") throw conflict("Сессия уже завершена");

  const [item] = await db
    .select()
    .from(errorPracticeSessionItems)
    .where(
      and(
        eq(errorPracticeSessionItems.id, itemId),
        eq(errorPracticeSessionItems.sessionId, sessionId)
      )
    )
    .limit(1);
  if (!item) throw notFound("Задание не найдено");

  if (item.answeredAt) {
    return {
      item: toItemPublic(item, { includeExplanation: true }),
      session: await toSessionPublic(db, session),
    };
  }

  // Только текущий неотвеченный по порядку
  const items = await loadSessionItems(db, sessionId);
  const firstOpen = items.find((i) => !i.answeredAt);
  if (!firstOpen || firstOpen.id !== item.id) {
    throw badRequest("Сначала ответьте на текущий вопрос");
  }

  const snapshot = readSnapshot(item.questionSnapshot);
  const rawAnswer = (input.answer ?? {}) as StudentAnswer;
  const cleaned: StudentAnswer = {
    questionId: snapshot.question.id,
    selectedOptionIds: rawAnswer.selectedOptionIds,
    textAnswer: rawAnswer.textAnswer,
    matching: rawAnswer.matching,
    order: rawAnswer.order,
  };
  const graded = gradeSubmission([snapshot.question], [cleaned]);
  const gradedAnswer = graded.answers[0]!;
  const correct = Boolean(gradedAnswer.isCorrect);
  const now = new Date();

  let bankMastered: boolean | null = null;
  let bankReturnedToWaiting: boolean | null = null;

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(errorPracticeSessionItems)
      .set({
        answerPayload: cleaned as unknown as Record<string, unknown>,
        isCorrect: correct,
        answeredAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(errorPracticeSessionItems.id, item.id),
          sql`${errorPracticeSessionItems.answeredAt} is null`
        )
      )
      .returning();
    if (!updated) return;

    if (item.sourceKind === "bank" && item.errorBankId) {
      if (correct) {
        await masterErrorBankEntry(tx as unknown as AppDb, {
          organizationId: ctx.organizationId,
          studentId,
          errorBankId: item.errorBankId,
          now,
        });
        bankMastered = true;
      } else {
        await reopenErrorBankAfterPracticeMiss(tx as unknown as AppDb, {
          organizationId: ctx.organizationId,
          studentId,
          errorBankId: item.errorBankId,
          now,
          dedupeKey: errorBankDedupeKey({
            sourceAssignmentId: sessionId,
            questionId: item.sourceQuestionId,
            reason: "practice",
          }),
        });
        bankReturnedToWaiting = true;
      }
    } else if (item.sourceKind === "pool" && !correct) {
      await recordIncorrectAnswers(tx as unknown as AppDb, {
        organizationId: ctx.organizationId,
        studentId,
        sourceAssignmentId: null,
        sourceTestId: item.sourceTestId,
        questions: [snapshot.question],
        answers: [gradedAnswer],
        now,
        reason: "practice",
        attemptNumber: item.position,
        dedupeScope: sessionId,
      });
    }

    const all = await loadSessionItems(tx as unknown as AppDb, sessionId);
    const correctCount = all.filter((i) => i.isCorrect === true).length;
    const incorrectCount = all.filter((i) => i.isCorrect === false).length;
    const done = all.every((i) => i.answeredAt);
    const percent = done
      ? Math.round((correctCount / Math.max(all.length, 1)) * 1000) / 10
      : null;
    await tx
      .update(errorPracticeSessions)
      .set({
        correctCount,
        incorrectCount,
        percent: percent != null ? String(percent) : null,
        status: done ? "completed" : "active",
        completedAt: done ? now : null,
        updatedAt: now,
      })
      .where(eq(errorPracticeSessions.id, sessionId));
  });

  const [freshItem] = await db
    .select()
    .from(errorPracticeSessionItems)
    .where(eq(errorPracticeSessionItems.id, itemId))
    .limit(1);
  const [freshSession] = await db
    .select()
    .from(errorPracticeSessions)
    .where(eq(errorPracticeSessions.id, sessionId))
    .limit(1);

  const publicItem = toItemPublic(freshItem!, { includeExplanation: true });
  publicItem.bankMastered = bankMastered;
  publicItem.bankReturnedToWaiting = bankReturnedToWaiting;

  return {
    item: publicItem,
    session: await toSessionPublic(db, freshSession!),
  };
}

/** Доступ к изображению вопроса из снимка банка/сессии. */
export async function studentCanAccessErrorPracticeImage(
  db: AppDb,
  studentId: string,
  testId: string,
  questionId: string
): Promise<boolean> {
  const items = await db
    .select({ id: errorPracticeSessionItems.id })
    .from(errorPracticeSessionItems)
    .innerJoin(
      errorPracticeSessions,
      eq(errorPracticeSessions.id, errorPracticeSessionItems.sessionId)
    )
    .where(
      and(
        eq(errorPracticeSessions.studentId, studentId),
        eq(errorPracticeSessionItems.sourceTestId, testId),
        eq(errorPracticeSessionItems.sourceQuestionId, questionId)
      )
    )
    .limit(1);
  return items.length > 0;
}
