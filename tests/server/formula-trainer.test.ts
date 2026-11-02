import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { getFormula } from "@/lib/formula-trainer/catalog";
import { resolveAuthContext } from "@/server/authz/context";
import {
  formulaTrainerProgress,
  formulaTrainerQuestions,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getOrCreateQuickQuestion,
  nextTrainerQuestion,
  resetSectionProgress,
  submitFormulaAnswer,
  updateFormulaTrainerSettings,
} from "@/server/services/formula-trainer-service";
import { grantFormulaTrainerOnTariff } from "../helpers/products";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("formula trainer service", () => {
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
    if (email === "s1@demo.local") {
      await grantFormulaTrainerOnTariff(db, ctx.organizationId, "tariff_standard");
    }
    return ctx;
  }

  it("quick question is choice-only and answer is idempotent", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");

    const q1 = await getOrCreateQuickQuestion(t.db, student);
    expect(q1.question).not.toBeNull();
    expect(q1.question!.kind).toBe("choice");
    expect(q1.question!.options).toHaveLength(4);

    const q2 = await getOrCreateQuickQuestion(t.db, student);
    expect(q2.question!.questionId).toBe(q1.question!.questionId);

    const optionId = q1.question!.options![0]!.id;
    const first = await submitFormulaAnswer(t.db, student, {
      questionId: q1.question!.questionId,
      selectedOptionId: optionId,
    });
    const second = await submitFormulaAnswer(t.db, student, {
      questionId: q1.question!.questionId,
      selectedOptionId: optionId,
    });
    expect(second.feedback.progress.attempts).toBe(
      first.feedback.progress.attempts
    );

    const rows = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(
        and(
          eq(formulaTrainerProgress.studentId, student.studentId!),
          eq(formulaTrainerProgress.formulaId, q1.question!.formulaId)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toBe(1);
  });

  it("student cannot answer another student's question", async () => {
    const t = await createTestDb();
    close = t.close;
    const s1 = await asStudent(t.db, "s1@demo.local");
    const s2 = await asStudent(t.db, "s2@demo.local");
    const q = await getOrCreateQuickQuestion(t.db, s1);
    await expect(
      submitFormulaAnswer(t.db, s2, {
        questionId: q.question!.questionId,
        selectedOptionId: q.question!.options![0]!.id,
      })
    ).rejects.toThrow();
  });

  it("reset section clears only that subsection progress", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    await updateFormulaTrainerSettings(t.db, student, {
      selectedSubsectionIds: ["kinematics", "dynamics"],
      mode: "choice",
    });

    const next = await nextTrainerQuestion(t.db, student);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const opt = next.question.options![0]!;
    await submitFormulaAnswer(t.db, student, {
      questionId: next.question.questionId,
      selectedOptionId: opt.id,
    });

    const before = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(eq(formulaTrainerProgress.studentId, student.studentId!));
    expect(before.length).toBeGreaterThan(0);

    const formulaId = next.question.formulaId;
    const [qrow] = await t.db
      .select()
      .from(formulaTrainerQuestions)
      .where(eq(formulaTrainerQuestions.id, next.question.questionId));
    expect(qrow).toBeTruthy();

    // reset kinematics only
    await resetSectionProgress(t.db, student, {
      subsectionId: "kinematics",
    });
    const after = await t.db
      .select()
      .from(formulaTrainerProgress)
      .where(eq(formulaTrainerProgress.studentId, student.studentId!));

    const stillHas = after.some((r) => r.formulaId === formulaId);
    // if answered formula was kinematics — gone; if dynamics — remains
    if (formulaId.startsWith("mech_kin")) {
      expect(stillHas).toBe(false);
    }
  });

  it("selectedGroupId keeps questions inside the large section", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asStudent(t.db, "s1@demo.local");
    await updateFormulaTrainerSettings(t.db, student, {
      selectedGroupId: "optics_quantum",
    });
    for (let i = 0; i < 3; i++) {
      const next = await nextTrainerQuestion(t.db, student);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const card = getFormula(next.question.formulaId);
      expect(["optics", "quantum"]).toContain(card?.sectionId);
      expect(next.question.kind).toBe("choice");
      expect(next.question.options).toHaveLength(4);
    }
  });
});
