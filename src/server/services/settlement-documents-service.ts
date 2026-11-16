import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  buildSettlementRequisiteSnapshot,
  settlementServiceName,
} from "@/lib/settlements/requisites";
import type { AuthContext } from "@/server/authz/context";
import {
  lessonOrders,
  payments,
  settlementDocuments,
  students,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden, notFound, validationError } from "@/server/errors";
import {
  deleteSettlementPdf,
  getSettlementPdf,
  putSettlementPdf,
  settlementObjectKey,
} from "@/server/media/settlement-storage";
import { renderSettlementPdf } from "@/server/settlements/render-settlement-pdf";

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

export type SettlementDocumentKind = "income" | "income_return";

export type SettlementDocumentRow =
  typeof settlementDocuments.$inferSelect;

async function findByPaymentKind(
  db: AppDb,
  paymentId: string,
  kind: SettlementDocumentKind
): Promise<SettlementDocumentRow | null> {
  const [row] = await db
    .select()
    .from(settlementDocuments)
    .where(
      and(
        eq(settlementDocuments.paymentId, paymentId),
        eq(settlementDocuments.kind, kind)
      )
    )
    .limit(1);
  return row ?? null;
}

function readReturningLastNumber(result: unknown): number | null {
  if (result == null) return null;
  if (Array.isArray(result)) {
    const first = result[0] as
      | { last_number?: number | string; lastNumber?: number | string }
      | undefined;
    const raw = first?.last_number ?? first?.lastNumber;
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
    return null;
  }
  if (typeof result === "object") {
    const withRows = result as {
      rows?: Array<{ last_number?: number | string; lastNumber?: number | string }>;
    };
    const row = withRows.rows?.[0];
    const raw = row?.last_number ?? row?.lastNumber;
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  }
  return null;
}

