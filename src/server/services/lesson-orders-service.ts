import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { manualDebitViolatesDebtFloor } from "@/lib/lesson-balance-rules";
import { STUDENT_CHECKOUT_RETURN_PATH } from "@/lib/payment-checkout";
import type { TariffFeatureKey } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  auditLog,
  learningDirections,
  lessonOrders,
  payments,
  studentLessonLedger,
  students,
  tariffPurchaseOptions,
  tariffs,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";
import {
  getPaymentProvider,
  requirePaymentProvider,
} from "@/server/payments/provider";
import {
  readTochkaConfig,
  truncateTochkaPaymentLinkId,
} from "@/server/payments/tochka";
import {
  loadTariffProductIdsByTariff,
} from "@/server/services/products-service";

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

export type CommerceActor = {
  organizationId: string;
  userId: string | null;
};

function moneyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

async function loadActiveTariffOption(
  db: AppDb,
  organizationId: string,
  tariffId: string,
  optionId: string
) {
  const [tariff] = await db
    .select()
    .from(tariffs)
    .where(
      and(eq(tariffs.id, tariffId), eq(tariffs.organizationId, organizationId))
    )
    .limit(1);
  if (!tariff) throw notFound("Тариф не найден");
  if (tariff.status !== "active") throw badRequest("Тариф недоступен для покупки");

  const [option] = await db
    .select()
    .from(tariffPurchaseOptions)
    .where(
      and(
        eq(tariffPurchaseOptions.id, optionId),
        eq(tariffPurchaseOptions.tariffId, tariffId),
        eq(tariffPurchaseOptions.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!option || !option.isActive) {
    throw badRequest("Вариант покупки недоступен");
  }

  const productMap = await loadTariffProductIdsByTariff(db, organizationId);
  return { tariff, option, productIds: productMap.get(tariffId) ?? [] };
}

async function findReusableCheckout(
  db: AppDb,
  organizationId: string,
  studentId: string,
  optionId: string
) {
  const [order] = await db
    .select()
    .from(lessonOrders)
    .where(
      and(
        eq(lessonOrders.organizationId, organizationId),
        eq(lessonOrders.studentId, studentId),
        eq(lessonOrders.optionId, optionId),
        eq(lessonOrders.status, "awaiting_payment")
      )
    )
    .orderBy(desc(lessonOrders.createdAt))
    .limit(1);
  if (!order) return null;
  const [pay] = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.orderId, order.id), eq(payments.status, "pending"))
    )
    .limit(1);
  if (!pay) return null;
  const rawUrl =
    typeof pay.metadata?.checkoutUrl === "string"
      ? pay.metadata.checkoutUrl.trim()
      : "";
  let checkoutUrl: string | null = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (/^https?:$/i.test(parsed.protocol)) checkoutUrl = rawUrl;
    } catch {
      checkoutUrl = null;
    }
  }
  return { order, payment: pay, checkoutUrl };
}

export type CreateCheckoutInput = {
  tariffId: string;
  optionId: string;
};

