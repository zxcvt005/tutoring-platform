import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { addAppDateKey, fromAppDateTime, parseAppInstant } from "@/lib/app-time";
import {
  amountForPresentCount,
  attendanceCountsAsMarked,
  isPresentAttendance,
  payrollBlockedMessage,
  ratesAreComplete,
  snapshotRates,
  type PayrollBlockedReason,
  type SlotPayRates,
} from "@/lib/teacher-payroll";
import {
  MAX_SLOT_STUDENTS,
  SLOT_PAY_PRESENT_COUNTS,
  SLOT_STUDENT_LIMIT_ERROR,
  countStudentsInTeacherSlot,
  teacherSlotKey,
  teacherSlotLockKey,
  type SlotLessonLike,
  type SlotPayPresentCount,
} from "@/lib/teacher-slot";
import type { AttendanceStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  attendances,
  auditLog,
  lessonStudents,
  lessons,
  teacherPayRates,
  teacherPayrollEntries,
  teacherPayrollSlots,
  teachers,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, notFound, validationError } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  return code === "23505" || /unique|duplicate key/i.test(message);
}

function formatSlotLabel(slotDate: string, slotStartTime: string): string {
  const [y, m, d] = slotDate.split("-");
  return `${d}.${m}.${y}, ${slotStartTime}`;
}

export async function loadTeacherPayRates(
  db: AppDb,
  teacherId: string
): Promise<SlotPayRates> {
  const rows = await db
    .select()
    .from(teacherPayRates)
    .where(eq(teacherPayRates.teacherId, teacherId));
  const rates: SlotPayRates = {};
  for (const row of rows) {
    if (row.presentCount >= 1 && row.presentCount <= 5) {
      rates[row.presentCount as SlotPayPresentCount] = row.amountKopecks;
    }
  }
  return rates;
}

