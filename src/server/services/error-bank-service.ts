import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import {
  ERROR_BANK_DELAY_MS,
  type ErrorBankSummary,
  type ErrorQuestionSnapshot,
} from "@/lib/error-practice/types";
import { formatKimNumber, normalizeKimNumber } from "@/lib/math/rich-text-math";
import type { StudentAnswer, TestQuestion } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  studentErrorBank,
  studentErrorBankEvents,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/** Стабильный id события: повтор HTTP/гонка не создаёт второй ряд. */
export function errorBankEventId(studentId: string, dedupeKey: string) {
  return `sebe_${createHash("sha256")
    .update(`${studentId}\0${dedupeKey}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function isUniqueViolation(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

export function availableAtFrom(now: Date) {
  return new Date(now.getTime() + ERROR_BANK_DELAY_MS);
}

/** Ключ идемпотентности одной фиксации ошибки в рамках попытки/проверки. */
export function errorBankDedupeKey(input: {
  sourceAssignmentId?: string | null;
  attemptNumber?: number | null;
  questionId: string;
  reason: "submit" | "review" | "practice";
}): string {
  const assignment = input.sourceAssignmentId?.trim() || "none";
  const attempt =
    input.attemptNumber == null ? input.reason : String(input.attemptNumber);
  return `${assignment}:${attempt}:${input.questionId}`;
}

export function buildErrorQuestionSnapshot(
  question: TestQuestion,
  meta?: { sourceTestId?: string | null; sourceAssignmentId?: string | null }
): ErrorQuestionSnapshot {
  return {
    question: structuredClone
      ? structuredClone(question)
      : (JSON.parse(JSON.stringify(question)) as TestQuestion),
    sourceTestId: meta?.sourceTestId ?? null,
    sourceAssignmentId: meta?.sourceAssignmentId ?? null,
  };
}

async function insertEvent(
  db: AppDb,
  input: {
    organizationId: string;
    studentId: string;
    errorBankId: string | null;
    sourceQuestionId: string;
    eventType: "recorded" | "repeated" | "available" | "mastered" | "reopened";
    payload?: Record<string, unknown>;
    /** Если задан — id детерминирован; конфликт = уже обработано. */
    dedupeKey?: string | null;
  }
): Promise<boolean> {
  const id = input.dedupeKey
    ? errorBankEventId(input.studentId, input.dedupeKey)
    : newId("sebe");
  const payload = {
    ...(input.payload ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };
  try {
    await db.insert(studentErrorBankEvents).values({
      id,
      organizationId: input.organizationId,
      studentId: input.studentId,
      errorBankId: input.errorBankId,
      sourceQuestionId: input.sourceQuestionId,
      eventType: input.eventType,
      payload: Object.keys(payload).length > 0 ? payload : null,
    });
    return true;
  } catch (err) {
    if (input.dedupeKey && isUniqueViolation(err)) return false;
    throw err;
  }
}

async function hasDedupeEvent(
  db: AppDb,
  studentId: string,
  dedupeKey: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: studentErrorBankEvents.id })
    .from(studentErrorBankEvents)
    .where(eq(studentErrorBankEvents.id, errorBankEventId(studentId, dedupeKey)))
    .limit(1);
  return Boolean(row);
}

/** waiting → available по серверному UTC-времени (timestamptz). */
export async function refreshErrorBankAvailability(
  db: AppDb,
  studentId: string,
  now = new Date()
) {
  const due = await db
    .update(studentErrorBank)
    .set({ status: "available", updatedAt: now })
    .where(
      and(
        eq(studentErrorBank.studentId, studentId),
        eq(studentErrorBank.status, "waiting"),
        lte(studentErrorBank.availableAt, now)
      )
    )
    .returning();
  for (const row of due) {
    await insertEvent(db, {
      organizationId: row.organizationId,
      studentId,
      errorBankId: row.id,
      sourceQuestionId: row.sourceQuestionId,
      eventType: "available",
      payload: { availableAt: row.availableAt.toISOString() },
    });
  }
  return due.length;
}

async function findActiveBankRow(
  db: AppDb,
  studentId: string,
  questionId: string
) {
  const [active] = await db
    .select()
    .from(studentErrorBank)
    .where(
      and(
        eq(studentErrorBank.studentId, studentId),
        eq(studentErrorBank.sourceQuestionId, questionId),
        inArray(studentErrorBank.status, ["waiting", "available"])
      )
    )
    .limit(1);
  return active ?? null;
}

/**
 * Фиксирует ошибки из graded answers.
 * - Одна активная карточка на (student, sourceQuestionId).
 * - Повтор с тем же dedupeKey не создаёт событие и не двигает таймер.
 * - Снимок при повторной ошибке не перезаписывается.
 */
export async function recordIncorrectAnswers(
  db: AppDb,
  input: {
    organizationId: string;
    studentId: string;
    sourceAssignmentId?: string | null;
    sourceTestId?: string | null;
    questions: TestQuestion[];
    answers: StudentAnswer[];
    now?: Date;
    attemptNumber?: number | null;
    reason?: "submit" | "review" | "practice";
    /** Только для dedupe; не пишется в source_assignment_id (FK). */
    dedupeScope?: string | null;
  }
) {
  const now = input.now ?? new Date();
  const reason = input.reason ?? "submit";
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  let recorded = 0;

  for (const answer of input.answers) {
    if (answer.isCorrect !== false) continue;
    const question = byId.get(answer.questionId);
    if (!question) continue;
    if (question.type === "essay" && answer.needsManualReview) continue;

    const dedupeKey = errorBankDedupeKey({
      sourceAssignmentId:
        input.dedupeScope ?? input.sourceAssignmentId,
      attemptNumber: input.attemptNumber,
      questionId: question.id,
      reason,
    });
    if (await hasDedupeEvent(db, input.studentId, dedupeKey)) {
      continue;
    }

    const kimNumber = normalizeKimNumber(question.kimNumber) ?? null;
    const snapshot = buildErrorQuestionSnapshot(question, {
      sourceTestId: input.sourceTestId,
      sourceAssignmentId: input.sourceAssignmentId,
    });
    const nextAvailable = availableAtFrom(now);
    const eventPayload = {
      availableAt: nextAvailable.toISOString(),
      sourceAssignmentId: input.sourceAssignmentId,
      attemptNumber: input.attemptNumber ?? null,
      reason,
    };

    const didRecord = await db.transaction(async (tx) => {
      const txDb = tx as unknown as AppDb;
      let active = await findActiveBankRow(txDb, input.studentId, question.id);

      if (active) {
        const claimed = await insertEvent(txDb, {
          organizationId: input.organizationId,
          studentId: input.studentId,
          errorBankId: active.id,
          sourceQuestionId: question.id,
          eventType: "repeated",
          payload: eventPayload,
          dedupeKey,
        });
        if (!claimed) return false;
        await tx
          .update(studentErrorBank)
          .set({
            lastErrorAt: now,
            availableAt: nextAvailable,
            status: "waiting",
            incorrectAttemptsCount: active.incorrectAttemptsCount + 1,
            // Снимок первой ошибки сохраняем: правки шаблона и повторные ДЗ
            // не подменяют зафиксированное содержание.
            kimNumber: active.kimNumber ?? kimNumber,
            sourceAssignmentId:
              input.sourceAssignmentId ?? active.sourceAssignmentId,
            sourceTestId: input.sourceTestId ?? active.sourceTestId,
            updatedAt: now,
          })
          .where(eq(studentErrorBank.id, active.id));
        return true;
      }

      const id = newId("seb");
      const claimed = await insertEvent(txDb, {
        organizationId: input.organizationId,
        studentId: input.studentId,
        errorBankId: null,
        sourceQuestionId: question.id,
        eventType: "recorded",
        payload: eventPayload,
        dedupeKey,
      });
      if (!claimed) return false;

      try {
        await tx.insert(studentErrorBank).values({
          id,
          organizationId: input.organizationId,
          studentId: input.studentId,
          sourceAssignmentId: input.sourceAssignmentId ?? null,
          sourceTestId: input.sourceTestId ?? null,
          sourceQuestionId: question.id,
          questionSnapshot: snapshot as unknown as Record<string, unknown>,
          kimNumber,
          firstErrorAt: now,
          lastErrorAt: now,
          incorrectAttemptsCount: 1,
          availableAt: nextAvailable,
          status: "waiting",
        });
        await tx
          .update(studentErrorBankEvents)
          .set({ errorBankId: id })
          .where(
            eq(
              studentErrorBankEvents.id,
              errorBankEventId(input.studentId, dedupeKey)
            )
          );
        return true;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        active = await findActiveBankRow(txDb, input.studentId, question.id);
        if (!active) throw err;
        await tx
          .update(studentErrorBank)
          .set({
            lastErrorAt: now,
            availableAt: nextAvailable,
            status: "waiting",
            incorrectAttemptsCount: active.incorrectAttemptsCount + 1,
            sourceAssignmentId:
              input.sourceAssignmentId ?? active.sourceAssignmentId,
            sourceTestId: input.sourceTestId ?? active.sourceTestId,
            updatedAt: now,
          })
          .where(eq(studentErrorBank.id, active.id));
        await tx
          .update(studentErrorBankEvents)
          .set({
            errorBankId: active.id,
            eventType: "repeated",
            payload: { ...eventPayload, dedupeKey, raced: true },
          })
          .where(
            eq(
              studentErrorBankEvents.id,
              errorBankEventId(input.studentId, dedupeKey)
            )
          );
        return true;
      }
    });

    if (didRecord) recorded += 1;
  }

  return { recorded };
}

export async function masterErrorBankEntry(
  db: AppDb,
  input: {
    organizationId: string;
    studentId: string;
    errorBankId: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(studentErrorBank)
    .set({
      status: "mastered",
      masteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(studentErrorBank.id, input.errorBankId),
        eq(studentErrorBank.studentId, input.studentId),
        inArray(studentErrorBank.status, ["waiting", "available"])
      )
    )
    .returning();
  if (!row) {
    const [existing] = await db
      .select()
      .from(studentErrorBank)
      .where(
        and(
          eq(studentErrorBank.id, input.errorBankId),
          eq(studentErrorBank.studentId, input.studentId)
        )
      )
      .limit(1);
    return existing ?? null;
  }

  await insertEvent(db, {
    organizationId: input.organizationId,
    studentId: input.studentId,
    errorBankId: row.id,
    sourceQuestionId: row.sourceQuestionId,
    eventType: "mastered",
  });
  return row;
}

export async function reopenErrorBankAfterPracticeMiss(
  db: AppDb,
  input: {
    organizationId: string;
    studentId: string;
    errorBankId: string;
    now?: Date;
    dedupeKey?: string;
  }
) {
  const now = input.now ?? new Date();
  const [row] = await db
    .select()
    .from(studentErrorBank)
    .where(
      and(
        eq(studentErrorBank.id, input.errorBankId),
        eq(studentErrorBank.studentId, input.studentId)
      )
    )
    .limit(1);
  if (!row || row.status === "mastered") return null;

  if (input.dedupeKey && (await hasDedupeEvent(db, input.studentId, input.dedupeKey))) {
    return true;
  }

  const nextAvailable = availableAtFrom(now);
  const claimed = await insertEvent(db, {
    organizationId: input.organizationId,
    studentId: input.studentId,
    errorBankId: row.id,
    sourceQuestionId: row.sourceQuestionId,
    eventType: "repeated",
    payload: {
      fromPractice: true,
      availableAt: nextAvailable.toISOString(),
      reason: "practice",
    },
    dedupeKey: input.dedupeKey,
  });
  if (!claimed) return true;

  await db
    .update(studentErrorBank)
    .set({
      lastErrorAt: now,
      availableAt: nextAvailable,
      status: "waiting",
      incorrectAttemptsCount: row.incorrectAttemptsCount + 1,
      updatedAt: now,
    })
    .where(eq(studentErrorBank.id, row.id));
  return true;
}

export async function getErrorBankSummary(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
): Promise<ErrorBankSummary> {
  if (ctx.role === "student" && ctx.studentId !== studentId) {
    throw forbidden("Можно смотреть только свой банк ошибок");
  }
  await refreshErrorBankAvailability(db, studentId);
  const rows = await db
    .select()
    .from(studentErrorBank)
    .where(eq(studentErrorBank.studentId, studentId));

  const active = rows.filter(
    (r) => r.status === "waiting" || r.status === "available"
  );
  const byKim = new Map<string, ErrorBankSummary["byKim"][number]>();
  for (const row of active) {
    const key = row.kimNumber == null ? "none" : String(row.kimNumber);
    const existing = byKim.get(key) ?? {
      kimNumber: row.kimNumber,
      label: formatKimNumber(row.kimNumber),
      active: 0,
      available: 0,
      waiting: 0,
    };
    existing.active += 1;
    if (row.status === "available") existing.available += 1;
    else existing.waiting += 1;
    byKim.set(key, existing);
  }

  const waiting = active.filter((r) => r.status === "waiting");
  const nextMs =
    waiting.length === 0
      ? null
      : waiting.reduce(
          (min, row) => Math.min(min, row.availableAt.getTime()),
          Number.POSITIVE_INFINITY
        );

  return {
    activeCount: active.length,
    availableCount: active.filter((r) => r.status === "available").length,
    waitingCount: waiting.length,
    masteredCount: rows.filter((r) => r.status === "mastered").length,
    byKim: [...byKim.values()].sort((a, b) => {
      if (a.kimNumber == null) return 1;
      if (b.kimNumber == null) return -1;
      return a.kimNumber - b.kimNumber;
    }),
    nextAvailableAt:
      nextMs == null || !Number.isFinite(nextMs)
        ? null
        : new Date(nextMs).toISOString(),
  };
}

export async function listAvailableErrorBankRows(
  db: AppDb,
  studentId: string,
  kimNumber?: number | null
) {
  await refreshErrorBankAvailability(db, studentId);
  const rows = await db
    .select()
    .from(studentErrorBank)
    .where(
      and(
        eq(studentErrorBank.studentId, studentId),
        eq(studentErrorBank.status, "available")
      )
    );
  if (kimNumber == null) return rows;
  return rows.filter((r) => r.kimNumber === kimNumber);
}

/** Ключ изображения из снимка банка/сессии, если живой шаблон уже изменён. */
export async function resolveErrorBankImageObjectKey(
  db: AppDb,
  studentId: string,
  testId: string,
  questionId: string
): Promise<string | null> {
  const [bank] = await db
    .select({ questionSnapshot: studentErrorBank.questionSnapshot })
    .from(studentErrorBank)
    .where(
      and(
        eq(studentErrorBank.studentId, studentId),
        eq(studentErrorBank.sourceTestId, testId),
        eq(studentErrorBank.sourceQuestionId, questionId)
      )
    )
    .limit(1);
  if (bank) {
    const snap = bank.questionSnapshot as ErrorQuestionSnapshot;
    const key = snap.question?.imageObjectKey?.trim();
    if (key) return key;
  }
  return null;
}

export async function countActiveErrors(
  db: AppDb,
  studentId: string
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studentErrorBank)
    .where(
      and(
        eq(studentErrorBank.studentId, studentId),
        inArray(studentErrorBank.status, ["waiting", "available"])
      )
    );
  return Number(row?.n ?? 0);
}
