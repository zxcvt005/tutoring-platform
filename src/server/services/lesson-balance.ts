import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AttendanceStatus, StudentPackageStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import {
  lessonScheduleExceptions,
  studentTariffAssignments,
  tariffLessonDebitState,
  tariffLessonLedger,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function attendanceDebitsLesson(status: AttendanceStatus): boolean {
  return status === "present" || status === "absent_unexcused";
}

export type AssignmentBalance = {
  used: number;
  remaining: number | null;
  limit: number | null;
};

export function derivePackageStatus(input: {
  status: string;
  paymentStatus: string;
  remaining: number | null;
}): StudentPackageStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "paused") return "paused";
  if (input.paymentStatus !== "paid" || input.status === "pending_payment") {
    return "unpaid";
  }
  if (input.remaining != null && input.remaining <= 0) return "exhausted";
  return "active";
}

export async function sumLedgerDelta(
  db: AppDb,
  assignmentId: string
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${tariffLessonLedger.delta}), 0)`,
    })
    .from(tariffLessonLedger)
    .where(eq(tariffLessonLedger.assignmentId, assignmentId));
  return Number(row?.total ?? 0);
}

export function balanceFromDelta(
  delta: number,
  lessonsLimitSnapshot: number | null | undefined
): AssignmentBalance {
  const used = Math.max(0, -delta);
  const limit =
    lessonsLimitSnapshot == null ? null : Number(lessonsLimitSnapshot);
  const remaining = limit == null ? null : limit + delta;
  return { used, remaining, limit };
}

export async function getAssignmentBalance(
  db: AppDb,
  assignmentId: string,
  lessonsLimitSnapshot: number | null | undefined
): Promise<AssignmentBalance> {
  const delta = await sumLedgerDelta(db, assignmentId);
  return balanceFromDelta(delta, lessonsLimitSnapshot);
}

export async function getLedgerDeltaByAssignmentIds(
  db: AppDb,
  assignmentIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (assignmentIds.length === 0) return map;
  const rows = await db
    .select({
      assignmentId: tariffLessonLedger.assignmentId,
      total: sql<number>`coalesce(sum(${tariffLessonLedger.delta}), 0)`,
    })
    .from(tariffLessonLedger)
    .where(inArray(tariffLessonLedger.assignmentId, assignmentIds))
    .groupBy(tariffLessonLedger.assignmentId);
  for (const r of rows) map.set(r.assignmentId, Number(r.total ?? 0));
  return map;
}

export async function findDebitAssignment(
  db: AppDb,
  organizationId: string,
  studentId: string
) {
  const [row] = await db
    .select()
    .from(studentTariffAssignments)
    .where(
      and(
        eq(studentTariffAssignments.organizationId, organizationId),
        eq(studentTariffAssignments.studentId, studentId),
        eq(studentTariffAssignments.status, "active"),
        eq(studentTariffAssignments.paymentStatus, "paid")
      )
    )
    .orderBy(sql`${studentTariffAssignments.startsAt} desc`)
    .limit(1);
  return row ?? null;
}

/**
 * Применяет правило списания к журналу. Идемпотентно при том же статусе.
 * Сторно — отдельная строка журнала, история не удаляется.
 */
export async function applyAttendanceBalance(
  db: AppDb,
  ctx: AuthContext,
  input: {
    lessonId: string;
    studentId: string;
    attendanceStatus: AttendanceStatus;
    lessonCancelled: boolean;
  }
): Promise<AssignmentBalance | null> {
  if (input.lessonCancelled) {
    await reverseLessonDebits(db, ctx, input.lessonId);
    const assignment = await findDebitAssignment(
      db,
      ctx.organizationId,
      input.studentId
    );
    if (!assignment) return null;
    return getAssignmentBalance(
      db,
      assignment.id,
      assignment.lessonsLimitSnapshot
    );
  }

  const shouldDebit = attendanceDebitsLesson(input.attendanceStatus);
  const assignment = await findDebitAssignment(
    db,
    ctx.organizationId,
    input.studentId
  );
  if (!assignment) return null;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from student_tariff_assignments where id = ${assignment.id} for update`
    );

    const [state] = await tx
      .select()
      .from(tariffLessonDebitState)
      .where(
        and(
          eq(tariffLessonDebitState.lessonId, input.lessonId),
          eq(tariffLessonDebitState.studentId, input.studentId)
        )
      )
      .limit(1);

    if (shouldDebit && state) return;
    if (!shouldDebit && !state) return;

    if (shouldDebit && !state) {
      const ledgerId = newId("led");
      const reason =
        input.attendanceStatus === "present"
          ? ("present" as const)
          : ("absent_unexcused" as const);
      await tx.insert(tariffLessonLedger).values({
        id: ledgerId,
        organizationId: ctx.organizationId,
        assignmentId: assignment.id,
        lessonId: input.lessonId,
        studentId: input.studentId,
        delta: -1,
        reason,
        attendanceStatus: input.attendanceStatus,
        actorUserId: ctx.userId,
      });
      await tx.insert(tariffLessonDebitState).values({
        lessonId: input.lessonId,
        studentId: input.studentId,
        assignmentId: assignment.id,
        ledgerEntryId: ledgerId,
        updatedAt: new Date(),
      });
      return;
    }

    if (!shouldDebit && state) {
      const reversalId = newId("led");
      await tx.insert(tariffLessonLedger).values({
        id: reversalId,
        organizationId: ctx.organizationId,
        assignmentId: state.assignmentId,
        lessonId: input.lessonId,
        studentId: input.studentId,
        delta: 1,
        reason: "reversal",
        attendanceStatus: input.attendanceStatus,
        supersedesId: state.ledgerEntryId,
        actorUserId: ctx.userId,
      });
      await tx
        .delete(tariffLessonDebitState)
        .where(
          and(
            eq(tariffLessonDebitState.lessonId, input.lessonId),
            eq(tariffLessonDebitState.studentId, input.studentId)
          )
        );
    }
  });

  return getAssignmentBalance(
    db,
    assignment.id,
    assignment.lessonsLimitSnapshot
  );
}

