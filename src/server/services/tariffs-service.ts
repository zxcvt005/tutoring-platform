import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  MANUAL_REVIEW_WARNING,
  STUDENT_CHECKOUT_RETURN_PATH,
  TOCHKA_CHECKOUT_URL,
} from "@/lib/payment-checkout";
import type { TariffFeatureKey, TariffStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  loadTariffProductIdsByTariff,
  replaceTariffProducts,
} from "@/server/services/products-service";
import {
  auditLog,
  payments,
  studentTariffAssignments,
  students,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";
import { findDebitAssignment } from "@/server/services/lesson-balance";
import {
  settleDebtOnNewAssignment,
  shouldActivatePaidAssignment,
} from "@/server/services/tariff-queue";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

const FEATURE_KEYS = new Set<string>([
  "individual_lessons",
  "homework",
  "group_calls",
  "intensives",
  "extra_materials",
  "extra_tests",
]);

function normalizeFeatures(raw: unknown): TariffFeatureKey[] {
  if (!Array.isArray(raw)) return ["individual_lessons", "homework"];
  return raw
    .filter((x): x is string => typeof x === "string" && FEATURE_KEYS.has(x))
    .map((x) => x as TariffFeatureKey);
}

export type UpsertTariffInput = {
  id?: string;
  name: string;
  price: number;
  durationDays: number;
  lessonsLimit?: number | null;
  weeklyFrequency?: number;
  includesText?: string | null;
  features?: string[];
  status?: TariffStatus;
  adminNotes?: string | null;
  /** Если задано — состав продуктов тарифа заменяется атомарно */
  productIds?: string[];
};

export async function listTariffs(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(tariffs)
    .where(eq(tariffs.organizationId, ctx.organizationId))
    .orderBy(desc(tariffs.createdAt));

  const counts = await db
    .select({
      tariffId: studentTariffAssignments.tariffId,
      n: count(),
    })
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.organizationId, ctx.organizationId))
    .groupBy(studentTariffAssignments.tariffId);
  const countMap = new Map(counts.map((c) => [c.tariffId, Number(c.n)]));
  const productIdsByTariff = await loadTariffProductIdsByTariff(
    db,
    ctx.organizationId
  );

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: "RUB" as const,
    durationDays: t.durationDays,
    lessonsLimit: t.lessonsLimit ?? undefined,
    weeklyFrequency: t.weeklyFrequency,
    includesText: t.includesText ?? undefined,
    features: (t.features as TariffFeatureKey[]) ?? [],
    status: t.status as TariffStatus,
    adminNotes: t.adminNotes ?? undefined,
    assignedCount: countMap.get(t.id) ?? 0,
    productIds: productIdsByTariff.get(t.id) ?? [],
  }));
}

export async function upsertTariff(
  db: AppDb,
  ctx: AuthContext,
  input: UpsertTariffInput
) {
  requireRoles(ctx, ["director"]);
  const name = input.name.trim();
  if (!name) throw validationError("Укажите название тарифа");
  if (!(input.price >= 0) || Number.isNaN(input.price)) {
    throw validationError("Некорректная стоимость");
  }
  if (!input.durationDays || input.durationDays < 1) {
    throw validationError("Прогнозируемая длительность — не менее 1 дня");
  }
  if (!input.lessonsLimit || input.lessonsLimit < 1) {
    throw validationError("Укажите количество занятий");
  }
  const weeklyFrequency = input.weeklyFrequency ?? 1;
  if (!weeklyFrequency || weeklyFrequency < 1) {
    throw validationError("Частота — не менее 1 занятия в неделю");
  }
  const features = normalizeFeatures(input.features);
  const id = input.id ?? newId("tariff");
  const [existing] = input.id
    ? await db.select().from(tariffs).where(eq(tariffs.id, id)).limit(1)
    : [];

  const values = {
    id,
    organizationId: ctx.organizationId,
    name,
    price: String(input.price),
    currency: "RUB" as const,
    durationDays: input.durationDays,
    lessonsLimit: input.lessonsLimit,
    weeklyFrequency,
    includesText: input.includesText?.trim() || null,
    features,
    status: (input.status ?? "active") as TariffStatus,
    adminNotes: input.adminNotes?.trim() || null,
    updatedAt: new Date(),
  };

  return db.transaction(async (tx) => {
    const conn = tx as unknown as AppDb;
    if (existing) {
      if (existing.organizationId !== ctx.organizationId) throw forbidden();
      await conn.update(tariffs).set(values).where(eq(tariffs.id, id));
    } else {
      await conn.insert(tariffs).values({ ...values, createdAt: new Date() });
    }
    if (input.productIds !== undefined) {
      await replaceTariffProducts(
        conn,
        ctx.organizationId,
        id,
        input.productIds
      );
    }
    return { id };
  });
}

