/**
 * Помощники для заливки lesson_orders + ledger purchase в seed-скриптах.
 * Не вызывает платёжного провайдера.
 */
import { eq } from "drizzle-orm";

import * as t from "@/server/db/schema";

type DbLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (...args: any[]) => any;
};

export type SeedPaidOrderInput = {
  orderId: string;
  organizationId: string;
  studentId: string;
  payerUserId: string;
  tariffId: string;
  optionId: string;
  directionId: string;
  tariffName: string;
  lessonsCount: number;
  totalAmount: string;
  features?: string[];
  productIds?: string[];
  paidAt: Date;
  paymentId: string;
  paymentProvider?: string;
  ledgerId?: string;
};

export type SeedPendingOrderInput = {
  orderId: string;
  organizationId: string;
  studentId: string;
  payerUserId: string;
  tariffId: string;
  optionId: string;
  directionId: string;
  tariffName: string;
  lessonsCount: number;
  totalAmount: string;
  features?: string[];
  productIds?: string[];
  createdAt: Date;
  paymentId: string;
  paymentStatus?: "pending" | "failed";
  paymentProvider?: string;
  failureReason?: string | null;
};

export async function upsertTariffPurchaseOption(
  db: DbLike,
  input: {
    id: string;
    organizationId: string;
    tariffId: string;
    lessonsCount: number;
    totalPrice: string;
    sortOrder?: number;
    createdAt?: Date;
  }
) {
  const now = input.createdAt ?? new Date();
  await db
    .insert(t.tariffPurchaseOptions)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      tariffId: input.tariffId,
      lessonsCount: input.lessonsCount,
      totalPrice: input.totalPrice,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function insertPaidLessonOrder(
  db: DbLike,
  input: SeedPaidOrderInput
) {
  const ledgerId = input.ledgerId ?? `sll_${input.orderId}`;
  const unitPrice = (Number(input.totalAmount) / input.lessonsCount).toFixed(2);
  const now = input.paidAt;
  await db.insert(t.lessonOrders).values({
    id: input.orderId,
    organizationId: input.organizationId,
    payerUserId: input.payerUserId,
    studentId: input.studentId,
    tariffId: input.tariffId,
    optionId: input.optionId,
    directionId: input.directionId,
    tariffNameSnapshot: input.tariffName,
    lessonsCount: input.lessonsCount,
    totalAmount: input.totalAmount,
    unitPrice,
    currency: "RUB",
    featuresSnapshot: input.features ?? [],
    productIdsSnapshot: input.productIds ?? [],
    status: "paid",
    paidAt: now,
    creditedAt: null,
    creditLedgerEntryId: null,
    accessRevoked: false,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(t.studentLessonLedger).values({
    id: ledgerId,
    organizationId: input.organizationId,
    studentId: input.studentId,
    directionId: input.directionId,
    delta: input.lessonsCount,
    reason: "purchase",
    orderId: input.orderId,
    createdAt: now,
  });
  await db
    .update(t.lessonOrders)
    .set({
      creditLedgerEntryId: ledgerId,
      creditedAt: now,
      updatedAt: now,
    })
    .where(eq(t.lessonOrders.id, input.orderId));
  await db.insert(t.payments).values({
    id: input.paymentId,
    organizationId: input.organizationId,
    studentId: input.studentId,
    orderId: input.orderId,
    amount: input.totalAmount,
    currency: "RUB",
    status: "paid",
    provider: input.paymentProvider ?? "stub",
    idempotencyKey: `seed:${input.paymentId}`,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export async function insertPendingLessonOrder(
  db: DbLike,
  input: SeedPendingOrderInput
) {
  const unitPrice = (Number(input.totalAmount) / input.lessonsCount).toFixed(2);
  const status = input.paymentStatus ?? "pending";
  await db.insert(t.lessonOrders).values({
    id: input.orderId,
    organizationId: input.organizationId,
    payerUserId: input.payerUserId,
    studentId: input.studentId,
    tariffId: input.tariffId,
    optionId: input.optionId,
    directionId: input.directionId,
    tariffNameSnapshot: input.tariffName,
    lessonsCount: input.lessonsCount,
    totalAmount: input.totalAmount,
    unitPrice,
    currency: "RUB",
    featuresSnapshot: input.features ?? [],
    productIdsSnapshot: input.productIds ?? [],
    status: "awaiting_payment",
    accessRevoked: false,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  await db.insert(t.payments).values({
    id: input.paymentId,
    organizationId: input.organizationId,
    studentId: input.studentId,
    orderId: input.orderId,
    amount: input.totalAmount,
    currency: "RUB",
    status,
    provider: input.paymentProvider ?? "stub",
    idempotencyKey: `seed:${input.paymentId}`,
    failureReason: input.failureReason ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export async function insertCancelledLessonOrder(
  db: DbLike,
  input: {
    orderId: string;
    organizationId: string;
    studentId: string;
    payerUserId: string;
    tariffId: string;
    optionId: string;
    directionId: string;
    tariffName: string;
    lessonsCount: number;
    totalAmount: string;
    features?: string[];
    productIds?: string[];
    createdAt: Date;
    paymentId: string;
    paymentStatus: "failed" | "cancelled";
    failureReason?: string | null;
  }
) {
  const unitPrice = (Number(input.totalAmount) / input.lessonsCount).toFixed(2);
  await db.insert(t.lessonOrders).values({
    id: input.orderId,
    organizationId: input.organizationId,
    payerUserId: input.payerUserId,
    studentId: input.studentId,
    tariffId: input.tariffId,
    optionId: input.optionId,
    directionId: input.directionId,
    tariffNameSnapshot: input.tariffName,
    lessonsCount: input.lessonsCount,
    totalAmount: input.totalAmount,
    unitPrice,
    currency: "RUB",
    featuresSnapshot: input.features ?? [],
    productIdsSnapshot: input.productIds ?? [],
    status: "cancelled",
    accessRevoked: true,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  await db.insert(t.payments).values({
    id: input.paymentId,
    organizationId: input.organizationId,
    studentId: input.studentId,
    orderId: input.orderId,
    amount: input.totalAmount,
    currency: "RUB",
    status: input.paymentStatus,
    provider: "stub",
    idempotencyKey: `seed:${input.paymentId}`,
    failureReason: input.failureReason ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}