import { and, eq, inArray } from "drizzle-orm";

import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { revokeAllUserSessions } from "@/server/auth/session";
import {
  accountInvitations,
  legalConsents,
  lessonOrders,
  lessonScheduleStudents,
  lessonSchedules,
  lessonStudents,
  lessons,
  memberships,
  payments,
  settlementDocuments,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, forbidden, notFound, validationError } from "@/server/errors";
import { deleteSettlementPdf } from "@/server/media/settlement-storage";

const RETAINED_PAYMENT_STATUSES = ["paid", "refunded"] as const;
const DISCARD_PAYMENT_STATUSES = [
  "pending",
  "failed",
  "cancelled",
  "expired",
] as const;
const RETAINED_ORDER_STATUSES = ["paid", "refunded", "disputed"] as const;

export type PermanentDeleteStudentResult = {
  ok: true;
  studentId: string;
  fullName: string;
  deleted: {
    settlements: number;
    payments: number;
    lessonOrders: number;
    invitations: number;
    legalConsents: number;
    lessonParticipations: number;
    scheduleParticipations: number;
    emptyLessons: number;
    emptySchedules: number;
    memberships: number;
    userAccount: boolean;
  };
  retained: {
    payments: number;
    lessonOrders: number;
    settlements: number;
  };
};

/**
 * Безвозвратное удаление одного ученика и его учебных данных (директор).
 * Успешные платежи / возвраты и документы расчётов сохраняются и отвязываются
 * от профиля; неуспешные попытки и незавершённые заказы удаляются.
 */