export async function archiveTariff(db: AppDb, ctx: AuthContext, id: string) {
  requireRoles(ctx, ["director"]);
  const [row] = await db.select().from(tariffs).where(eq(tariffs.id, id)).limit(1);
  if (!row || row.organizationId !== ctx.organizationId) throw notFound();
  await db
    .update(tariffs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(tariffs.id, id));
  return { ok: true };
}

export type AssignTariffInput = {
  studentId: string;
  tariffId: string;
  startsAt?: string;
  /** Если не задано — startsAt + durationDays тарифа */
  endsAt?: string;
  /**
   * purchase — назначить тариф для будущей оплаты: только purchaseTariffId, без платежа.
   * enqueue — явное создание заявки на оплату (назначение + payments.pending).
   * Обычное назначение в Дирекции должно использовать purchase.
   */
  mode?: "purchase" | "enqueue";
  reason?: string;
};

function isUniqueViolation(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  return code === "23505" || /unique|duplicate key/i.test(message);
}

async function loadOrgStudent(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!student) throw notFound("Ученик не найден");
  return student;
}

async function loadOrgTariff(db: AppDb, ctx: AuthContext, tariffId: string) {
  const [tariff] = await db
    .select()
    .from(tariffs)
    .where(
      and(
        eq(tariffs.id, tariffId),
        eq(tariffs.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!tariff) throw notFound("Тариф не найден");
  if (tariff.status !== "active") {
    throw badRequest("Нельзя назначить архивный тариф");
  }
  if (!tariff.lessonsLimit || tariff.lessonsLimit < 1) {
    throw badRequest("У тарифа не задано количество занятий");
  }
  return tariff;
}

async function findPendingPayment(
  db: AppDb,
  organizationId: string,
  studentId: string
) {
  const [row] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.studentId, studentId),
        eq(payments.status, "pending")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function setStudentPurchaseTariff(
  db: AppDb,
  ctx: AuthContext,
  input: { studentId: string; tariffId: string; reason?: string }
) {
  requireRoles(ctx, ["director"]);
  const student = await loadOrgStudent(db, ctx, input.studentId);
  const tariff = await loadOrgTariff(db, ctx, input.tariffId);
  const previousId = student.purchaseTariffId ?? null;
  await db
    .update(students)
    .set({ purchaseTariffId: tariff.id, updatedAt: new Date() })
    .where(eq(students.id, student.id));
  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "student_purchase_tariff_set",
    entityType: "student",
    entityId: student.id,
    payload: {
      fromTariffId: previousId,
      toTariffId: tariff.id,
      reason: input.reason?.trim() || null,
    },
  });
  return { purchaseTariffId: tariff.id, fromTariffId: previousId };
}

