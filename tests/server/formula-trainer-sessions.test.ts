import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  formulaTrainerProgress,
  formulaTrainerQuestions,
  formulaTrainerSessions,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getFormulaTrainerState,
  startFormulaTraining,
  submitFormulaAnswer,
  updateFormulaTrainerSettings,
} from "@/server/services/formula-trainer-service";
import { grantFormulaTrainerOnTariff } from "../helpers/products";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("formula trainer sessions", () => {
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
    const ctx = await resolveAuthContext(db, session.rawToken);
    await grantFormulaTrainerOnTariff(db, ctx.organizationId, "tariff_standard");
    return ctx;
  }

  it("saves one session, resumes it, and does not score an answer twice", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    const other = await asStudent(t.db, "s2@demo.local");
    await updateFormulaTrainerSettings(t.db, student, {
      selectedSubsectionIds: ["dynamics"],
      weakSpotsOnly: false,
    });

    const started = await startFormulaTraining(t.db, student, { questionCount: 5 });
    expect(started.resumed).toBe(false);
    expect(started.session.questionCount).toBe(5);
    expect(started.session.index).toBe(1);
    expect(started.session.answered).toBe(0);
    expect(started.session.question).not.toBeNull();

    const again = await startFormulaTraining(t.db, student, { questionCount: 10 });
    expect(again.resumed).toBe(true);
    expect(again.session.id).toBe(started.session.id);

    const active = await t.db
      .select()
      .from(formulaTrainerSessions)
      .where(
        and(
          eq(formulaTrainerSessions.studentId, student.studentId!),
          eq(formulaTrainerSessions.status, "active")
        )
      );
    expect(active).toHaveLength(1);
    expect(active[0]!.formulaIds).toHaveLength(5);

    const firstId = started.session.question!.questionId;
    const [firstRow] = await t.db
      .select()
      .from(formulaTrainerQuestions)
      .where(eq(formulaTrainerQuestions.id, firstId));
    expect(firstRow!.studentId).toBe(student.studentId);
    expect(firstRow!.position).toBe(0);

    const answer = await submitFormulaAnswer(t.db, student, {
      questionId: firstId,
      selectedOptionId: firstRow!.correctOptionId,
    });
    expect(answer.feedback.correct).toBe(true);
    expect(answer.feedback.progress.attempts).toBe(1);
    expect(answer.feedback.progress.streak).toBe(1);
    expect(answer.feedback.progress.status).not.toBe("mastered");

    const repeat = await submitFormulaAnswer(t.db, student, {
      questionId: firstId,
      selectedOptionId: firstRow!.correctOptionId,
    });
    expect(repeat.feedback.progress.attempts).toBe(1);

    const progressRows = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(eq(formulaTrainerProgress.studentId, student.studentId!));
    expect(progressRows).toHaveLength(1);
    expect(progressRows[0]!.attempts).toBe(1);
    expect(progressRows[0]!.correctCount).toBe(1);
    expect(progressRows[0]!.wrongCount).toBe(0);

    const restored = await getFormulaTrainerState(t.db, student);
    expect(restored.activeSession?.id).toBe(started.session.id);
    expect(restored.activeSession?.index).toBe(2);
    expect(restored.activeSession?.answered).toBe(1);
    expect(restored.activeSession?.correct).toBe(1);
    expect(restored.activeSession?.question?.questionId).not.toBe(firstId);

    await expect(
      submitFormulaAnswer(t.db, other, {
        questionId: firstId,
        selectedOptionId: firstRow!.correctOptionId,
      })
    ).rejects.toThrow();
    await expect(
      submitFormulaAnswer(t.db, other, {
        questionId: restored.activeSession!.question!.questionId,
        selectedOptionId: "opt",
      })
    ).rejects.toThrow();

    let current = restored.activeSession!.question!.questionId;
    for (let step = 0; step < 4; step++) {
      const [row] = await t.db
        .select()
        .from(formulaTrainerQuestions)
        .where(eq(formulaTrainerQuestions.id, current));
      await submitFormulaAnswer(t.db, student, {
        questionId: current,
        selectedOptionId: row!.correctOptionId,
      });
      const state = await getFormulaTrainerState(t.db, student);
      current = state.activeSession?.question?.questionId ?? "";
    }

    const done = await getFormulaTrainerState(t.db, student);
    expect(done.activeSession).toBeNull();
    const [finished] = await t.db
      .select()
      .from(formulaTrainerSessions)
      .where(eq(formulaTrainerSessions.id, started.session.id));
    expect(finished!.status).toBe("completed");
    expect(finished!.completedAt).not.toBeNull();
    expect(finished!.currentIndex).toBe(5);

    const fresh = await startFormulaTraining(t.db, student, { questionCount: 5 });
    expect(fresh.resumed).toBe(false);
    expect(fresh.session.id).not.toBe(started.session.id);
  });
});
