import { and, asc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import {
  auditLog,
  studentTariffAssignments,
  tariffLessonLedger,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  findDebitAssignment,
  getAssignmentBalance,
} from "@/server/services/lesson-balance";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/** Новый оплаченный пакет становится текущим только если старого нет или он уже в долгу (−1). */
export function shouldActivatePaidAssignment(
  currentRemaining: number | null | undefined,
  hasCurrent: boolean
): boolean {
  if (!hasCurrent) return true;
  if (currentRemaining == null) return false;
  return currentRemaining < 0;
}

export async function settleDebtOnNewAssignment(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  newAssignmentId: string
) {
  const previous = await db
    .select()
    .from(studentTariffAssignments)
    .where(
      and(
        eq(studentTariffAssignments.organizationId, ctx.organizationId),
        eq(studentTariffAssignments.studentId, studentId),
        eq(studentTariffAssignments.paymentStatus, "paid")
      )
    )
    .orderBy(sql`${studentTariffAssignments.startsAt} desc`);
  const prior = previous.find((row) => row.id !== newAssignmentId);
  if (!prior) return { settled: false, previousRemaining: null as number | null };

  const prevBalance = await getAssignmentBalance(
    db,
    prior.id,
    prior.lessonsLimitSnapshot
  );
  if (prevBalance.remaining == null || prevBalance.remaining >= 0) {
    return { settled: false, previousRemaining: prevBalance.remaining };
  }

  const [already] = await db
    .select({ id: tariffLessonLedger.id })
    .from(tariffLessonLedger)
    .where(
      and(
        eq(tariffLessonLedger.assignmentId, newAssignmentId),
        eq(tariffLessonLedger.reason, "debt_settlement")
      )
    )
    .limit(1);
  if (already) {
    return { settled: false, previousRemaining: prevBalance.remaining };
  }

  await db.insert(tariffLessonLedger).values({
    id: newId("led"),
    organizationId: ctx.organizationId,
    assignmentId: newAssignmentId,
    lessonId: null,
    studentId,
    delta: -1,
    reason: "debt_settlement",
    actorUserId: ctx.userId,
  });
  return { settled: true, previousRemaining: prevBalance.remaining };
}

export async function activateQueuedIfNeeded(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
): Promise<{ activated: boolean; assignmentId: string | null }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from students where id = ${studentId} and organization_id = ${ctx.organizationId} for update`
    );
    const current = await findDebitAssignment(
      tx as unknown as AppDb,
      ctx.organizationId,
      studentId
    );
    if (current) {
      const bal = await getAssignmentBalance(
        tx as unknown as AppDb,
        current.id,
        current.lessonsLimitSnapshot
      );
      if (!shouldActivatePaidAssignment(bal.remaining, true)) {
        return { activated: false, assignmentId: null };
      }
    }

    const [queued] = await tx
      .select()
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.organizationId, ctx.organizationId),
          eq(studentTariffAssignments.studentId, studentId),
          eq(studentTariffAssignments.status, "queued"),
          eq(studentTariffAssignments.paymentStatus, "paid")
        )
      )
      .orderBy(asc(studentTariffAssignments.createdAt))
      .limit(1);
    if (!queued) return { activated: false, assignmentId: null };

    const now = new Date();
    if (current) {
      await tx
        .update(studentTariffAssignments)
        .set({ status: "expired", updatedAt: now })
        .where(eq(studentTariffAssignments.id, current.id));
    }
    await tx
      .update(studentTariffAssignments)
      .set({ status: "active", paymentStatus: "paid", updatedAt: now })
      .where(eq(studentTariffAssignments.id, queued.id));

    const settled = await settleDebtOnNewAssignment(
      tx as unknown as AppDb,
      ctx,
      studentId,
      queued.id
    );

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "tariff_queue_activated",
      entityType: "student_tariff_assignment",
      entityId: queued.id,
      payload: {
        studentId,
        previousAssignmentId: current?.id ?? null,
        debtSettled: settled.settled,
        previousRemaining: settled.previousRemaining,
      },
    });

    return { activated: true, assignmentId: queued.id };
  });
}