export async function createCheckout(
  db: AppDb,
  ctx: AuthContext,
  input: CreateCheckoutInput
) {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden();
  const studentId = ctx.studentId;
  const tariffId = input.tariffId?.trim();
  const optionId = input.optionId?.trim();
  if (!tariffId || !optionId) {
    throw validationError("Укажите тариф и вариант покупки");
  }

  const [studentRow] = await db
    .select({
      id: students.id,
      assignedTariffId: students.assignedTariffId,
    })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!studentRow) throw forbidden();
  if (
    studentRow.assignedTariffId &&
    studentRow.assignedTariffId !== tariffId
  ) {
    throw badRequest(
      "Вам назначен другой тариф. Обновите страницу оплаты и выберите пакет внутри назначенного тарифа."
    );
  }

  const { tariff, option, productIds } = await loadActiveTariffOption(
    db,
    ctx.organizationId,
    tariffId,
    optionId
  );

  const totalAmount = Number(option.totalPrice);
  const unitPrice =
    Math.round((totalAmount / option.lessonsCount) * 100) / 100;
  const features = (tariff.features as TariffFeatureKey[]) ?? [];
  const idempotencyKey = `checkout:${studentId}:${optionId}`;

  let pending = await findReusableCheckout(
    db,
    ctx.organizationId,
    studentId,
    optionId
  );
  if (pending?.checkoutUrl) {
    return {
      orderId: pending.order.id,
      paymentId: pending.payment.id,
      checkoutUrl: pending.checkoutUrl,
      alreadyPending: true as const,
      returnPath: STUDENT_CHECKOUT_RETURN_PATH,
    };
  }

  if (!pending) {
    const orderId = newId("lord");
    const paymentId = newId("pay");
    const paymentLinkId = truncateTochkaPaymentLinkId(orderId);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(lessonOrders).values({
          id: orderId,
          organizationId: ctx.organizationId,
          payerUserId: ctx.userId,
          studentId,
          tariffId: tariff.id,
          optionId: option.id,
          directionId: tariff.directionId,
          tariffNameSnapshot: tariff.name,
          lessonsCount: option.lessonsCount,
          totalAmount: String(totalAmount),
          unitPrice: String(unitPrice),
          currency: "RUB",
          featuresSnapshot: features,
          productIdsSnapshot: productIds,
          status: "awaiting_payment",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await tx.insert(payments).values({
          id: paymentId,
          organizationId: ctx.organizationId,
          studentId,
          orderId,
          amount: String(totalAmount),
          currency: "RUB",
          status: "pending",
          provider: "tochka",
          paymentLinkId,
          idempotencyKey,
          metadata: { source: "student_checkout" },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      const [order] = await db
        .select()
        .from(lessonOrders)
        .where(eq(lessonOrders.id, orderId))
        .limit(1);
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (order && payment) {
        pending = { order, payment, checkoutUrl: null };
      }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      pending = await findReusableCheckout(
        db,
        ctx.organizationId,
        studentId,
        optionId
      );
      if (!pending) throw err;
    }
  }

  if (!pending) {
    throw badRequest("Не удалось создать заказ на оплату");
  }

  const orderIdFinal = pending.order.id;
  const paymentIdFinal = pending.payment.id;
  if (pending.checkoutUrl) {
    return {
      orderId: orderIdFinal,
      paymentId: paymentIdFinal,
      checkoutUrl: pending.checkoutUrl,
      alreadyPending: true as const,
      returnPath: STUDENT_CHECKOUT_RETURN_PATH,
    };
  }

  // Если URL ещё нет (сбой после insert / битая ссылка) — новый paymentLinkId,
  // иначе Точка может отклонить повтор с тем же id (maxLength 45).
  const linkId = truncateTochkaPaymentLinkId(
    `${paymentIdFinal}_${randomBytes(3).toString("hex")}`
  );

  const provider = requirePaymentProvider();
  const purpose = `Оплата: ${tariff.name}, ${option.lessonsCount} занятий`;
  const bank = await provider.createPaymentOperation({
    amount: totalAmount,
    purpose,
    paymentLinkId: linkId,
  });

  const now = new Date();
  await db
    .update(payments)
    .set({
      externalId: bank.operationId,
      paymentLinkId: linkId,
      metadata: {
        source: "student_checkout",
        checkoutUrl: bank.paymentLink,
        bankRaw: bank.raw,
      },
      updatedAt: now,
    })
    .where(eq(payments.id, paymentIdFinal));

  return {
    orderId: orderIdFinal,
    paymentId: paymentIdFinal,
    checkoutUrl: bank.paymentLink,
    alreadyPending: false as const,
    returnPath: STUDENT_CHECKOUT_RETURN_PATH,
  };
}

export type ConfirmPaidInput = {
  paymentId?: string;
  operationId?: string;
  amount: number;
  raw?: unknown;
};

export async function confirmPaidFromBank(
  db: AppDb,
  ctx: CommerceActor,
  input: ConfirmPaidInput
) {
  if (!input.paymentId && !input.operationId) {
    throw validationError("Укажите paymentId или operationId");
  }

  return db.transaction(async (tx) => {
    let pay: typeof payments.$inferSelect | undefined;
    if (input.paymentId) {
      await tx.execute(
        sql`select id from payments where id = ${input.paymentId} for update`
      );
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.paymentId),
            eq(payments.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      pay = row;
    } else if (input.operationId) {
      await tx.execute(
        sql`select id from payments where external_id = ${input.operationId} for update`
      );
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.externalId, input.operationId),
            eq(payments.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      pay = row;
    }
    if (!pay) throw notFound("Платёж не найден");
    if (pay.status === "paid") {
      return {
        ok: true as const,
        alreadyPaid: true as const,
        paymentId: pay.id,
        organizationId: pay.organizationId,
      };
    }
    if (pay.status === "refunded") {
      throw badRequest("Платёж уже возвращён");
    }
    if (!moneyEqual(Number(pay.amount), input.amount)) {
      throw badRequest("Сумма платежа не совпадает с заказом");
    }

    await tx.execute(
      sql`select id from lesson_orders where id = ${pay.orderId} for update`
    );
    const [order] = await tx
      .select()
      .from(lessonOrders)
      .where(eq(lessonOrders.id, pay.orderId))
      .limit(1);
    if (!order) throw notFound("Заказ не найден");

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: "paid",
        paidAt: now,
        metadata: {
          ...(pay.metadata ?? {}),
          bankConfirmRaw: input.raw ?? null,
        },
        updatedAt: now,
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(lessonOrders)
      .set({
        status: "paid",
        paidAt: now,
        updatedAt: now,
      })
      .where(eq(lessonOrders.id, order.id));

    let ledgerId = order.creditLedgerEntryId;
    if (!ledgerId) {
      if (!order.studentId) {
        throw badRequest(
          "Нельзя зачислить занятия: заказ отвязан от удалённого ученика"
        );
      }
      ledgerId = newId("sll");
      await tx.insert(studentLessonLedger).values({
        id: ledgerId,
        organizationId: ctx.organizationId,
        studentId: order.studentId,
        directionId: order.directionId,
        delta: order.lessonsCount,
        reason: "purchase",
        orderId: order.id,
        actorUserId: ctx.userId,
        note: null,
        createdAt: now,
      });
      await tx
        .update(lessonOrders)
        .set({
          creditLedgerEntryId: ledgerId,
          creditedAt: now,
          updatedAt: now,
        })
        .where(eq(lessonOrders.id, order.id));
    }

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "lesson_order_paid",
      entityType: "payment",
      entityId: pay.id,
      payload: {
        orderId: order.id,
        amount: Number(pay.amount),
        operationId: pay.externalId,
        raw: input.raw ?? null,
      },
    });

    return {
      ok: true as const,
      alreadyPaid: false as const,
      paymentId: pay.id,
      orderId: order.id,
      ledgerEntryId: ledgerId,
      organizationId: pay.organizationId,
    };
  }).then(async (result) => {
    const { safeEnsureIncomeSettlementDocument } = await import(
      "@/server/services/settlement-documents-service"
    );
    await safeEnsureIncomeSettlementDocument(db, {
      paymentId: result.paymentId,
      organizationId: result.organizationId,
    });
    return result;
  });
}