export async function getTeacherPayRates(
  db: AppDb,
  ctx: AuthContext,
  teacherId: string
) {
  requireRoles(ctx, ["director"]);
  const [teacher] = await db
    .select({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .where(
      and(
        eq(teachers.id, teacherId),
        eq(teachers.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!teacher) throw notFound("Преподаватель не найден");
  const rates = await loadTeacherPayRates(db, teacherId);
  return {
    teacherId,
    fullName: teacher.fullName,
    rates,
    complete: ratesAreComplete(rates),
  };
}

export async function setTeacherPayRates(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId: string; rates: SlotPayRates }
) {
  requireRoles(ctx, ["director"]);
  const [teacher] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(
      and(
        eq(teachers.id, input.teacherId),
        eq(teachers.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!teacher) throw notFound("Преподаватель не найден");

  const rows: {
    teacherId: string;
    presentCount: number;
    amountKopecks: number;
    updatedByUserId: string;
    updatedAt: Date;
  }[] = [];
  for (const count of SLOT_PAY_PRESENT_COUNTS) {
    const amount = input.rates[count];
    if (amount == null) continue;
    if (!Number.isInteger(amount) || amount < 0) {
      throw validationError(`Ставка для ${count} учеников должна быть целым числом копеек ≥ 0`);
    }
    rows.push({
      teacherId: input.teacherId,
      presentCount: count,
      amountKopecks: amount,
      updatedByUserId: ctx.userId,
      updatedAt: new Date(),
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(teacherPayRates)
      .where(eq(teacherPayRates.teacherId, input.teacherId));
    if (rows.length > 0) {
      await tx.insert(teacherPayRates).values(rows);
    }
    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "teacher_pay_rates_set",
      entityType: "teacher",
      entityId: input.teacherId,
      payload: { rates: snapshotRates(input.rates) },
    });
  });

  return getTeacherPayRates(db, ctx, input.teacherId);
}

type SlotMember = SlotLessonLike & {
  startsAtDate: Date;
};

async function loadSlotMembers(
  db: AppDb,
  organizationId: string,
  key: { teacherId: string; slotDate: string; slotStartTime: string }
): Promise<SlotMember[]> {
  const dayStart = fromAppDateTime(key.slotDate, "00:00");
  const nextDay = fromAppDateTime(addAppDateKey(key.slotDate, 1), "00:00");
  // Пробные уроки живут в trial_lessons и намеренно не читаются:
  // они не создают слот, начисление, корректировку и выплату.
  const rows = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.organizationId, organizationId),
        eq(lessons.teacherId, key.teacherId),
        gte(lessons.startsAt, dayStart),
        lt(lessons.startsAt, nextDay)
      )
    );
  const inSlot = rows.filter((row) => {
    const k = teacherSlotKey(row.teacherId, row.startsAt);
    return k.slotStartTime === key.slotStartTime;
  });
  if (inSlot.length === 0) return [];
  const ids = inSlot.map((r) => r.id);
  const links = await db
    .select()
    .from(lessonStudents)
    .where(inArray(lessonStudents.lessonId, ids));
  const map = new Map<string, string[]>();
  for (const link of links) {
    const arr = map.get(link.lessonId) ?? [];
    arr.push(link.studentId);
    map.set(link.lessonId, arr);
  }
  return inSlot.map((row) => ({
    id: row.id,
    teacherId: row.teacherId,
    startsAt: row.startsAt.toISOString(),
    startsAtDate: row.startsAt,
    status: row.status as SlotLessonLike["status"],
    studentIds: map.get(row.id) ?? [],
  }));
}

async function loadOrgLessonsForSlotCheck(
  db: AppDb,
  organizationId: string
): Promise<SlotLessonLike[]> {
  const rows = await db
    .select({
      id: lessons.id,
      teacherId: lessons.teacherId,
      startsAt: lessons.startsAt,
      status: lessons.status,
    })
    .from(lessons)
    .where(eq(lessons.organizationId, organizationId));
  const ids = rows.map((r) => r.id);
  const links =
    ids.length > 0
      ? await db
          .select()
          .from(lessonStudents)
          .where(inArray(lessonStudents.lessonId, ids))
      : [];
  const map = new Map<string, string[]>();
  for (const link of links) {
    const arr = map.get(link.lessonId) ?? [];
    arr.push(link.studentId);
    map.set(link.lessonId, arr);
  }
  return rows.map((row) => ({
    id: row.id,
    teacherId: row.teacherId,
    startsAt: row.startsAt.toISOString(),
    status: row.status as SlotLessonLike["status"],
    studentIds: map.get(row.id) ?? [],
  }));
}

export async function assertTeacherSlotStudentLimit(
  db: AppDb,
  organizationId: string,
  input: {
    teacherId: string;
    startsAt: string;
    studentIds: string[];
    excludeLessonId?: string;
  }
) {
  const lessonsDomain = await loadOrgLessonsForSlotCheck(db, organizationId);
  const key = teacherSlotKey(input.teacherId, input.startsAt);
  const current = countStudentsInTeacherSlot(
    lessonsDomain,
    key,
    input.excludeLessonId
  );
  if (current + input.studentIds.length > MAX_SLOT_STUDENTS) {
    throw badRequest(SLOT_STUDENT_LIMIT_ERROR);
  }
}

export type SettlePayrollResult = {
  status:
    | "pending"
    | "cancelled"
    | "accrued"
    | "adjusted"
    | "unchanged"
    | "blocked";
  presentCount?: number;
  amountKopecks?: number;
  blockedReason?: PayrollBlockedReason;
  blockedMessage?: string;
  slotId?: string;
};

async function loadAttendanceMap(
  db: AppDb,
  lessonIds: string[]
): Promise<Map<string, AttendanceStatus>> {
  const map = new Map<string, AttendanceStatus>();
  if (lessonIds.length === 0) return map;
  const rows = await db
    .select()
    .from(attendances)
    .where(inArray(attendances.lessonId, lessonIds));
  for (const row of rows) {
    map.set(`${row.lessonId}:${row.studentId}`, row.status as AttendanceStatus);
  }
  return map;
}

export async function settleTeacherSlotPayroll(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId: string; startsAt: string | Date }
): Promise<SettlePayrollResult> {
  const key = teacherSlotKey(input.teacherId, input.startsAt);
  const lockKey = teacherSlotLockKey(ctx.organizationId, key);

  return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const members = await loadSlotMembers(tx as unknown as AppDb, ctx.organizationId, key);
      if (members.length === 0) {
        return { status: "pending" as const };
      }

      const canonical = [...members].sort(
        (a, b) => a.startsAtDate.getTime() - b.startsAtDate.getTime() || a.id.localeCompare(b.id)
      )[0]!;
      const lessonIds = members.map((m) => m.id).sort();
      const active = members.filter((m) => m.status !== "cancelled");

      const [existingSlot] = await tx
        .select()
        .from(teacherPayrollSlots)
        .where(
          and(
            eq(teacherPayrollSlots.teacherId, key.teacherId),
            eq(teacherPayrollSlots.slotDate, key.slotDate),
            eq(teacherPayrollSlots.slotStartTime, key.slotStartTime)
          )
        )
        .limit(1);

      if (active.length === 0) {
        if (!existingSlot) {
          return { status: "cancelled" as const };
        }
        await tx.execute(
          sql`select id from teacher_payroll_slots where id = ${existingSlot.id} for update`
        );
        return finalizeSlotAmount(tx as unknown as AppDb, ctx, {
          slotId: existingSlot.id,
          teacherId: key.teacherId,
          slotDate: key.slotDate,
          slotStartTime: key.slotStartTime,
          slotStartsAt: canonical.startsAtDate,
          canonicalLessonId: canonical.id,
          lessonIds,
          presentCount: 0,
          fullyCancelled: true,
        });
      }

      const att = await loadAttendanceMap(
        tx as unknown as AppDb,
        active.map((m) => m.id)
      );
      let presentCount = 0;
      let unmarked = false;
      for (const lesson of active) {
        for (const studentId of lesson.studentIds) {
          const status = att.get(`${lesson.id}:${studentId}`);
          if (!attendanceCountsAsMarked(status)) {
            unmarked = true;
          } else if (isPresentAttendance(status)) {
            presentCount += 1;
          }
        }
      }
      if (unmarked) {
        if (existingSlot?.attendanceClosed) {
          await tx.execute(
            sql`select id from teacher_payroll_slots where id = ${existingSlot.id} for update`
          );
          return reopenIncompletePayrollSlot(tx as unknown as AppDb, ctx, {
            slotId: existingSlot.id,
            teacherId: key.teacherId,
            slotDate: key.slotDate,
            slotStartTime: key.slotStartTime,
            slotStartsAt: canonical.startsAtDate,
            canonicalLessonId: canonical.id,
            lessonIds,
          });
        }
        return { status: "pending" as const };
      }

      const slotId = existingSlot?.id ?? newId("pslot");
      if (!existingSlot) {
        try {
          await tx.insert(teacherPayrollSlots).values({
            id: slotId,
            organizationId: ctx.organizationId,
            teacherId: key.teacherId,
            slotDate: key.slotDate,
            slotStartTime: key.slotStartTime,
            slotStartsAt: canonical.startsAtDate,
            canonicalLessonId: canonical.id,
            lessonIds,
            attendanceClosed: true,
            presentCount,
            updatedAt: new Date(),
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }

      const [slot] = await tx
        .select()
        .from(teacherPayrollSlots)
        .where(
          and(
            eq(teacherPayrollSlots.teacherId, key.teacherId),
            eq(teacherPayrollSlots.slotDate, key.slotDate),
            eq(teacherPayrollSlots.slotStartTime, key.slotStartTime)
          )
        )
        .limit(1);
      if (!slot) {
        return { status: "pending" as const };
      }
      await tx.execute(
        sql`select id from teacher_payroll_slots where id = ${slot.id} for update`
      );

      await tx
        .update(teacherPayrollSlots)
        .set({
          canonicalLessonId: canonical.id,
          lessonIds,
          attendanceClosed: true,
          presentCount,
          slotStartsAt: canonical.startsAtDate,
          updatedAt: new Date(),
        })
        .where(eq(teacherPayrollSlots.id, slot.id));

      return finalizeSlotAmount(tx as unknown as AppDb, ctx, {
        slotId: slot.id,
        teacherId: key.teacherId,
        slotDate: key.slotDate,
        slotStartTime: key.slotStartTime,
        slotStartsAt: canonical.startsAtDate,
        canonicalLessonId: canonical.id,
        lessonIds,
        presentCount,
        fullyCancelled: false,
      });
    });
}

async function reopenIncompletePayrollSlot(
  db: AppDb,
  ctx: AuthContext,
  input: {
    slotId: string;
    teacherId: string;
    slotDate: string;
    slotStartTime: string;
    slotStartsAt: Date;
    canonicalLessonId: string;
    lessonIds: string[];
  }
): Promise<SettlePayrollResult> {
  const entries = await db
    .select()
    .from(teacherPayrollEntries)
    .where(eq(teacherPayrollEntries.slotId, input.slotId));
  const accrual = entries.find((e) => e.entryType === "accrual");
  await db
    .update(teacherPayrollSlots)
    .set({
      attendanceClosed: false,
      presentCount: 0,
      blockedReason: null,
      canonicalLessonId: input.canonicalLessonId,
      lessonIds: input.lessonIds,
      updatedAt: new Date(),
    })
    .where(eq(teacherPayrollSlots.id, input.slotId));
  if (!accrual) {
    return { status: "pending", slotId: input.slotId, presentCount: 0 };
  }
  const slotLabel = formatSlotLabel(input.slotDate, input.slotStartTime);
  let rates: SlotPayRates = {};
  if (accrual.ratesSnapshot) {
    for (const count of SLOT_PAY_PRESENT_COUNTS) {
      const raw = accrual.ratesSnapshot[String(count)];
      if (typeof raw === "number") rates[count] = raw;
    }
  } else {
    rates = await loadTeacherPayRates(db, input.teacherId);
  }
  await applyTargetAmount(db, ctx, {
    ...input,
    rates,
    targetKopecks: 0,
    presentCount: 0,
    explanation: `Корректировка: проведение слота ${slotLabel} сброшено`,
  });
  await db
    .update(teacherPayrollSlots)
    .set({
      attendanceClosed: false,
      presentCount: 0,
      blockedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(teacherPayrollSlots.id, input.slotId));
  return { status: "pending", slotId: input.slotId, presentCount: 0 };
}

async function finalizeSlotAmount(
  db: AppDb,
  ctx: AuthContext,
  input: {
    slotId: string;
    teacherId: string;
    slotDate: string;
    slotStartTime: string;
    slotStartsAt: Date;
    canonicalLessonId: string;
    lessonIds: string[];
    presentCount: number;
    fullyCancelled: boolean;
  }
): Promise<SettlePayrollResult> {
  const entries = await db
    .select()
    .from(teacherPayrollEntries)
    .where(eq(teacherPayrollEntries.slotId, input.slotId))
    .orderBy(asc(teacherPayrollEntries.createdAt), asc(teacherPayrollEntries.id));

  const accrual = entries.find((e) => e.entryType === "accrual");
  const slotLabel = formatSlotLabel(input.slotDate, input.slotStartTime);

  if (input.fullyCancelled && !accrual) {
    await db
      .update(teacherPayrollSlots)
      .set({
        attendanceClosed: true,
        presentCount: 0,
        blockedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(teacherPayrollSlots.id, input.slotId));
    return { status: "cancelled", slotId: input.slotId, presentCount: 0 };
  }

  let rates: SlotPayRates;
  if (accrual?.ratesSnapshot) {
    rates = {};
    for (const count of SLOT_PAY_PRESENT_COUNTS) {
      const raw = accrual.ratesSnapshot[String(count)];
      if (typeof raw === "number") rates[count] = raw;
    }
  } else {
    rates = await loadTeacherPayRates(db, input.teacherId);
  }

  if (input.fullyCancelled) {
    return applyTargetAmount(db, ctx, {
      ...input,
      rates,
      targetKopecks: 0,
      presentCount: 0,
      explanation: `Корректировка: слот ${slotLabel} отменён`,
    });
  }

  const calculated = amountForPresentCount(rates, input.presentCount);
  if (!calculated.ok) {
    if (accrual) {
      await db
        .update(teacherPayrollSlots)
        .set({
          blockedReason: calculated.reason,
          presentCount: input.presentCount,
          attendanceClosed: true,
          updatedAt: new Date(),
        })
        .where(eq(teacherPayrollSlots.id, input.slotId));
      return {
        status: "blocked",
        slotId: input.slotId,
        presentCount: input.presentCount,
        blockedReason: calculated.reason,
        blockedMessage: payrollBlockedMessage(calculated.reason, input.presentCount),
      };
    }
    await db
      .update(teacherPayrollSlots)
      .set({
        blockedReason: calculated.reason,
        presentCount: input.presentCount,
        attendanceClosed: true,
        updatedAt: new Date(),
      })
      .where(eq(teacherPayrollSlots.id, input.slotId));
    await db.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "teacher_payroll_blocked",
      entityType: "teacher_payroll_slot",
      entityId: input.slotId,
      payload: {
        reason: calculated.reason,
        presentCount: input.presentCount,
        teacherId: input.teacherId,
        slotDate: input.slotDate,
        slotStartTime: input.slotStartTime,
      },
    });
    return {
      status: "blocked",
      slotId: input.slotId,
      presentCount: input.presentCount,
      blockedReason: calculated.reason,
      blockedMessage: payrollBlockedMessage(calculated.reason, input.presentCount),
    };
  }

  return applyTargetAmount(db, ctx, {
    ...input,
    rates,
    targetKopecks: calculated.amountKopecks,
    presentCount: input.presentCount,
    explanation: accrual
      ? `Корректировка посещаемости слота ${slotLabel}: присутствовало ${input.presentCount}`
      : `Начисление за слот ${slotLabel}: ${input.presentCount} присутствующих`,
  });
}

async function applyTargetAmount(
  db: AppDb,
  ctx: AuthContext,
  input: {
    slotId: string;
    teacherId: string;
    slotDate: string;
    slotStartTime: string;
    slotStartsAt: Date;
    canonicalLessonId: string;
    lessonIds: string[];
    presentCount: number;
    rates: SlotPayRates;
    targetKopecks: number;
    explanation: string;
  }
): Promise<SettlePayrollResult> {
  const entries = await db
    .select()
    .from(teacherPayrollEntries)
    .where(eq(teacherPayrollEntries.slotId, input.slotId));
  const accrual = entries.find((e) => e.entryType === "accrual");
  const currentNet = entries
    .filter((e) => e.entryType === "accrual" || e.entryType === "adjustment")
    .reduce((sum, e) => sum + e.amountKopecks, 0);

  if (!accrual) {
    try {
      await db.insert(teacherPayrollEntries).values({
        id: newId("paye"),
        organizationId: ctx.organizationId,
        teacherId: input.teacherId,
        slotId: input.slotId,
        entryType: "accrual",
        amountKopecks: input.targetKopecks,
        presentCount: input.presentCount,
        appliedRateKopecks: input.targetKopecks,
        ratesSnapshot: snapshotRates(input.rates),
        explanation: input.explanation,
        lessonIds: input.lessonIds,
        slotDate: input.slotDate,
        slotStartTime: input.slotStartTime,
        slotStartsAt: input.slotStartsAt,
        canonicalLessonId: input.canonicalLessonId,
        actorUserId: ctx.userId,
        occurredAt: new Date(),
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { status: "unchanged", slotId: input.slotId, presentCount: input.presentCount };
    }
    await db
      .update(teacherPayrollSlots)
      .set({
        blockedReason: null,
        presentCount: input.presentCount,
        attendanceClosed: true,
        updatedAt: new Date(),
      })
      .where(eq(teacherPayrollSlots.id, input.slotId));
    await db.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "teacher_payroll_accrued",
      entityType: "teacher_payroll_slot",
      entityId: input.slotId,
      payload: {
        teacherId: input.teacherId,
        presentCount: input.presentCount,
        amountKopecks: input.targetKopecks,
        slotDate: input.slotDate,
        slotStartTime: input.slotStartTime,
      },
    });
    return {
      status: "accrued",
      slotId: input.slotId,
      presentCount: input.presentCount,
      amountKopecks: input.targetKopecks,
    };
  }

  const delta = input.targetKopecks - currentNet;
  if (delta === 0) {
    await db
      .update(teacherPayrollSlots)
      .set({
        blockedReason: null,
        presentCount: input.presentCount,
        attendanceClosed: true,
        updatedAt: new Date(),
      })
      .where(eq(teacherPayrollSlots.id, input.slotId));
    return {
      status: "unchanged",
      slotId: input.slotId,
      presentCount: input.presentCount,
      amountKopecks: input.targetKopecks,
    };
  }

  await db.insert(teacherPayrollEntries).values({
    id: newId("paye"),
    organizationId: ctx.organizationId,
    teacherId: input.teacherId,
    slotId: input.slotId,
    entryType: "adjustment",
    amountKopecks: delta,
    presentCount: input.presentCount,
    appliedRateKopecks: input.targetKopecks,
    ratesSnapshot: accrual.ratesSnapshot,
    explanation: input.explanation,
    lessonIds: input.lessonIds,
    slotDate: input.slotDate,
    slotStartTime: input.slotStartTime,
    slotStartsAt: input.slotStartsAt,
    canonicalLessonId: input.canonicalLessonId,
    actorUserId: ctx.userId,
    occurredAt: new Date(),
  });
  await db
    .update(teacherPayrollSlots)
    .set({
      blockedReason: null,
      presentCount: input.presentCount,
      attendanceClosed: true,
      updatedAt: new Date(),
    })
    .where(eq(teacherPayrollSlots.id, input.slotId));
  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "teacher_payroll_adjusted",
    entityType: "teacher_payroll_slot",
    entityId: input.slotId,
    payload: {
      teacherId: input.teacherId,
      presentCount: input.presentCount,
      deltaKopecks: delta,
      targetKopecks: input.targetKopecks,
    },
  });
  return {
    status: "adjusted",
    slotId: input.slotId,
    presentCount: input.presentCount,
    amountKopecks: input.targetKopecks,
  };
}