export async function permanentlyDeleteStudent(
  db: AppDb,
  ctx: AuthContext,
  input: { id: string; confirmFullName: string }
): Promise<PermanentDeleteStudentResult> {
  requireRoles(ctx, ["director"]);

  const studentId = input.id?.trim();
  if (!studentId) throw validationError("Укажите ученика");

  const confirmFullName = input.confirmFullName?.trim() ?? "";
  if (!confirmFullName) {
    throw validationError("Введите полное имя ученика для подтверждения");
  }

  const [row] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Ученик не найден");

  if (row.fullName.trim() !== confirmFullName) {
    throw badRequest(
      "Имя не совпадает. Введите ФИО ученика точно, как в карточке."
    );
  }

  if (row.userId) {
    const [staffMem] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, row.userId),
          eq(memberships.organizationId, ctx.organizationId),
          inArray(memberships.role, ["director", "teacher", "press", "assistant"])
        )
      )
      .limit(1);
    if (staffMem) {
      throw forbidden(
        "Нельзя удалить ученика, связанного с учётной записью сотрудника"
      );
    }
    const [teacherRow] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(
        and(
          eq(teachers.userId, row.userId),
          eq(teachers.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (teacherRow) {
      throw forbidden(
        "Нельзя удалить ученика, связанного с профилем преподавателя"
      );
    }
  }

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.studentId, studentId),
        eq(payments.organizationId, ctx.organizationId)
      )
    );

  const retainedPayments = paymentRows.filter((p) =>
    (RETAINED_PAYMENT_STATUSES as readonly string[]).includes(p.status)
  );
  const discardPayments = paymentRows.filter((p) =>
    (DISCARD_PAYMENT_STATUSES as readonly string[]).includes(p.status)
  );
  const retainedPaymentIds = retainedPayments.map((p) => p.id);
  const discardPaymentIds = discardPayments.map((p) => p.id);
  const retainedOrderIdsFromPayments = new Set(
    retainedPayments.map((p) => p.orderId)
  );

  const orderRows = await db
    .select()
    .from(lessonOrders)
    .where(
      and(
        eq(lessonOrders.studentId, studentId),
        eq(lessonOrders.organizationId, ctx.organizationId)
      )
    );

  const retainedOrders = orderRows.filter(
    (o) =>
      retainedOrderIdsFromPayments.has(o.id) ||
      (RETAINED_ORDER_STATUSES as readonly string[]).includes(o.status)
  );
  const retainedOrderIds = new Set(retainedOrders.map((o) => o.id));
  const discardOrders = orderRows.filter((o) => !retainedOrderIds.has(o.id));
  const discardOrderIds = discardOrders.map((o) => o.id);

  let payerNameForSnapshot = row.fullName;
  if (row.userId) {
    const [payerUser] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (payerUser?.fullName?.trim()) payerNameForSnapshot = payerUser.fullName.trim();
  }

  const lessonLinkRows = await db
    .select({ lessonId: lessonStudents.lessonId })
    .from(lessonStudents)
    .where(eq(lessonStudents.studentId, studentId));
  const touchedLessonIds = [...new Set(lessonLinkRows.map((r) => r.lessonId))];

  const scheduleLinkRows = await db
    .select({ scheduleId: lessonScheduleStudents.scheduleId })
    .from(lessonScheduleStudents)
    .where(eq(lessonScheduleStudents.studentId, studentId));
  const touchedScheduleIds = [
    ...new Set(scheduleLinkRows.map((r) => r.scheduleId)),
  ];

  // PDF удаляем только у отбрасываемых платежей; retained — никогда
  let discardSettlementKeys: string[] = [];
  let retainedSettlementCount = 0;
  if (discardPaymentIds.length > 0 || retainedPaymentIds.length > 0) {
    try {
      if (discardPaymentIds.length > 0) {
        const docs = await db
          .select({
            id: settlementDocuments.id,
            pdfStorageKey: settlementDocuments.pdfStorageKey,
          })
          .from(settlementDocuments)
          .where(inArray(settlementDocuments.paymentId, discardPaymentIds));
        discardSettlementKeys = docs.map((d) => d.pdfStorageKey);
      }
      if (retainedPaymentIds.length > 0) {
        const kept = await db
          .select({ id: settlementDocuments.id })
          .from(settlementDocuments)
          .where(inArray(settlementDocuments.paymentId, retainedPaymentIds));
        retainedSettlementCount = kept.length;
      }
    } catch {
      discardSettlementKeys = [];
      retainedSettlementCount = 0;
    }
  }

  const deleted = await db.transaction(async (tx) => {
    const now = new Date();

    // 1) Отвязать сохраняемые финансы от профиля (до удаления student)
    if (retainedPaymentIds.length > 0) {
      await tx
        .update(payments)
        .set({
          studentId: null,
          studentNameSnapshot: row.fullName,
          updatedAt: now,
        })
        .where(
          and(
            inArray(payments.id, retainedPaymentIds),
            eq(payments.organizationId, ctx.organizationId)
          )
        );
    }

    if (retainedOrders.length > 0) {
      for (const order of retainedOrders) {
        const clearPayer =
          Boolean(row.userId) && order.payerUserId === row.userId;
        await tx
          .update(lessonOrders)
          .set({
            studentId: null,
            studentNameSnapshot: row.fullName,
            payerUserId: clearPayer ? null : order.payerUserId,
            payerNameSnapshot: clearPayer
              ? payerNameForSnapshot
              : order.payerNameSnapshot,
            creditLedgerEntryId: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(lessonOrders.id, order.id),
              eq(lessonOrders.organizationId, ctx.organizationId)
            )
          );
      }
    }

    // 2) Удалить settlement docs только у отбрасываемых платежей
    let settlements = 0;
    if (discardPaymentIds.length > 0) {
      try {
        const removed = await tx
          .delete(settlementDocuments)
          .where(inArray(settlementDocuments.paymentId, discardPaymentIds))
          .returning();
        settlements = removed.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/settlement_documents|does not exist|relation/i.test(msg)) {
          throw err;
        }
      }
    }

    // 3) Неуспешные / незавершённые платежи
    let removedPaymentsCount = 0;
    if (discardPaymentIds.length > 0) {
      const removedPayments = await tx
        .delete(payments)
        .where(
          and(
            inArray(payments.id, discardPaymentIds),
            eq(payments.organizationId, ctx.organizationId)
          )
        )
        .returning();
      removedPaymentsCount = removedPayments.length;
    }

    // 4) Незавершённые заказы (без retained-платежей)
    let removedOrdersCount = 0;
    if (discardOrderIds.length > 0) {
      const removedOrders = await tx
        .delete(lessonOrders)
        .where(
          and(
            inArray(lessonOrders.id, discardOrderIds),
            eq(lessonOrders.organizationId, ctx.organizationId)
          )
        )
        .returning();
      removedOrdersCount = removedOrders.length;
    }

    const removedInvites = await tx
      .delete(accountInvitations)
      .where(
        and(
          eq(accountInvitations.studentId, studentId),
          eq(accountInvitations.organizationId, ctx.organizationId)
        )
      )
      .returning();

    let consents = 0;
    if (row.userId) {
      try {
        const removedConsents = await tx
          .delete(legalConsents)
          .where(eq(legalConsents.userId, row.userId))
          .returning();
        consents = removedConsents.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/legal_consents|does not exist|relation/i.test(msg)) throw err;
      }
    }

    const removedLessonParts = await tx
      .delete(lessonStudents)
      .where(eq(lessonStudents.studentId, studentId))
      .returning();

    const removedScheduleParts = await tx
      .delete(lessonScheduleStudents)
      .where(eq(lessonScheduleStudents.studentId, studentId))
      .returning();

    let emptyLessons = 0;
    if (touchedLessonIds.length > 0) {
      const stillLinked = await tx
        .select({ lessonId: lessonStudents.lessonId })
        .from(lessonStudents)
        .where(inArray(lessonStudents.lessonId, touchedLessonIds));
      const still = new Set(stillLinked.map((r) => r.lessonId));
      const orphanLessonIds = touchedLessonIds.filter((id) => !still.has(id));
      if (orphanLessonIds.length > 0) {
        const removedLessons = await tx
          .delete(lessons)
          .where(
            and(
              eq(lessons.organizationId, ctx.organizationId),
              inArray(lessons.id, orphanLessonIds)
            )
          )
          .returning();
        emptyLessons = removedLessons.length;
      }
    }

    let emptySchedules = 0;
    if (touchedScheduleIds.length > 0) {
      const stillSched = await tx
        .select({ scheduleId: lessonScheduleStudents.scheduleId })
        .from(lessonScheduleStudents)
        .where(inArray(lessonScheduleStudents.scheduleId, touchedScheduleIds));
      const stillSet = new Set(stillSched.map((r) => r.scheduleId));
      const orphanScheduleIds = touchedScheduleIds.filter(
        (id) => !stillSet.has(id)
      );
      if (orphanScheduleIds.length > 0) {
        const lessonsOnSched = await tx
          .select({ id: lessons.id, scheduleId: lessons.scheduleId })
          .from(lessons)
          .where(inArray(lessons.scheduleId, orphanScheduleIds));
        const busy = new Set(
          lessonsOnSched
            .map((l) => l.scheduleId)
            .filter((id): id is string => Boolean(id))
        );
        const deletable = orphanScheduleIds.filter((id) => !busy.has(id));
        if (deletable.length > 0) {
          const removedSched = await tx
            .delete(lessonSchedules)
            .where(
              and(
                eq(lessonSchedules.organizationId, ctx.organizationId),
                inArray(lessonSchedules.id, deletable)
              )
            )
            .returning();
          emptySchedules = removedSched.length;
        }
      }
    }

    // Баланс / ledger / абонементные данные — cascade с students
    await tx
      .delete(students)
      .where(
        and(
          eq(students.id, studentId),
          eq(students.organizationId, ctx.organizationId)
        )
      );

    // Защита: не должно остаться live-ссылок на удалённого ученика в финансах
    const [stillLinkedPay] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.studentId, studentId))
      .limit(1);
    if (stillLinkedPay) {
      throw badRequest(
        "Не удалось отвязать платежи от профиля ученика"
      );
    }
    const [stillLinkedOrder] = await tx
      .select({ id: lessonOrders.id })
      .from(lessonOrders)
      .where(eq(lessonOrders.studentId, studentId))
      .limit(1);
    if (stillLinkedOrder) {
      throw badRequest(
        "Не удалось отвязать заказы от профиля ученика"
      );
    }

    let membershipCount = 0;
    let userAccount = false;
    if (row.userId) {
      const removedMem = await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.userId, row.userId),
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.role, "student")
          )
        )
        .returning();
      membershipCount = removedMem.length;

      const [stillStaff] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, row.userId))
        .limit(1);
      const [stillTeacher] = await tx
        .select({ id: teachers.id })
        .from(teachers)
        .where(eq(teachers.userId, row.userId))
        .limit(1);

      // payer_user_id уже null у retained orders этого ученика
      if (!stillStaff && !stillTeacher) {
        await tx.delete(users).where(eq(users.id, row.userId));
        userAccount = true;
      }
    }

    return {
      settlements,
      payments: removedPaymentsCount,
      lessonOrders: removedOrdersCount,
      invitations: removedInvites.length,
      legalConsents: consents,
      lessonParticipations: removedLessonParts.length,
      scheduleParticipations: removedScheduleParts.length,
      emptyLessons,
      emptySchedules,
      memberships: membershipCount,
      userAccount,
    };
  });

  // PDF только для отброшенных settlement; retained файлы не трогаем
  for (const key of discardSettlementKeys) {
    try {
      await deleteSettlementPdf(key);
    } catch {
      // orphan file — не валим операцию
    }
  }

  if (row.userId && deleted.userAccount) {
    try {
      await revokeAllUserSessions(db, row.userId);
    } catch {
      // сессии могли каскадно уйти с users
    }
  }

  return {
    ok: true,
    studentId,
    fullName: row.fullName,
    deleted,
    retained: {
      payments: retainedPayments.length,
      lessonOrders: retainedOrders.length,
      settlements: retainedSettlementCount,
    },
  };
}
