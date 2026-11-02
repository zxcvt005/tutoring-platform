import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  FORMULA_CATALOG,
  TRAINER_GROUPS,
  allSubsectionIds,
  formulasInSubsections,
  getFormula,
  groupBySectionId,
  inferSelectedGroup,
  listSubsections,
  subsectionsForGroup,
} from "@/lib/formula-trainer/catalog";
import { buildChoiceOptions } from "@/lib/formula-trainer/distractors";
import { explainMistake, explainChoiceDiff } from "@/lib/formula-trainer/math/explain";
import { equateExpressions } from "@/lib/formula-trainer/math/equate";
import {
  trainerSessionStartCheck,
  TRAINER_QUESTION_COUNTS,
  listWeakTopics,
} from "@/lib/formula-trainer/display";
import {
  applyAttempt,
  buildSectionStats,
  emptyProgress,
} from "@/lib/formula-trainer/progress";
import { createRng } from "@/lib/formula-trainer/rng";
import {
  drawUniformFormulas,
  selectNextQuestion,
} from "@/lib/formula-trainer/selection";
import type {
  AnswerFeedback,
  FormulaProgressRow,
  FormulaSubsectionId,
  QuestionKind,
  QuickQuestionState,
  TrainerQuestionPublic,
  TrainerSessionPublic,
  TrainerSettings,
} from "@/lib/formula-trainer/types";
import { FORMULA_TRAINER_PRODUCT_SLUG } from "@/lib/products";
import type { AuthContext } from "@/server/authz/context";
import { requireStudentProfile } from "@/server/authz/require";
import { requireStudentProductAccess } from "@/server/services/products-service";
import {
  formulaTrainerProgress,
  formulaTrainerQuestions,
  formulaTrainerSessions,
  formulaTrainerSettings,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden, notFound, validationError } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function assertOwnStudent(ctx: AuthContext, studentId: string) {
  if (ctx.role !== "student" || ctx.studentId !== studentId) {
    throw forbidden("Можно изменять только свой прогресс");
  }
}

async function requireStudent(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudentProfile(ctx);
  assertOwnStudent(ctx, studentId);
  await requireStudentProductAccess(db, ctx, FORMULA_TRAINER_PRODUCT_SLUG);
  return studentId;
}

function rowToProgress(
  row: typeof formulaTrainerProgress.$inferSelect
): FormulaProgressRow {
  return {
    formulaId: row.formulaId,
    attempts: row.attempts,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    status: row.status as FormulaProgressRow["status"],
    streak: row.streak,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
  };
}

async function loadProgressMap(
  db: AppDb,
  studentId: string
): Promise<Map<string, FormulaProgressRow>> {
  const rows = await db
    .select()
    .from(formulaTrainerProgress)
    .where(eq(formulaTrainerProgress.studentId, studentId));
  const map = new Map<string, FormulaProgressRow>();
  for (const r of rows) map.set(r.formulaId, rowToProgress(r));
  return map;
}

