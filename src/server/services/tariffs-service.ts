import { and, count, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
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
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";
import { getPaymentProvider } from "@/server/payments/provider";
import type {
  TariffAssignmentStatus,
  TariffFeatureKey,
  TariffStatus,
} from "@/lib/types";

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
  includesText?: string | null;
  features?: string[];
  status?: TariffStatus;
  adminNotes?: string | null;
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

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    currency: "RUB" as const,
    durationDays: t.durationDays,
    lessonsLimit: t.lessonsLimit ?? undefined,
    includesText: t.includesText ?? undefined,
    features: (t.features as TariffFeatureKey[]) ?? [],
    status: t.status as TariffStatus,
    adminNotes: t.adminNotes ?? undefined,
    assignedCount: countMap.get(t.id) ?? 0,
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
    throw validationError("Срок действия — не менее 1 дня");
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
    lessonsLimit: input.lessonsLimit ?? null,
    includesText: input.includesText?.trim() || null,
    features,
    status: (input.status ?? "active") as TariffStatus,
    adminNotes: input.adminNotes?.trim() || null,
    updatedAt: new Date(),
  };

  if (existing) {
    if (existing.organizationId !== ctx.organizationId) throw forbidden();
    await db.update(tariffs).set(values).where(eq(tariffs.id, id));
  } else {
    await db.insert(tariffs).values({ ...values, createdAt: new Date() });
  }
  return { id };
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
};

export async function assignTariffToStudent(
  db: AppDb,
  ctx: AuthContext,
  input: AssignTariffInput
) {
  requireRoles(ctx, ["director"]);
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

  const [tariff] = await db
    .select()
    .from(tariffs)
    .where(
      and(
        eq(tariffs.id, input.tariffId),
        eq(tariffs.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!tariff) throw notFound("Тариф не найден");
  if (tariff.status !== "active") {
    throw badRequest("Нельзя назначить архивный тариф");
  }

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startsAt.getTime() + tariff.durationDays * 86_400_000);
  if (!(endsAt > startsAt)) throw validationError("Некорректный период");

  // Предыдущие active → expired (история сохраняется)
  await db
    .update(studentTariffAssignments)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(studentTariffAssignments.studentId, student.id),
        eq(studentTariffAssignments.organizationId, ctx.organizationId),
        inArray(studentTariffAssignments.status, [
          "active",
          "pending_payment",
          "paused",
        ])
      )
    );

  const id = newId("sta");
  await db.insert(studentTariffAssignments).values({
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
  });

  // Создаём ожидающий платёж (идемпотентный ключ на назначение)
  const paymentId = newId("pay");
  await db.insert(payments).values({
    id: paymentId,
    organizationId: ctx.organizationId,
    studentId: student.id,
    assignmentId: id,
    amount: tariff.price,
    currency: "RUB",
    status: "pending",
    provider: "stub",
    idempotencyKey: `assign:${id}`,
  });

  return { id, paymentId };
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

/**
 * Ручная фиксация оплаты администратором (не для ученика).
 * Журналируется в audit_log.
 */
export async function adminMarkPaymentPaid(
  db: AppDb,
  ctx: AuthContext,
  input: { paymentId: string; reason: string }
) {
  requireRoles(ctx, ["director"]);
  const reason = input.reason.trim();
  if (reason.length < 3) throw validationError("Укажите причину");

  const [pay] = await db
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
  if (pay.status === "paid") return { ok: true, alreadyPaid: true };

  const now = new Date();
  await db
    .update(payments)
    .set({
      status: "paid",
      paidAt: now,
      provider: "manual",
      metadata: { ...(pay.metadata ?? {}), manualReason: reason },
      updatedAt: now,
    })
    .where(eq(payments.id, pay.id));

  await db
    .update(studentTariffAssignments)
    .set({
      status: "active",
      paymentStatus: "paid",
      updatedAt: now,
    })
    .where(eq(studentTariffAssignments.id, pay.assignmentId));

  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "payment_manual_paid",
    entityType: "payment",
    entityId: pay.id,
    payload: { reason, assignmentId: pay.assignmentId },
  });

  return { ok: true, alreadyPaid: false };
}

/** Ученик запрашивает оплату — создаёт/возвращает pending без подтверждения успеха. */
export async function studentRequestPayment(
  db: AppDb,
  ctx: AuthContext,
  assignmentId: string
) {
  requireRoles(ctx, ["student"]);
  if (!ctx.studentId) throw forbidden();

  const [asg] = await db
    .select()
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

  const idempotencyKey = `checkout:${assignmentId}`;
  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, ctx.organizationId),
        eq(payments.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  let payment = existing;
  if (!payment) {
    const id = newId("pay");
    await db.insert(payments).values({
      id,
      organizationId: ctx.organizationId,
      studentId: ctx.studentId,
      assignmentId,
      amount: asg.priceSnapshot,
      currency: "RUB",
      status: "pending",
      provider: "stub",
      idempotencyKey,
    });
    const [created] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    payment = created!;
  }

  if (payment.status === "paid") {
    return {
      paymentId: payment.id,
      status: payment.status,
      checkoutUrl: null as string | null,
      message: "Уже оплачено",
    };
  }

  const provider = getPaymentProvider();
  const intent = await provider.createPaymentIntent({
    paymentId: payment.id,
    amount: Number(payment.amount),
    currency: "RUB",
    description: `Оплата тарифа ${assignmentId}`,
  });

  return {
    paymentId: payment.id,
    status: payment.status,
    checkoutUrl: intent.checkoutUrl,
    message: intent.message ?? "Оплата скоро появится",
  };
}

export async function refreshExpiredAssignments(db: AppDb, organizationId: string) {
  const now = new Date();
  const active = await db
    .select({
      id: studentTariffAssignments.id,
      endsAt: studentTariffAssignments.endsAt,
    })
    .from(studentTariffAssignments)
    .where(
      and(
        eq(studentTariffAssignments.organizationId, organizationId),
        inArray(studentTariffAssignments.status, ["active", "pending_payment"])
      )
    );
  for (const a of active) {
    if (a.endsAt <= now) {
      await db
        .update(studentTariffAssignments)
        .set({ status: "expired" as TariffAssignmentStatus, updatedAt: now })
        .where(eq(studentTariffAssignments.id, a.id));
    }
  }
}