export async function refreshPaymentStatus(
  db: AppDb,
  ctx: AuthContext,
  input: { paymentId: string }
) {
  requireRoles(ctx, ["student", "director"]);
  const paymentId = input.paymentId?.trim();
  if (!paymentId) throw validationError("Укажите paymentId");

  const [pay] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!pay) throw notFound("Платёж не найден");
  if (ctx.role === "student") {
    if (!ctx.studentId || pay.studentId !== ctx.studentId) throw forbidden();
  }
  if (pay.status === "paid") {
    return { status: "paid" as const, confirmed: true as const };
  }
  if (!pay.externalId) {
    throw badRequest("У платежа нет идентификатора операции в банке");
  }
  if (getPaymentProvider().id === "stub") {
    throw badRequest(
      "Автоматическая проверка оплаты недоступна: Точка Банк не настроена"
    );
  }
  const provider = requirePaymentProvider();
  const info = await provider.getPaymentOperationInfo(pay.externalId);
  if (info.status.toUpperCase() !== "APPROVED") {
    return { status: info.status, confirmed: false as const };
  }
  const amount = info.amount ?? Number(pay.amount);
  const result = await confirmPaidFromBank(db, ctx, {
    paymentId: pay.id,
    amount,
    raw: info.raw,
  });
  return { status: "APPROVED", confirmed: result.ok };
}