export async function assignTariffToStudent(
  db: AppDb,
  ctx: AuthContext,
  input: AssignTariffInput
) {
  requireRoles(ctx, ["director"]);
  if (input.mode === "purchase") {
    const set = await setStudentPurchaseTariff(db, ctx, {
      studentId: input.studentId,
      tariffId: input.tariffId,
      reason: input.reason,
    });
    return { id: null as string | null, paymentId: null as string | null, ...set };
  }

  const student = await loadOrgStudent(db, ctx, input.studentId);
  const tariff = await loadOrgTariff(db, ctx, input.tariffId);

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startsAt.getTime() + tariff.durationDays * 86_400_000);
  if (!(endsAt > startsAt)) throw validationError("Некорректный период");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from students where id = ${student.id} for update`
    );
    const pendingPay = await findPendingPayment(
      tx as unknown as AppDb,
      ctx.organizationId,
      student.id
    );
    if (pendingPay) {
      throw conflict(
        "У ученика уже есть заявка на оплату на проверке. Подтвердите или отклоните её в разделе «Доходы», затем назначьте новый тариф."
      );
    }

    const id = newId("sta");
    await tx.insert(studentTariffAssignments).values({
      id,
      organizationId: ctx.organizationId,
      studentId: student.id,
      tariffId: tariff.id,
      startsAt,
      endsAt,
      priceSnapshot: tariff.price,
      currency: "RUB",
      status: "pending_payment",
      paymentStatus: "unpaid",
      lessonsLimitSnapshot: tariff.lessonsLimit,
      weeklyFrequencySnapshot: tariff.weeklyFrequency,
      durationDaysSnapshot: tariff.durationDays,
      tariffNameSnapshot: tariff.name,
    });

    const paymentId = newId("pay");
    await tx.insert(payments).values({
      id: paymentId,
      organizationId: ctx.organizationId,
      studentId: student.id,
      assignmentId: id,
      amount: tariff.price,
      currency: "RUB",
      status: "pending",
      provider: "stub",
      idempotencyKey: `assign:${id}`,
      metadata: { source: "director_assign" },
    });

    await tx
      .update(students)
      .set({ purchaseTariffId: tariff.id, updatedAt: new Date() })
      .where(eq(students.id, student.id));

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "tariff_assignment_enqueued",
      entityType: "student_tariff_assignment",
      entityId: id,
      payload: {
        studentId: student.id,
        tariffId: tariff.id,
        fromTariffId: student.purchaseTariffId ?? null,
        reason: input.reason?.trim() || null,
        mode: "enqueue",
      },
    });

    return { id, paymentId };
  });
}

export async function listPayments(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, ctx.organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(200);
  return rows.map((p) => ({
    id: p.id,
    studentId: p.studentId,
    assignmentId: p.assignmentId,
    amount: Number(p.amount),
    currency: "RUB" as const,
    status: p.status,
    provider: p.provider,
    externalId: p.externalId ?? undefined,
    paidAt: p.paidAt?.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));
}

function checkoutResult(input: {
  paymentId: string;
  assignmentId: string;
  status: string;
  alreadyPending: boolean;
  tariffName: string;
  price: number;
  lessonsLimit: number | null;
  includesText: string | null;
}) {
  return {
    paymentId: input.paymentId,
    assignmentId: input.assignmentId,
    status: input.status,
    alreadyPending: input.alreadyPending,
    checkoutUrl: TOCHKA_CHECKOUT_URL,
    returnPath: STUDENT_CHECKOUT_RETURN_PATH,
    message: input.alreadyPending
      ? "Заявка уже на проверке. Дождитесь решения администрации."
      : MANUAL_REVIEW_WARNING,
    tariff: {
      name: input.tariffName,
      price: input.price,
      lessonsLimit: input.lessonsLimit,
      includesText: input.includesText,
    },
  };
}

/**
 * Ручная фиксация оплаты администратором (не для ученика).
 * Не подтверждает банк: только после проверки поступления денег.
 * Если текущий пакет ещё действует (остаток ≥ 0), новый встаёт в очередь.
 */
export async function adminMarkPaymentPaid(
  db: AppDb,
  ctx: AuthContext,
  input: { paymentId: string; reason: string }
) {
  requireRoles(ctx, ["director"]);
  const reason = input.reason.trim();
  if (reason.length < 3) throw validationError("Укажите причину");

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
    if (pay.status === "rejected") {
      throw badRequest("Отклонённую заявку нельзя подтвердить");
    }
    if (pay.status === "paid") return { ok: true, alreadyPaid: true as const };

    await tx.execute(
      sql`select id from student_tariff_assignments where id = ${pay.assignmentId} for update`
    );
    const [asg] = await tx
      .select()
      .from(studentTariffAssignments)
      .where(eq(studentTariffAssignments.id, pay.assignmentId))
      .limit(1);
    if (!asg) throw notFound("Назначение тарифа не найдено");
    if (asg.paymentStatus === "paid") {
      const nowPaid = new Date();
      await tx
        .update(payments)
        .set({
          status: "paid",
          paidAt: pay.paidAt ?? nowPaid,
          provider: "manual",
          metadata: { ...(pay.metadata ?? {}), manualReason: reason },
          updatedAt: nowPaid,
        })
        .where(eq(payments.id, pay.id));
      return { ok: true, alreadyPaid: true as const };
    }

    await tx.execute(
      sql`select id from students where id = ${pay.studentId} for update`
    );

    const current = await findDebitAssignment(
      tx as unknown as AppDb,
      ctx.organizationId,
      pay.studentId
    );
    let currentRemaining: number | null = null;
    if (current && current.id !== asg.id) {
      const { getAssignmentBalance } = await import(
        "@/server/services/lesson-balance"
      );
      const bal = await getAssignmentBalance(
        tx as unknown as AppDb,
        current.id,
        current.lessonsLimitSnapshot
      );
      currentRemaining = bal.remaining;
    }

    const activate = shouldActivatePaidAssignment(
      currentRemaining,
      Boolean(current && current.id !== asg.id)
    );

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: "paid",
        paidAt: now,
        provider: "manual",
        metadata: { ...(pay.metadata ?? {}), manualReason: reason },
        updatedAt: now,
      })
      .where(eq(payments.id, pay.id));

    if (activate) {
      if (current && current.id !== asg.id) {
        await tx
          .update(studentTariffAssignments)
          .set({ status: "expired", updatedAt: now })
          .where(eq(studentTariffAssignments.id, current.id));
      }
      await tx
        .update(studentTariffAssignments)
        .set({
          status: "active",
          paymentStatus: "paid",
          updatedAt: now,
        })
        .where(eq(studentTariffAssignments.id, asg.id));
    } else {
      await tx
        .update(studentTariffAssignments)
        .set({
          status: "queued",
          paymentStatus: "paid",
          updatedAt: now,
        })
        .where(eq(studentTariffAssignments.id, asg.id));
    }

    const settled = activate
      ? await settleDebtOnNewAssignment(
          tx as unknown as AppDb,
          ctx,
          pay.studentId,
          asg.id
        )
      : { settled: false, previousRemaining: currentRemaining };

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "payment_manual_paid",
      entityType: "payment",
      entityId: pay.id,
      payload: {
        reason,
        assignmentId: pay.assignmentId,
        queued: !activate,
        debtSettled: settled.settled,
        previousRemaining: settled.previousRemaining,
      },
    });

    return {
      ok: true,
      alreadyPaid: false as const,
      queued: !activate,
      debtSettled: settled.settled,
    };
  });
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
    if (pay.status === "rejected") {
      return { ok: true, alreadyRejected: true as const };
    }
    if (pay.status === "paid") {
      throw badRequest("Подтверждённую оплату нельзя отклонить");
    }

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: "rejected",
        failureReason: reason || "Отклонено администратором",
        updatedAt: now,
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(studentTariffAssignments)
      .set({
        status: "cancelled",
        paymentStatus: "unpaid",
        updatedAt: now,
      })
      .where(eq(studentTariffAssignments.id, pay.assignmentId));

    await tx.insert(auditLog).values({
      id: newId("audit"),
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "payment_rejected",
      entityType: "payment",
      entityId: pay.id,
      payload: {
        reason: reason || null,
        assignmentId: pay.assignmentId,
        studentId: pay.studentId,
      },
    });

    return { ok: true, alreadyRejected: false as const };
  });
}

async function checkoutPayloadForPayment(
  db: AppDb,
  ctx: AuthContext,
  payment: typeof payments.$inferSelect,
  alreadyPending: boolean
) {
  const [asg] = await db
    .select()
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.id, payment.assignmentId))
    .limit(1);
  const [tariff] = asg
    ? await db.select().from(tariffs).where(eq(tariffs.id, asg.tariffId)).limit(1)
    : [];
  return checkoutResult({
    paymentId: payment.id,
    assignmentId: payment.assignmentId,
    status: payment.status,
    alreadyPending,
    tariffName: asg?.tariffNameSnapshot ?? tariff?.name ?? "Тариф",
    price: Number(asg?.priceSnapshot ?? payment.amount),
    lessonsLimit: asg?.lessonsLimitSnapshot ?? tariff?.lessonsLimit ?? null,
    includesText: tariff?.includesText ?? null,
  });
}

/**
 * Ученик инициирует оплату назначенного для покупки тарифа.
 * Не доверяет цене/тарифу/ученику с клиента. Не подтверждает платёж.
 */
export async function studentStartCheckout(db: AppDb, ctx: AuthContext) {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden();
  const studentId = ctx.studentId;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from students where id = ${studentId} for update`
      );
      const pending = await findPendingPayment(
        tx as unknown as AppDb,
        ctx.organizationId,
        studentId
      );
      if (pending) {
        return checkoutPayloadForPayment(
          tx as unknown as AppDb,
          ctx,
          pending,
          true
        );
      }

      const [student] = await tx
        .select()
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!student) throw notFound("Ученик не найден");

      const unpaid = await tx
        .select()
        .from(studentTariffAssignments)
        .where(
          and(
            eq(studentTariffAssignments.organizationId, ctx.organizationId),
            eq(studentTariffAssignments.studentId, studentId),
            eq(studentTariffAssignments.status, "pending_payment"),
            eq(studentTariffAssignments.paymentStatus, "unpaid")
          )
        )
        .orderBy(desc(studentTariffAssignments.createdAt))
        .limit(1);

      let assignment = unpaid[0] ?? null;
      if (!assignment) {
        const tariffId = student.purchaseTariffId;
        if (!tariffId) {
          throw badRequest(
            "Администратор ещё не назначил тариф для оплаты. Обратитесь к куратору."
          );
        }
        const tariff = await loadOrgTariff(
          tx as unknown as AppDb,
          ctx,
          tariffId
        );
        const startsAt = new Date();
        const endsAt = new Date(
          startsAt.getTime() + tariff.durationDays * 86_400_000
        );
        const id = newId("sta");
        await tx.insert(studentTariffAssignments).values({
          id,
          organizationId: ctx.organizationId,
          studentId,
          tariffId: tariff.id,
          startsAt,
          endsAt,
          priceSnapshot: tariff.price,
          currency: "RUB",
          status: "pending_payment",
          paymentStatus: "unpaid",
          lessonsLimitSnapshot: tariff.lessonsLimit,
          weeklyFrequencySnapshot: tariff.weeklyFrequency,
          durationDaysSnapshot: tariff.durationDays,
          tariffNameSnapshot: tariff.name,
        });
        const [created] = await tx
          .select()
          .from(studentTariffAssignments)
          .where(eq(studentTariffAssignments.id, id))
          .limit(1);
        assignment = created!;
      }

      const paymentId = newId("pay");
      await tx.insert(payments).values({
        id: paymentId,
        organizationId: ctx.organizationId,
        studentId,
        assignmentId: assignment.id,
        amount: assignment.priceSnapshot,
        currency: "RUB",
        status: "pending",
        provider: "tochka_link",
        idempotencyKey: `review:${studentId}:${assignment.id}`,
        metadata: { source: "student_checkout", autoConfirmed: false },
      });
      const [createdPay] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

      return checkoutPayloadForPayment(
        tx as unknown as AppDb,
        ctx,
        createdPay!,
        false
      );
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const pending = await findPendingPayment(
      db,
      ctx.organizationId,
      studentId
    );
    if (!pending) throw err;
    return checkoutPayloadForPayment(db, ctx, pending, true);
  }
}

/** Совместимость: ученик не выбирает чужой тариф, только свой checkout. */
export async function studentRequestPayment(
  db: AppDb,
  ctx: AuthContext,
  assignmentId?: string
) {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden();
  if (assignmentId) {
    const [asg] = await db
      .select({ id: studentTariffAssignments.id })
      .from(studentTariffAssignments)
      .where(
        and(
          eq(studentTariffAssignments.id, assignmentId),
          eq(studentTariffAssignments.organizationId, ctx.organizationId),
          eq(studentTariffAssignments.studentId, ctx.studentId)
        )
      )
      .limit(1);
    if (!asg) throw notFound("Назначение тарифа не найдено");
  }
  return studentStartCheckout(db, ctx);
}

/**
 * Прогнозируемая дата окончания больше не сжигает пакет.
 * Статус expired выставляется только при замене назначения.
 */
export async function refreshExpiredAssignments(
  db: AppDb,
  organizationId: string
) {
  void db;
  void organizationId;
}