export async function settleLessonPayroll(
  db: AppDb,
  ctx: AuthContext,
  lessonId: string
) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      teacherId: lessons.teacherId,
      startsAt: lessons.startsAt,
      organizationId: lessons.organizationId,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson || lesson.organizationId !== ctx.organizationId) return;
  await settleTeacherSlotPayroll(db, ctx, {
    teacherId: lesson.teacherId,
    startsAt: lesson.startsAt,
  });
}

export async function createTeacherPayout(
  db: AppDb,
  ctx: AuthContext,
  input: {
    teacherId: string;
    amountKopecks: number;
    occurredAt: string;
    comment?: string;
    idempotencyKey: string;
  }
) {
  requireRoles(ctx, ["director"]);
  if (!Number.isInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    throw validationError("Сумма выплаты должна быть положительным числом");
  }
  const key = input.idempotencyKey.trim();
  if (!key) throw validationError("Нужен ключ идемпотентности выплаты");

  const [teacher] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(
      and(
        eq(teachers.id, input.teacherId),
        eq(teachers.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!teacher) throw notFound("Преподаватель не найден");

  const occurredAt = parseAppInstant(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw validationError("Некорректная дата выплаты");
  }

  const [existing] = await db
    .select()
    .from(teacherPayrollEntries)
    .where(
      and(
        eq(teacherPayrollEntries.organizationId, ctx.organizationId),
        eq(teacherPayrollEntries.idempotencyKey, key)
      )
    )
    .limit(1);
  if (existing) {
    return { id: existing.id, replayed: true as const };
  }

  const id = newId("paye");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(teacherPayrollEntries).values({
        id,
        organizationId: ctx.organizationId,
        teacherId: input.teacherId,
        entryType: "payout",
        amountKopecks: input.amountKopecks,
        explanation: "Выплата преподавателю",
        comment: input.comment?.trim() || null,
        actorUserId: ctx.userId,
        idempotencyKey: key,
        occurredAt,
      });
      await tx.insert(auditLog).values({
        id: newId("audit"),
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: "teacher_payroll_payout",
        entityType: "teacher_payroll_entry",
        entityId: id,
        payload: {
          teacherId: input.teacherId,
          amountKopecks: input.amountKopecks,
          comment: input.comment?.trim() || null,
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [row] = await db
        .select()
        .from(teacherPayrollEntries)
        .where(
          and(
            eq(teacherPayrollEntries.organizationId, ctx.organizationId),
            eq(teacherPayrollEntries.idempotencyKey, key)
          )
        )
        .limit(1);
      if (row) return { id: row.id, replayed: true as const };
    }
    throw err;
  }
  return { id, replayed: false as const };
}

/** Контролируемый просмотр слотов, которые можно начислить. Не выполняет начисление. */
export async function previewPayrollBackfill(
  db: AppDb,
  ctx: AuthContext,
  teacherId?: string
) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select({
      id: lessons.id,
      teacherId: lessons.teacherId,
      startsAt: lessons.startsAt,
      status: lessons.status,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.organizationId, ctx.organizationId),
        ...(teacherId ? [eq(lessons.teacherId, teacherId)] : [])
      )
    );
  const grouped = new Map<string, { teacherId: string; startsAt: Date }>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const key = teacherSlotKey(row.teacherId, row.startsAt);
    const mapKey = `${key.teacherId}|${key.slotDate}|${key.slotStartTime}`;
    if (!grouped.has(mapKey)) {
      grouped.set(mapKey, { teacherId: row.teacherId, startsAt: row.startsAt });
    }
  }
  const existing = await db
    .select({
      teacherId: teacherPayrollSlots.teacherId,
      slotDate: teacherPayrollSlots.slotDate,
      slotStartTime: teacherPayrollSlots.slotStartTime,
      attendanceClosed: teacherPayrollSlots.attendanceClosed,
    })
    .from(teacherPayrollSlots)
    .where(eq(teacherPayrollSlots.organizationId, ctx.organizationId));
  const have = new Set(
    existing
      .filter((s) => s.attendanceClosed)
      .map((s) => `${s.teacherId}|${s.slotDate}|${s.slotStartTime}`)
  );
  const candidates = [...grouped.entries()]
    .filter(([k]) => !have.has(k))
    .map(([, v]) => ({
      teacherId: v.teacherId,
      startsAt: v.startsAt.toISOString(),
    }));
  return { candidateCount: candidates.length, candidates: candidates.slice(0, 50) };
}

export async function runPayrollBackfill(
  db: AppDb,
  ctx: AuthContext,
  input: { teacherId?: string; confirm: boolean }
) {
  requireRoles(ctx, ["director"]);
  if (!input.confirm) {
    throw badRequest("Для начисления исторических слотов нужен явный confirm=true");
  }
  const preview = await previewPayrollBackfill(db, ctx, input.teacherId);
  const report = {
    attempted: 0,
    accrued: 0,
    adjusted: 0,
    pending: 0,
    blocked: 0,
    cancelled: 0,
    unchanged: 0,
  };
  for (const candidate of preview.candidates) {
    report.attempted += 1;
    const result = await settleTeacherSlotPayroll(db, ctx, candidate);
    report[result.status] += 1;
  }
  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "teacher_payroll_backfill",
    entityType: "organization",
    entityId: ctx.organizationId,
    payload: { ...report, teacherId: input.teacherId ?? null },
  });
  return report;
}