async function ensureSettings(db: AppDb, ctx: AuthContext, studentId: string) {
  const existing = await db
    .select()
    .from(formulaTrainerSettings)
    .where(eq(formulaTrainerSettings.studentId, studentId))
    .limit(1);
  if (existing[0]) return existing[0];
  const row = {
    studentId,
    organizationId: ctx.organizationId,
    mode: "choice" as const,
    selectedSubsections: allSubsectionIds() as string[],
    weakSpotsOnly: false,
    quickQuestion: null as Record<string, unknown> | null,
    recentFormulaIds: [] as string[],
  };
  await db.insert(formulaTrainerSettings).values(row);
  return {
    ...row,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function settingsPublic(
  row: typeof formulaTrainerSettings.$inferSelect | Awaited<ReturnType<typeof ensureSettings>>
): TrainerSettings {
  const selected = (row.selectedSubsections ?? []) as FormulaSubsectionId[];
  return {
    mode: "choice",
    selectedSubsectionIds: selected,
    selectedGroupId: inferSelectedGroup(selected),
    weakSpotsOnly: Boolean(row.weakSpotsOnly),
  };
}

function toPublicQuestion(
  q: typeof formulaTrainerQuestions.$inferSelect
): TrainerQuestionPublic {
  const card = getFormula(q.formulaId);
  const groupTitle = card ? groupBySectionId(card.sectionId).title : "";
  return {
    questionId: q.id,
    formulaId: q.formulaId,
    title: card?.title ?? q.formulaId,
    sectionTitle: card?.sectionTitle ?? "",
    subsectionTitle: card?.subsectionTitle ?? "",
    groupTitle,
    kind: "choice",
    options: q.options ?? undefined,
  };
}

async function inTx<T>(db: AppDb, run: (tx: AppDb) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => run(tx as unknown as AppDb));
}

function isUniqueViolation(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

async function findActiveSession(db: AppDb, studentId: string) {
  const [row] = await db
    .select()
    .from(formulaTrainerSessions)
    .where(
      and(
        eq(formulaTrainerSessions.studentId, studentId),
        eq(formulaTrainerSessions.status, "active")
      )
    )
    .limit(1);
  return row ?? null;
}

async function toSessionPublic(
  db: AppDb,
  session: typeof formulaTrainerSessions.$inferSelect
): Promise<TrainerSessionPublic> {
  const rows = await db
    .select()
    .from(formulaTrainerQuestions)
    .where(eq(formulaTrainerQuestions.sessionId, session.id));
  let answered = 0;
  let correct = 0;
  const current = rows.find((row) => row.position === session.currentIndex) ?? null;
  for (const row of rows) {
    if (!row.answeredAt) continue;
    answered += 1;
    if (row.isCorrect) correct += 1;
  }
  const showQuestion =
    session.status === "active" && current != null && current.answeredAt == null;
  return {
    id: session.id,
    status: session.status === "completed" ? "completed" : "active",
    questionCount: session.questionCount,
    index: Math.min(session.currentIndex + 1, session.questionCount),
    answered,
    correct,
    question: showQuestion ? toPublicQuestion(current) : null,
  };
}

async function advanceSession(
  db: AppDb,
  studentId: string,
  sessionId: string,
  position: number
) {
  const [session] = await db
    .select()
    .from(formulaTrainerSessions)
    .where(eq(formulaTrainerSessions.id, sessionId))
    .limit(1);
  if (!session || session.studentId !== studentId) {
    throw forbidden("Можно изменять только свою тренировку");
  }
  if (session.status !== "active" || session.currentIndex !== position) return;
  const nextIndex = position + 1;
  const done = nextIndex >= session.questionCount;
  await db
    .update(formulaTrainerSessions)
    .set({
      currentIndex: done ? session.questionCount : nextIndex,
      status: done ? "completed" : "active",
      completedAt: done ? new Date() : session.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(formulaTrainerSessions.id, session.id));
}

async function createQuestion(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  input: {
    formulaId: string;
    kind: QuestionKind;
    source: "quick" | "trainer";
    seed?: number;
  }
) {
  const card = getFormula(input.formulaId);
  if (!card) throw validationError("Неизвестная формула");

  const settings = await ensureSettings(db, ctx, studentId);
  const subs = (settings.selectedSubsections ?? []) as FormulaSubsectionId[];
  const pool = formulasInSubsections(subs.length ? subs : allSubsectionIds());
  const seed = input.seed ?? Date.now() ^ studentId.length;
  const built = buildChoiceOptions(card, pool, seed);
  if (!built) {
    throw validationError("Вопрос временно недоступен: не удалось собрать варианты");
  }
  const options = built.options;
  const correctOptionId = built.correctOptionId;

  const id = newId("ftq");
  await db.insert(formulaTrainerQuestions).values({
    id,
    organizationId: ctx.organizationId,
    studentId,
    formulaId: input.formulaId,
    kind: "choice",
    options,
    correctOptionId,
    source: input.source,
  });

  const [row] = await db
    .select()
    .from(formulaTrainerQuestions)
    .where(eq(formulaTrainerQuestions.id, id))
    .limit(1);
  return row!;
}

async function pushRecent(
  db: AppDb,
  studentId: string,
  formulaId: string
) {
  const [settings] = await db
    .select()
    .from(formulaTrainerSettings)
    .where(eq(formulaTrainerSettings.studentId, studentId))
    .limit(1);
  if (!settings) return;
  const recent = [
    formulaId,
    ...((settings.recentFormulaIds ?? []) as string[]).filter((id) => id !== formulaId),
  ].slice(0, 8);
  await db
    .update(formulaTrainerSettings)
    .set({ recentFormulaIds: recent, updatedAt: new Date() })
    .where(eq(formulaTrainerSettings.studentId, studentId));
}

async function upsertProgress(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  next: FormulaProgressRow
) {
  const [existing] = await db
    .select()
    .from(formulaTrainerProgress)
    .where(
      and(
        eq(formulaTrainerProgress.studentId, studentId),
        eq(formulaTrainerProgress.formulaId, next.formulaId)
      )
    )
    .limit(1);

  const values = {
    organizationId: ctx.organizationId,
    studentId,
    formulaId: next.formulaId,
    attempts: next.attempts,
    correctCount: next.correctCount,
    wrongCount: next.wrongCount,
    status: next.status,
    streak: next.streak,
    lastAttemptAt: next.lastAttemptAt ? new Date(next.lastAttemptAt) : null,
    nextReviewAt: next.nextReviewAt ? new Date(next.nextReviewAt) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(formulaTrainerProgress)
      .set(values)
      .where(eq(formulaTrainerProgress.id, existing.id));
  } else {
    await db.insert(formulaTrainerProgress).values({
      id: newId("ftp"),
      ...values,
    });
  }
}

export async function getFormulaTrainerState(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudent(db, ctx);
  const settingsRow = await ensureSettings(db, ctx, studentId);
  const settings = settingsPublic(settingsRow);
  const progressMap = await loadProgressMap(db, studentId);
  const stats = buildSectionStats(progressMap);

  const active = await findActiveSession(db, studentId);
  return {
    catalogSize: FORMULA_CATALOG.length,
    subsections: listSubsections(),
    settings,
    progress: [...progressMap.values()],
    stats,
    activeSession: active ? await toSessionPublic(db, active) : null,
  };
}

export async function updateFormulaTrainerSettings(
  db: AppDb,
  ctx: AuthContext,
  input: {
    mode?: unknown;
    selectedSubsectionIds?: unknown;
    selectedGroupId?: unknown;
    weakSpotsOnly?: unknown;
  }
) {
  const studentId = await requireStudent(db, ctx);
  await ensureSettings(db, ctx, studentId);

  const patch: Partial<typeof formulaTrainerSettings.$inferInsert> = {
    updatedAt: new Date(),
    mode: "choice",
  };

  if (input.selectedGroupId != null) {
    const groupId = String(input.selectedGroupId);
    if (groupId === "all") {
      patch.selectedSubsections = allSubsectionIds();
    } else {
      const group = TRAINER_GROUPS.find((g) => g.id === groupId);
      if (!group) throw validationError("Некорректный раздел");
      patch.selectedSubsections = subsectionsForGroup(group.id);
    }
  } else if (input.selectedSubsectionIds != null) {
    if (!Array.isArray(input.selectedSubsectionIds)) {
      throw validationError("Некорректный выбор разделов");
    }
    const allowed = new Set(allSubsectionIds());
    const ids = input.selectedSubsectionIds.map(String).filter((id) =>
      allowed.has(id as FormulaSubsectionId)
    ) as FormulaSubsectionId[];
    patch.selectedSubsections = ids;
  }

  if (input.weakSpotsOnly != null) {
    patch.weakSpotsOnly = Boolean(input.weakSpotsOnly);
  }

  await db
    .update(formulaTrainerSettings)
    .set(patch)
    .where(eq(formulaTrainerSettings.studentId, studentId));

  return getFormulaTrainerState(db, ctx);
}

export async function getOrCreateQuickQuestion(
  db: AppDb,
  ctx: AuthContext
): Promise<QuickQuestionState> {
  const studentId = await requireStudent(db, ctx);
  const settings = await ensureSettings(db, ctx, studentId);
  const quick = settings.quickQuestion as {
    questionId?: string;
  } | null;

  if (quick?.questionId) {
    const [existing] = await db
      .select()
      .from(formulaTrainerQuestions)
      .where(eq(formulaTrainerQuestions.id, quick.questionId))
      .limit(1);
    if (existing && existing.source === "quick") {
      if (existing.answeredAt) {
        const progressMap = await loadProgressMap(db, studentId);
        const progress =
          progressMap.get(existing.formulaId) ?? emptyProgress(existing.formulaId);
        const card = getFormula(existing.formulaId);
        return {
          question: toPublicQuestion(existing),
          answered: true,
          selectedOptionId: existing.selectedOptionId,
          feedback: {
            correct: Boolean(existing.isCorrect),
            status: existing.isCorrect ? "equivalent" : "not_equivalent",
            correctExpression: card?.expression ?? "",
            explanation: existing.explanation ?? "",
            progress,
          },
        };
      }
      return {
        question: toPublicQuestion(existing),
        answered: false,
        selectedOptionId: null,
        feedback: null,
      };
    }
  }

  // новый быстрый вопрос — всегда choice
  const progressMap = await loadProgressMap(db, studentId);
  const selected = (settings.selectedSubsections ?? []) as FormulaSubsectionId[];
  if (selected.length === 0) {
    return {
      question: null,
      answered: false,
      selectedOptionId: null,
      feedback: null,
      message: "Выберите хотя бы один раздел в тренажёре формул",
    };
  }
  const picked = selectNextQuestion({
    subsectionIds: selected,
    progress: progressMap,
    weakSpotsOnly: false,
    recentFormulaIds: (settings.recentFormulaIds ?? []) as string[],
    seed: Date.now() ^ studentId.charCodeAt(0),
  });

  if (!picked.ok) {
    return {
      question: null,
      answered: false,
      selectedOptionId: null,
      feedback: null,
      message: picked.reason,
    };
  }

  const q = await createQuestion(db, ctx, studentId, {
    formulaId: picked.formula.id,
    kind: "choice",
    source: "quick",
    seed: Date.now(),
  });

  await db
    .update(formulaTrainerSettings)
    .set({
      quickQuestion: { questionId: q.id },
      updatedAt: new Date(),
    })
    .where(eq(formulaTrainerSettings.studentId, studentId));

  await pushRecent(db, studentId, picked.formula.id);

  return {
    question: toPublicQuestion(q),
    answered: false,
    selectedOptionId: null,
    feedback: null,
  };
}

export async function nextTrainerQuestion(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudent(db, ctx);
  const settings = await ensureSettings(db, ctx, studentId);
  const progressMap = await loadProgressMap(db, studentId);
  const selected = (settings.selectedSubsections ?? []) as FormulaSubsectionId[];
  if (selected.length === 0) {
    return {
      ok: false as const,
      reason: "Выберите хотя бы один раздел",
    };
  }
  const picked = selectNextQuestion({
    subsectionIds: selected,
    progress: progressMap,
    weakSpotsOnly: Boolean(settings.weakSpotsOnly),
    recentFormulaIds: (settings.recentFormulaIds ?? []) as string[],
    seed: Date.now() ^ (progressMap.size + 1),
  });

  if (!picked.ok) {
    return { ok: false as const, reason: picked.reason };
  }

  const q = await createQuestion(db, ctx, studentId, {
    formulaId: picked.formula.id,
    kind: "choice",
    source: "trainer",
  });
  await pushRecent(db, studentId, picked.formula.id);
  return { ok: true as const, question: toPublicQuestion(q) };
}

export async function submitFormulaAnswer(
  db: AppDb,
  ctx: AuthContext,
  input: {
    questionId?: unknown;
    selectedOptionId?: unknown;
    expression?: unknown;
  }
): Promise<{ feedback: AnswerFeedback; question: TrainerQuestionPublic }> {
  const studentId = await requireStudent(db, ctx);
  const questionId = String(input.questionId ?? "").trim();
  if (!questionId) throw validationError("Не указан вопрос");

  const [q] = await db
    .select()
    .from(formulaTrainerQuestions)
    .where(eq(formulaTrainerQuestions.id, questionId))
    .limit(1);

  if (!q || q.studentId !== studentId) throw notFound("Вопрос не найден");
  if (q.sessionId != null && q.position != null && !q.answeredAt) {
    const [session] = await db
      .select()
      .from(formulaTrainerSessions)
      .where(eq(formulaTrainerSessions.id, q.sessionId))
      .limit(1);
    if (!session || session.studentId !== studentId) {
      throw forbidden("Можно изменять только свою тренировку");
    }
    if (session.status !== "active" || session.currentIndex !== q.position) {
      throw validationError("Сначала ответьте на текущий вопрос");
    }
  }
  if (q.answeredAt) {
    // идемпотентность: повторная отправка не меняет прогресс
    const progressMap = await loadProgressMap(db, studentId);
    const card = getFormula(q.formulaId);
    return {
      question: toPublicQuestion(q),
      feedback: {
        correct: Boolean(q.isCorrect),
        status: q.isCorrect ? "equivalent" : "not_equivalent",
        correctExpression: card?.expression ?? "",
        explanation: q.explanation ?? "",
        progress: progressMap.get(q.formulaId) ?? emptyProgress(q.formulaId),
      },
    };
  }

  const card = getFormula(q.formulaId);
  if (!card) throw validationError("Формула недоступна");

  let correct = false;
  let status: AnswerFeedback["status"] = "not_equivalent";
  let explanation = "";
  let studentAnswer = "";
  let selectedOptionId: string | null = null;

  if (q.kind === "choice") {
    selectedOptionId = String(input.selectedOptionId ?? "").trim() || null;
    if (!selectedOptionId) throw validationError("Выберите вариант ответа");
    const opt = (q.options ?? []).find((o) => o.id === selectedOptionId);
    if (!opt) throw validationError("Некорректный вариант");
    studentAnswer = opt.expression;
    correct = selectedOptionId === q.correctOptionId;
    status = correct ? "equivalent" : "not_equivalent";
    explanation = correct
      ? ""
      : explainChoiceDiff(opt.expression, card.expression);
  } else {
    studentAnswer = String(input.expression ?? "").trim();
    const result = equateExpressions(studentAnswer, card.expression, {
      acceptedForms: card.acceptedForms,
      targetQuantity: card.targetQuantity,
      symbolicCheck: card.symbolicCheck,
    });
    status = result.status;
    if (result.status === "equivalent") correct = true;
    else if (result.status === "unverifiable") {
      correct = false;
      explanation =
        "Не удалось надёжно проверить ответ. Проверь расположение величин и математические операции";
    } else if (result.status === "invalid") {
      correct = false;
      explanation = explainMistake(studentAnswer, card.expression, {
        acceptedForms: card.acceptedForms,
        targetQuantity: card.targetQuantity,
      });
    } else {
      correct = false;
      explanation = explainMistake(studentAnswer, card.expression, {
        acceptedForms: card.acceptedForms,
        targetQuantity: card.targetQuantity,
      });
    }
  }

  // unverifiable не считаем ни правильным, ни ошибкой освоения? Spec: не засчитываем автоматически.
  // Но попытка должна учитываться как неправильная для прогресса, кроме invalid empty?
  // "для выражений, эквивалентность которых невозможно надёжно установить, возвращай состояние «не удалось проверить», а не автоматически засчитывай ответ"
  // So we don't mark as correct. We still record as wrong attempt? I'll record attempt but not increase streak; treat as wrong for stats.

  const progressMap = await loadProgressMap(db, studentId);
  const prev = progressMap.get(q.formulaId);
  const counted = status !== "invalid" || studentAnswer.length > 0;
  const nextProgress = counted
    ? applyAttempt(prev, q.formulaId, correct)
    : prev ?? emptyProgress(q.formulaId);

  const saved = await inTx(db, async (tx) => {
    const [updated] = await tx
      .update(formulaTrainerQuestions)
      .set({
        answeredAt: new Date(),
        isCorrect: correct,
        studentAnswer,
        selectedOptionId,
        explanation,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(formulaTrainerQuestions.id, q.id),
          isNull(formulaTrainerQuestions.answeredAt)
        )
      )
      .returning();
    if (!updated) return null;
    if (counted) await upsertProgress(tx, ctx, studentId, nextProgress);
    if (updated.sessionId != null && updated.position != null) {
      await advanceSession(tx, studentId, updated.sessionId, updated.position);
    }
    return updated;
  });

  if (!saved) {
    const [fresh] = await db
      .select()
      .from(formulaTrainerQuestions)
      .where(eq(formulaTrainerQuestions.id, q.id))
      .limit(1);
    const progressMapAfter = await loadProgressMap(db, studentId);
    return {
      question: toPublicQuestion(fresh ?? q),
      feedback: {
        correct: Boolean(fresh?.isCorrect),
        status: fresh?.isCorrect ? "equivalent" : "not_equivalent",
        correctExpression: card.expression,
        explanation: fresh?.explanation ?? "",
        progress:
          progressMapAfter.get(q.formulaId) ?? emptyProgress(q.formulaId),
      },
    };
  }

  return {
    question: toPublicQuestion(q),
    feedback: {
      correct,
      status,
      correctExpression: card.expression,
      explanation,
      progress: nextProgress,
    },
  };
}

export async function resetSectionProgress(
  db: AppDb,
  ctx: AuthContext,
  input: { subsectionId?: unknown; sectionId?: unknown }
) {
  const studentId = await requireStudent(db, ctx);
  const subsectionId = input.subsectionId != null ? String(input.subsectionId) : "";
  const sectionId = input.sectionId != null ? String(input.sectionId) : "";

  let formulaIds: string[] = [];
  if (subsectionId) {
    formulaIds = FORMULA_CATALOG.filter((f) => f.subsectionId === subsectionId).map(
      (f) => f.id
    );
  } else if (sectionId) {
    formulaIds = FORMULA_CATALOG.filter((f) => f.sectionId === sectionId).map(
      (f) => f.id
    );
  } else {
    throw validationError("Укажите раздел для сброса");
  }

  if (formulaIds.length === 0) throw validationError("Раздел не найден");

  await db
    .delete(formulaTrainerProgress)
    .where(
      and(
        eq(formulaTrainerProgress.studentId, studentId),
        inArray(formulaTrainerProgress.formulaId, formulaIds)
      )
    );

  return getFormulaTrainerState(db, ctx);
}

export async function getCatalogPublic() {
  return {
    formulas: FORMULA_CATALOG.map((f) => ({
      id: f.id,
      sectionId: f.sectionId,
      subsectionId: f.subsectionId,
      sectionTitle: f.sectionTitle,
      subsectionTitle: f.subsectionTitle,
      title: f.title,
      expression: f.expression,
    })),
    subsections: listSubsections(),
  };
}

function sessionPool(
  selected: FormulaSubsectionId[],
  weakSpotsOnly: boolean,
  progress: Map<string, FormulaProgressRow>
) {
  if (selected.length === 0) {
    return { pool: [] as ReturnType<typeof formulasInSubsections>, reason: "Выберите хотя бы один раздел" };
  }
  let pool = formulasInSubsections(selected);
  if (weakSpotsOnly) {
    const weak = new Set(
      listWeakTopics([...progress.values()]).map((topic) => topic.subsectionId)
    );
    pool = pool.filter((formula) => weak.has(formula.subsectionId));
  }
  return { pool, reason: null as string | null };
}

export async function startFormulaTraining(
  db: AppDb,
  ctx: AuthContext,
  input: { questionCount?: unknown }
) {
  const studentId = await requireStudent(db, ctx);
  const existing = await findActiveSession(db, studentId);
  if (existing) {
    return { resumed: true as const, session: await toSessionPublic(db, existing) };
  }

  const requested = Number(input.questionCount);
  if (!TRAINER_QUESTION_COUNTS.includes(requested as (typeof TRAINER_QUESTION_COUNTS)[number])) {
    throw validationError("Выберите количество вопросов");
  }

  const settings = await ensureSettings(db, ctx, studentId);
  const selected = (settings.selectedSubsections ?? []) as FormulaSubsectionId[];
  const progressMap = await loadProgressMap(db, studentId);
  const { pool, reason } = sessionPool(
    selected,
    Boolean(settings.weakSpotsOnly),
    progressMap
  );
  if (reason) throw validationError(reason);
  const check = trainerSessionStartCheck(pool.length, requested);
  if (!check.ok) throw validationError(check.message);

  const drawn = drawUniformFormulas(pool, requested, createRng(Date.now() ^ studentId.length));
  const formulaIds = drawn.map((formula) => formula.id);
  const sessionId = newId("fts");

  try {
    await inTx(db, async (tx) => {
      const again = await findActiveSession(tx, studentId);
      if (again) throw new Error("ACTIVE_SESSION");
      await tx.insert(formulaTrainerSessions).values({
        id: sessionId,
        organizationId: ctx.organizationId,
        studentId,
        status: "active",
        mode: "choice",
        weakSpotsOnly: Boolean(settings.weakSpotsOnly),
        selectedSubsections: selected,
        questionCount: requested,
        formulaIds,
        currentIndex: 0,
      });
      for (let position = 0; position < drawn.length; position++) {
        const card = drawn[position]!;
        const built = buildChoiceOptions(card, pool, Date.now() + position * 17);
        if (!built) {
          throw validationError("Вопрос временно недоступен: не удалось собрать варианты");
        }
        await tx.insert(formulaTrainerQuestions).values({
          id: newId("ftq"),
          organizationId: ctx.organizationId,
          studentId,
          formulaId: card.id,
          kind: "choice",
          options: built.options,
          correctOptionId: built.correctOptionId,
          source: "trainer",
          sessionId,
          position,
        });
      }
    });
  } catch (err) {
    const active = await findActiveSession(db, studentId);
    if (active && (isUniqueViolation(err) || (err instanceof Error && err.message === "ACTIVE_SESSION"))) {
      return { resumed: true as const, session: await toSessionPublic(db, active) };
    }
    throw err;
  }

  const [created] = await db
    .select()
    .from(formulaTrainerSessions)
    .where(eq(formulaTrainerSessions.id, sessionId))
    .limit(1);
  if (!created || created.studentId !== studentId) {
    throw notFound("Тренировка не найдена");
  }
  return { resumed: false as const, session: await toSessionPublic(db, created) };
}

export async function getCurrentTrainerQuestion(db: AppDb, ctx: AuthContext) {
  const studentId = await requireStudent(db, ctx);
  const active = await findActiveSession(db, studentId);
  if (!active) {
    return { ok: false as const, reason: "Нет незавершённой тренировки" };
  }
  const session = await toSessionPublic(db, active);
  if (!session.question) {
    return { ok: false as const, reason: "В тренировке не осталось вопросов", session };
  }
  return { ok: true as const, session };
}