export async function adminRefundPayment(
  db: AppDb,
  ctx: AuthContext,
  input: { paymentId: string; reason?: string }
) {
  requireRoles(ctx, ["director"]);
  const paymentId = input.paymentId?.trim();
  if (!paymentId) throw validationError("Укажите paymentId");

  const [pay] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!pay) throw notFound("Платёж не найден");
  if (pay.status !== "paid") {
    throw badRequest("Возврат возможен только для оплаченного платежа");
  }
  if (!pay.externalId) {
    throw badRequest("Нет operationId для возврата в банке");
  }

  const provider = requirePaymentProvider();
  await provider.refundPaymentOperation(
    pay.externalId,
    Number(pay.amount)
  );

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from payments where id = ${paymentId} for update`
    );
    const [order] = await tx
      .select()
      .from(lessonOrders)
      .where(eq(lessonOrders.id, pay.orderId))
      .limit(1);
    if (!order) throw notFound("Заказ не найден");

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: "refunded",
        metadata: {
          ...(pay.metadata ?? {}),
          refundReason: input.reason?.trim() || null,
        },
        updatedAt: now,
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(lessonOrders)
      .set({
        status: "refunded",
        accessRevoked: true,
        updatedAt: now,
      })
      .where(eq(lessonOrders.id, order.id));

    if (order.creditLedgerEntryId) {
      const [claw] = await tx
        .select({ id: studentLessonLedger.id })
        .from(studentLessonLedger)
        .where(
          and(
            eq(studentLessonLedger.orderId, order.id),
            eq(studentLessonLedger.reason, "refund_clawback")
          )
        )
        .limit(1);
      if (!claw) {
        if (!order.studentId) {
          // Профиль уже удалён — баланс списан вместе с ним; clawback в ledger не нужен
        } else {
          await tx.insert(studentLessonLedger).values({
            id: newId("sll"),
            organizationId: ctx.organizationId,
            studentId: order.studentId,
            directionId: order.directionId,
            delta: -order.lessonsCount,
            reason: "refund_clawback",
            orderId: order.id,
            actorUserId: ctx.userId,
            note: input.reason?.trim() || "Возврат оплаты",
            createdAt: now,
          });
        }
      }
    }

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "lesson_order_refunded",
      entityType: "payment",
      entityId: pay.id,
      payload: {
        orderId: order.id,
        reason: input.reason?.trim() || null,
      },
    });

    return { ok: true as const, paymentId: pay.id };
  }).then(async (result) => {
    const { safeEnsureIncomeReturnSettlementDocument } = await import(
      "@/server/services/settlement-documents-service"
    );
    await safeEnsureIncomeReturnSettlementDocument(db, {
      paymentId: result.paymentId,
      organizationId: ctx.organizationId,
    });
    return { ok: true as const };
  });
}

export async function adminAdjustBalance(
  db: AppDb,
  ctx: AuthContext,
  input: {
    studentId: string;
    directionId: string;
    delta: number;
    note: string;
    /** Явное админ-решение обойти лимит долга (−2). */
    allowBelowDebtFloor?: boolean;
  }
) {
  requireRoles(ctx, ["director", "press"]);
  const note = input.note?.trim();
  if (!note || note.length < 3) {
    throw validationError(
      "Укажите причину изменения баланса (не короче 3 символов)"
    );
  }
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw validationError("Укажите ненулевое изменение баланса");
  }
  if (!Number.isInteger(input.delta)) {
    throw validationError("Количество занятий должно быть целым числом");
  }

  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, input.studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student) throw notFound("Ученик не найден");

  const [direction] = await db
    .select()
    .from(learningDirections)
    .where(
      and(
        eq(learningDirections.id, input.directionId),
        eq(learningDirections.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!direction) throw notFound("Направление не найдено");

  const { sumDirectionLedgerDelta } = await import(
    "@/server/services/lesson-balance"
  );
  const remaining = await sumDirectionLedgerDelta(
    db,
    ctx.organizationId,
    student.id,
    direction.id
  );
  const nextRemaining = remaining + input.delta;
  if (
    manualDebitViolatesDebtFloor(
      remaining,
      input.delta,
      Boolean(input.allowBelowDebtFloor)
    )
  ) {
    throw validationError(
      "Списание опустит баланс ниже лимита долга (−2). Отметьте явное разрешение, если это намеренная корректировка."
    );
  }

  const now = new Date();
  const ledgerId = newId("sll");
  await db.insert(studentLessonLedger).values({
    id: ledgerId,
    organizationId: ctx.organizationId,
    studentId: student.id,
    directionId: direction.id,
    delta: input.delta,
    reason: "manual_adjustment",
    actorUserId: ctx.userId,
    note,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "lesson_balance_adjusted",
    entityType: "student",
    entityId: student.id,
    payload: {
      directionId: direction.id,
      delta: input.delta,
      note,
      ledgerEntryId: ledgerId,
      previousRemaining: remaining,
      nextRemaining,
      allowBelowDebtFloor: Boolean(input.allowBelowDebtFloor),
    },
  });

  return {
    ok: true as const,
    ledgerEntryId: ledgerId,
    previousRemaining: remaining,
    nextRemaining,
  };
}

export type StudentBalanceLedgerEntryDto = {
  id: string;
  studentId: string;
  directionId: string;
  directionName: string | null;
  delta: number;
  reason: string;
  lessonId: string | null;
  orderId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

/** Журнал изменений баланса занятий ученика (дирекция и пресса). */
export async function listStudentBalanceLedger(
  db: AppDb,
  ctx: AuthContext,
  input: { studentId: string; directionId?: string | null; limit?: number }
): Promise<{ entries: StudentBalanceLedgerEntryDto[] }> {
  requireRoles(ctx, ["director", "press"]);
  const studentId = input.studentId?.trim();
  if (!studentId) throw validationError("studentId обязателен");

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student) throw notFound("Ученик не найден");

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 300);
  const conditions = [
    eq(studentLessonLedger.organizationId, ctx.organizationId),
    eq(studentLessonLedger.studentId, studentId),
  ];
  if (input.directionId?.trim()) {
    conditions.push(
      eq(studentLessonLedger.directionId, input.directionId.trim())
    );
  }

  const rows = await db
    .select({
      id: studentLessonLedger.id,
      studentId: studentLessonLedger.studentId,
      directionId: studentLessonLedger.directionId,
      directionName: learningDirections.name,
      delta: studentLessonLedger.delta,
      reason: studentLessonLedger.reason,
      lessonId: studentLessonLedger.lessonId,
      orderId: studentLessonLedger.orderId,
      actorUserId: studentLessonLedger.actorUserId,
      note: studentLessonLedger.note,
      createdAt: studentLessonLedger.createdAt,
    })
    .from(studentLessonLedger)
    .leftJoin(
      learningDirections,
      eq(learningDirections.id, studentLessonLedger.directionId)
    )
    .where(and(...conditions))
    .orderBy(desc(studentLessonLedger.createdAt))
    .limit(limit);

  const actorIds = [
    ...new Set(
      rows
        .map((r) => r.actorUserId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const actorRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, actorIds));
    for (const a of actorRows) actorNameById.set(a.id, a.fullName);
  }

  return {
    entries: rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      directionId: r.directionId,
      directionName: r.directionName ?? null,
      delta: r.delta,
      reason: r.reason,
      lessonId: r.lessonId ?? null,
      orderId: r.orderId ?? null,
      actorUserId: r.actorUserId ?? null,
      actorName: r.actorUserId
        ? (actorNameById.get(r.actorUserId) ?? null)
        : null,
      note: r.note ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function adminRejectPayment(
  db: AppDb,
  ctx: AuthContext,
  input: { paymentId: string; reason?: string }
) {
  requireRoles(ctx, ["director"]);
  const reason = (input.reason ?? "").trim();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from payments where id = ${input.paymentId} for update`
    );
    const [pay] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, input.paymentId),
          eq(payments.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!pay) throw notFound("Платёж не найден");
    if (pay.status === "paid") {
      throw badRequest("Оплаченный платёж нельзя отклонить");
    }
    if (pay.status !== "pending") {
      return { ok: true as const, alreadyRejected: true as const };
    }

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: "cancelled",
        failureReason: reason || "Отклонено администратором",
        updatedAt: now,
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(lessonOrders)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(lessonOrders.id, pay.orderId));

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "payment_rejected",
      entityType: "payment",
      entityId: pay.id,
      payload: { reason: reason || null, orderId: pay.orderId },
    });

    return { ok: true as const, alreadyRejected: false as const };
  });
}