async function allocateSequentialNumber(
  db: AppDb,
  organizationId: string
): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO settlement_document_counters (organization_id, last_number, updated_at)
    VALUES (${organizationId}, 1, now())
    ON CONFLICT (organization_id)
    DO UPDATE SET
      last_number = settlement_document_counters.last_number + 1,
      updated_at = now()
    RETURNING last_number
  `);
  const n = readReturningLastNumber(result);
  if (n != null) return n;
  throw new Error("Не удалось выделить номер расчётного документа");
}

async function insertDocumentIdempotent(
  db: AppDb,
  values: typeof settlementDocuments.$inferInsert,
  kind: SettlementDocumentKind
): Promise<SettlementDocumentRow> {
  try {
    await db.insert(settlementDocuments).values(values);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await deleteSettlementPdf(values.pdfStorageKey).catch(() => undefined);
    const existing = await findByPaymentKind(db, values.paymentId, kind);
    if (existing) return existing;
    throw err;
  }
  const [row] = await db
    .select()
    .from(settlementDocuments)
    .where(eq(settlementDocuments.id, values.id))
    .limit(1);
  if (!row) throw new Error("Не удалось сохранить расчётный документ");
  return row;
}

/**
 * Создаёт PDF «приход» после подтверждённой оплаты.
 * Идемпотентно: повторный webhook / alreadyPaid не создают дубль.
 */
export async function ensureIncomeSettlementDocument(
  db: AppDb,
  input: { paymentId: string; organizationId: string }
): Promise<SettlementDocumentRow> {
  const existing = await findByPaymentKind(db, input.paymentId, "income");
  if (existing) return existing;

  const [pay] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.organizationId, input.organizationId)
      )
    )
    .limit(1);
  if (!pay) throw notFound("Платёж не найден");
  if (pay.status !== "paid" && pay.status !== "refunded") {
    throw validationError(
      "Документ прихода создаётся только после подтверждённой оплаты"
    );
  }

  const [order] = await db
    .select()
    .from(lessonOrders)
    .where(eq(lessonOrders.id, pay.orderId))
    .limit(1);
  if (!order) throw notFound("Заказ не найден");

  const requisites = buildSettlementRequisiteSnapshot();
  const serviceName = settlementServiceName(
    order.tariffNameSnapshot,
    order.lessonsCount
  );
  const issuedAt = pay.paidAt ?? new Date();
  const amount = Number(pay.amount);
  const docId = newId("sdoc");
  const storageKey = settlementObjectKey(input.organizationId, docId);

  const sequentialNumber = await allocateSequentialNumber(
    db,
    input.organizationId
  );

  const { bytes, sha256 } = await renderSettlementPdf({
    documentTitle: "Документ, подтверждающий расчёт",
    sequentialNumber,
    issuedAt,
    settlementSign: "приход",
    operatorLegalName: requisites.operatorLegalName,
    operatorFio: requisites.operatorFio,
    inn: requisites.inn,
    ogrnip: requisites.ogrnip,
    taxSystem: requisites.taxSystem,
    siteUrl: requisites.siteUrl,
    serviceName,
    amount,
    currency: pay.currency || "RUB",
    vatNote: requisites.vatNote,
    paymentForm: requisites.paymentForm,
    settlerPosition: requisites.settlerPosition,
    settlerSurname: requisites.settlerSurname,
  });

  await putSettlementPdf(storageKey, bytes);

  return insertDocumentIdempotent(
    db,
    {
      id: docId,
      organizationId: input.organizationId,
      kind: "income",
      sequentialNumber,
      issuedAt,
      paymentId: pay.id,
      orderId: order.id,
      originalDocumentId: null,
      amount: String(amount),
      currency: pay.currency || "RUB",
      vatNote: requisites.vatNote,
      paymentForm: requisites.paymentForm,
      settlementSign: "приход",
      serviceNameSnapshot: serviceName,
      siteUrlSnapshot: requisites.siteUrl,
      operatorLegalNameSnapshot: requisites.operatorLegalName,
      operatorFioSnapshot: requisites.operatorFio,
      innSnapshot: requisites.inn,
      ogrnipSnapshot: requisites.ogrnip,
      taxSystemSnapshot: requisites.taxSystem,
      settlerPositionSnapshot: requisites.settlerPosition,
      settlerSurnameSnapshot: requisites.settlerSurname,
      pdfStorageKey: storageKey,
      pdfSha256: sha256,
      createdAt: new Date(),
    },
    "income"
  );
}

/**
 * Создаёт PDF «возврат прихода» после подтверждённого полного возврата.
 */
export async function ensureIncomeReturnSettlementDocument(
  db: AppDb,
  input: { paymentId: string; organizationId: string }
): Promise<SettlementDocumentRow> {
  const existing = await findByPaymentKind(db, input.paymentId, "income_return");
  if (existing) return existing;

  const [pay] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, input.paymentId),
        eq(payments.organizationId, input.organizationId)
      )
    )
    .limit(1);
  if (!pay) throw notFound("Платёж не найден");
  if (pay.status !== "refunded") {
    throw validationError(
      "Документ возврата создаётся только после подтверждённого возврата"
    );
  }

  const income =
    (await findByPaymentKind(db, input.paymentId, "income")) ??
    (await ensureIncomeSettlementDocument(db, input));

  const [order] = await db
    .select()
    .from(lessonOrders)
    .where(eq(lessonOrders.id, pay.orderId))
    .limit(1);
  if (!order) throw notFound("Заказ не найден");

  const requisites = buildSettlementRequisiteSnapshot();
  const serviceName = settlementServiceName(
    order.tariffNameSnapshot,
    order.lessonsCount
  );
  const issuedAt = new Date();
  const amount = Number(pay.amount);
  const docId = newId("sdoc");
  const storageKey = settlementObjectKey(input.organizationId, docId);

  const sequentialNumber = await allocateSequentialNumber(
    db,
    input.organizationId
  );

  const { bytes, sha256 } = await renderSettlementPdf({
    documentTitle: "Документ, подтверждающий расчёт",
    sequentialNumber,
    issuedAt,
    settlementSign: "возврат прихода",
    operatorLegalName: requisites.operatorLegalName,
    operatorFio: requisites.operatorFio,
    inn: requisites.inn,
    ogrnip: requisites.ogrnip,
    taxSystem: requisites.taxSystem,
    siteUrl: requisites.siteUrl,
    serviceName,
    amount,
    currency: pay.currency || "RUB",
    vatNote: requisites.vatNote,
    paymentForm: requisites.paymentForm,
    settlerPosition: requisites.settlerPosition,
    settlerSurname: requisites.settlerSurname,
    originalSequentialNumber: income.sequentialNumber,
  });

  await putSettlementPdf(storageKey, bytes);

  return insertDocumentIdempotent(
    db,
    {
      id: docId,
      organizationId: input.organizationId,
      kind: "income_return",
      sequentialNumber,
      issuedAt,
      paymentId: pay.id,
      orderId: order.id,
      originalDocumentId: income.id,
      amount: String(amount),
      currency: pay.currency || "RUB",
      vatNote: requisites.vatNote,
      paymentForm: requisites.paymentForm,
      settlementSign: "возврат прихода",
      serviceNameSnapshot: serviceName,
      siteUrlSnapshot: requisites.siteUrl,
      operatorLegalNameSnapshot: requisites.operatorLegalName,
      operatorFioSnapshot: requisites.operatorFio,
      innSnapshot: requisites.inn,
      ogrnipSnapshot: requisites.ogrnip,
      taxSystemSnapshot: requisites.taxSystem,
      settlerPositionSnapshot: requisites.settlerPosition,
      settlerSurnameSnapshot: requisites.settlerSurname,
      pdfStorageKey: storageKey,
      pdfSha256: sha256,
      createdAt: new Date(),
    },
    "income_return"
  );
}

/** Безопасный вызов после оплаты: ошибки логируются, платёж не откатывается. */
export async function safeEnsureIncomeSettlementDocument(
  db: AppDb,
  input: { paymentId: string; organizationId: string }
): Promise<SettlementDocumentRow | null> {
  try {
    return await ensureIncomeSettlementDocument(db, input);
  } catch (err) {
    console.error("settlement income PDF failed", {
      paymentId: input.paymentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function safeEnsureIncomeReturnSettlementDocument(
  db: AppDb,
  input: { paymentId: string; organizationId: string }
): Promise<SettlementDocumentRow | null> {
  try {
    return await ensureIncomeReturnSettlementDocument(db, input);
  } catch (err) {
    console.error("settlement return PDF failed", {
      paymentId: input.paymentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function assertCanAccessSettlementDocument(
  db: AppDb,
  ctx: AuthContext,
  doc: SettlementDocumentRow
): Promise<void> {
  if (doc.organizationId !== ctx.organizationId) throw forbidden();

  if (ctx.role === "director") return;

  const [order] = await db
    .select()
    .from(lessonOrders)
    .where(eq(lessonOrders.id, doc.orderId))
    .limit(1);
  if (!order) throw notFound("Заказ не найден");

  if (order.payerUserId === ctx.userId) return;

  if (ctx.role === "student" && ctx.studentId) {
    if (order.studentId === ctx.studentId) return;
    const [mine] = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.id, order.studentId),
          eq(students.userId, ctx.userId),
          eq(students.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (mine) return;
  }

  throw forbidden();
}

export async function getSettlementDocumentForDownload(
  db: AppDb,
  ctx: AuthContext,
  documentId: string
): Promise<{
  document: SettlementDocumentRow;
  bytes: Buffer;
  fileName: string;
}> {
  const id = documentId?.trim();
  if (!id) throw validationError("Укажите documentId");

  const [doc] = await db
    .select()
    .from(settlementDocuments)
    .where(
      and(
        eq(settlementDocuments.id, id),
        eq(settlementDocuments.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!doc) throw notFound("Документ не найден");

  await assertCanAccessSettlementDocument(db, ctx, doc);

  const bytes = await getSettlementPdf(doc.pdfStorageKey);
  const kindLabel = doc.kind === "income" ? "prihod" : "vozvrat";
  const fileName = `raschet-${kindLabel}-${doc.sequentialNumber}.pdf`;
  return { document: doc, bytes, fileName };
}

export async function listSettlementDocumentsForPayments(
  db: AppDb,
  organizationId: string,
  paymentIds: string[]
): Promise<SettlementDocumentRow[]> {
  if (paymentIds.length === 0) return [];
  return db
    .select()
    .from(settlementDocuments)
    .where(
      and(
        eq(settlementDocuments.organizationId, organizationId),
        inArray(settlementDocuments.paymentId, paymentIds)
      )
    );
}

export function toSettlementDocumentSummary(row: SettlementDocumentRow) {
  return {
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    kind: row.kind as SettlementDocumentKind,
    sequentialNumber: row.sequentialNumber,
    issuedAt: row.issuedAt.toISOString(),
    amount: Number(row.amount),
    serviceName: row.serviceNameSnapshot,
    settlementSign: row.settlementSign,
  };
}