export async function reverseLessonDebits(
  db: AppDb,
  ctx: AuthContext,
  lessonId: string
) {
  const states = await db
    .select()
    .from(tariffLessonDebitState)
    .where(eq(tariffLessonDebitState.lessonId, lessonId));
  if (states.length === 0) return;

  await db.transaction(async (tx) => {
    for (const state of states) {
      await tx.execute(
        sql`select id from student_tariff_assignments where id = ${state.assignmentId} for update`
      );
      const reversalId = newId("led");
      await tx.insert(tariffLessonLedger).values({
        id: reversalId,
        organizationId: ctx.organizationId,
        assignmentId: state.assignmentId,
        lessonId,
        studentId: state.studentId,
        delta: 1,
        reason: "reversal",
        attendanceStatus: null,
        supersedesId: state.ledgerEntryId,
        actorUserId: ctx.userId,
      });
      await tx
        .delete(tariffLessonDebitState)
        .where(
          and(
            eq(tariffLessonDebitState.lessonId, lessonId),
            eq(tariffLessonDebitState.studentId, state.studentId)
          )
        );
    }
  });
}

export async function recordScheduleException(
  db: AppDb,
  input: {
    scheduleId: string;
    occurrenceKey: string;
    reason: "deleted" | "moved" | "cancelled";
    lessonId?: string | null;
  }
) {
  await db
    .insert(lessonScheduleExceptions)
    .values({
      scheduleId: input.scheduleId,
      occurrenceKey: input.occurrenceKey,
      reason: input.reason,
      lessonId: input.lessonId ?? null,
    })
    .onConflictDoNothing();
}