function mapOrderRow(
  row: typeof lessonOrders.$inferSelect,
  extra?: { studentName?: string; directionName?: string }
) {
  return {
    id: row.id,
    studentId: row.studentId,
    payerUserId: row.payerUserId,
    tariffId: row.tariffId,
    optionId: row.optionId,
    directionId: row.directionId,
    tariffNameSnapshot: row.tariffNameSnapshot,
    lessonsCount: row.lessonsCount,
    totalAmount: Number(row.totalAmount),
    unitPrice: Number(row.unitPrice),
    currency: "RUB" as const,
    featuresSnapshot: row.featuresSnapshot,
    productIdsSnapshot: row.productIdsSnapshot,
    status: row.status,
    paidAt: row.paidAt?.toISOString() ?? null,
    creditedAt: row.creditedAt?.toISOString() ?? null,
    creditLedgerEntryId: row.creditLedgerEntryId,
    accessRevoked: row.accessRevoked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    studentName: extra?.studentName,
    directionName: extra?.directionName,
  };
}

export async function listOrdersForDirector(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(lessonOrders)
    .where(eq(lessonOrders.organizationId, ctx.organizationId))
    .orderBy(desc(lessonOrders.createdAt))
    .limit(500);

  const studentRows = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(eq(students.organizationId, ctx.organizationId));
  const directionRows = await db
    .select({
      id: learningDirections.id,
      name: learningDirections.name,
    })
    .from(learningDirections)
    .where(eq(learningDirections.organizationId, ctx.organizationId));

  const studentName = new Map(studentRows.map((s) => [s.id, s.fullName]));
  const directionName = new Map(directionRows.map((d) => [d.id, d.name]));

  return rows.map((row) =>
    mapOrderRow(row, {
      studentName: row.studentId
        ? studentName.get(row.studentId)
        : row.studentNameSnapshot ?? undefined,
      directionName: directionName.get(row.directionId),
    })
  );
}

export async function listOrdersForStudent(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden();
  const rows = await db
    .select()
    .from(lessonOrders)
    .where(
      and(
        eq(lessonOrders.organizationId, ctx.organizationId),
        eq(lessonOrders.studentId, ctx.studentId)
      )
    )
    .orderBy(desc(lessonOrders.createdAt))
    .limit(100);
  return rows.map((row) => mapOrderRow(row));
}

export async function findPaymentForWebhook(
  db: AppDb,
  input: { paymentLinkId?: string | null; operationId?: string | null }
) {
  if (!input.paymentLinkId && !input.operationId) return null;
  const clauses = [];
  if (input.paymentLinkId) {
    clauses.push(eq(payments.paymentLinkId, input.paymentLinkId));
  }
  if (input.operationId) {
    clauses.push(eq(payments.externalId, input.operationId));
  }
  const [pay] = await db
    .select()
    .from(payments)
    .where(or(...clauses))
    .limit(1);
  return pay ?? null;
}

export function isTochkaConfigured(): boolean {
  return readTochkaConfig() != null;
}