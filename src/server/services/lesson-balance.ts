import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { canDebitFromRemaining } from "@/lib/tariff-warnings";
import type { AttendanceStatus, StudentDirectionBalance } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { badRequest } from "@/server/errors";
import {
  lessonDebitState,
  lessonScheduleExceptions,
  lessons,
  studentLessonLedger,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export { canDebitFromRemaining };

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function attendanceDebitsLesson(status: AttendanceStatus): boolean {
  return status === "present" || status === "absent_unexcused";
}

export type DirectionBalance = {
  remaining: number;
};

export async function sumDirectionLedgerDelta(
  db: AppDb,
  organizationId: string,
  studentId: string,
  directionId: string
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${studentLessonLedger.delta}), 0)`,
    })
    .from(studentLessonLedger)
    .where(
      and(
        eq(studentLessonLedger.organizationId, organizationId),
        eq(studentLessonLedger.studentId, studentId),
        eq(studentLessonLedger.directionId, directionId)
      )
    );
  return Number(row?.total ?? 0);
}

export async function getDirectionBalance(
  db: AppDb,
  organizationId: string,
  studentId: string,
  directionId: string
): Promise<DirectionBalance> {
  const remaining = await sumDirectionLedgerDelta(
    db,
    organizationId,
    studentId,
    directionId
  );
  return { remaining };
}

export async function getBalancesByStudent(
  db: AppDb,
  organizationId: string,
  studentId: string
): Promise<StudentDirectionBalance[]> {
  const rows = await db
    .select({
      directionId: studentLessonLedger.directionId,
      balance: sql<number>`coalesce(sum(${studentLessonLedger.delta}), 0)`,
    })
    .from(studentLessonLedger)
    .where(
      and(
        eq(studentLessonLedger.organizationId, organizationId),
        eq(studentLessonLedger.studentId, studentId)
      )
    )
    .groupBy(studentLessonLedger.directionId);

  return rows.map((r) => ({
    directionId: r.directionId,
    balance: Number(r.balance ?? 0),
  }));
}

async function loadLessonDirection(
  db: AppDb,
  organizationId: string,
  lessonId: string
) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      directionId: lessons.directionId,
      organizationId: lessons.organizationId,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== organizationId) return null;
  return lesson;
}

/**
 * Применяет правило списания к журналу по направлению занятия. Идемпотентно при том же статусе.
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
): Promise<DirectionBalance | null> {
  const lesson = await loadLessonDirection(
    db,
    ctx.organizationId,
    input.lessonId
  );
  if (!lesson) return null;

  if (input.lessonCancelled) {
    await reverseLessonDebits(db, ctx, input.lessonId);
    if (!lesson.directionId) return null;
    return getDirectionBalance(
      db,
      ctx.organizationId,
      input.studentId,
      lesson.directionId
    );
  }

  if (!lesson.directionId) {
    throw badRequest(
      "Нельзя списать занятие: у урока не указано направление обучения"
    );
  }

  const directionId = lesson.directionId;
  const shouldDebit = attendanceDebitsLesson(input.attendanceStatus);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from students where id = ${input.studentId} and organization_id = ${ctx.organizationId} for update`
    );

    const [state] = await tx
      .select()
      .from(lessonDebitState)
      .where(
        and(
          eq(lessonDebitState.lessonId, input.lessonId),
          eq(lessonDebitState.studentId, input.studentId)
        )
      )
      .limit(1);

    if (shouldDebit && state) return;
    if (!shouldDebit && !state) return;

    if (shouldDebit && !state) {
      const txDb = tx as unknown as AppDb;
      const current = await getDirectionBalance(
        txDb,
        ctx.organizationId,
        input.studentId,
        directionId
      );
      if (!canDebitFromRemaining(current.remaining)) {
        throw badRequest(
          "Нельзя списать занятие: занятие в долг уже использовано. Сначала продлите пакет."
        );
      }
      const ledgerId = newId("led");
      const reason =
        input.attendanceStatus === "present"
          ? ("present" as const)
          : ("absent_unexcused" as const);
      await tx.insert(studentLessonLedger).values({
        id: ledgerId,
        organizationId: ctx.organizationId,
        studentId: input.studentId,
        directionId,
        lessonId: input.lessonId,
        delta: -1,
        reason,
        actorUserId: ctx.userId,
      });
      await tx.insert(lessonDebitState).values({
        lessonId: input.lessonId,
        studentId: input.studentId,
        directionId,
        ledgerEntryId: ledgerId,
        updatedAt: new Date(),
      });
      return;
    }

    if (!shouldDebit && state) {
      const reversalId = newId("led");
      await tx.insert(studentLessonLedger).values({
        id: reversalId,
        organizationId: ctx.organizationId,
        studentId: input.studentId,
        directionId: state.directionId,
        lessonId: input.lessonId,
        delta: 1,
        reason: "reversal",
        supersedesId: state.ledgerEntryId,
        actorUserId: ctx.userId,
      });
      await tx
        .delete(lessonDebitState)
        .where(
          and(
            eq(lessonDebitState.lessonId, input.lessonId),
            eq(lessonDebitState.studentId, input.studentId)
          )
        );
    }
  });

  return getDirectionBalance(
    db,
    ctx.organizationId,
    input.studentId,
    directionId
  );
}

export async function reverseLessonDebits(
  db: AppDb,
  ctx: AuthContext,
  lessonId: string
) {
  const states = await db
    .select()
    .from(lessonDebitState)
    .where(eq(lessonDebitState.lessonId, lessonId));
  if (states.length === 0) return;

  await db.transaction(async (tx) => {
    for (const state of states) {
      await tx.execute(
        sql`select id from students where id = ${state.studentId} and organization_id = ${ctx.organizationId} for update`
      );
      const reversalId = newId("led");
      await tx.insert(studentLessonLedger).values({
        id: reversalId,
        organizationId: ctx.organizationId,
        studentId: state.studentId,
        directionId: state.directionId,
        lessonId,
        delta: 1,
        reason: "reversal",
        supersedesId: state.ledgerEntryId,
        actorUserId: ctx.userId,
      });
      await tx
        .delete(lessonDebitState)
        .where(
          and(
            eq(lessonDebitState.lessonId, lessonId),
            eq(lessonDebitState.studentId, state.studentId)
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

/** Суммарный остаток по нескольким направлениям (для батч-загрузки). */
export async function getDirectionBalancesMap(
  db: AppDb,
  organizationId: string,
  studentId: string,
  directionIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (directionIds.length === 0) return map;
  const rows = await db
    .select({
      directionId: studentLessonLedger.directionId,
      total: sql<number>`coalesce(sum(${studentLessonLedger.delta}), 0)`,
    })
    .from(studentLessonLedger)
    .where(
      and(
        eq(studentLessonLedger.organizationId, organizationId),
        eq(studentLessonLedger.studentId, studentId),
        inArray(studentLessonLedger.directionId, directionIds)
      )
    )
    .groupBy(studentLessonLedger.directionId);
  for (const r of rows) map.set(r.directionId, Number(r.total ?? 0));
  for (const id of directionIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}