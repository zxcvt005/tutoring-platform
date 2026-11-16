/**
 * Webhook Точка Банк (acquiring). Без CSRF: вызов только с серверов банка.
 */
import { getDb } from "@/server/db/runtime";
import { verifyTochkaWebhookJwt } from "@/server/payments/tochka-webhook-jwt";
import {
  confirmPaidFromBank,
  findPaymentForWebhook,
} from "@/server/services/lesson-orders-service";

function dig(obj: Record<string, unknown>, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function readWebhookPayment(payload: Record<string, unknown>) {
  const block =
    (dig(payload, "acquiringInternetPayment") as Record<string, unknown>) ??
  (dig(payload, "Data", "acquiringInternetPayment") as Record<string, unknown>) ??
    payload;

  const status = String(block.status ?? "").toUpperCase();
  const operationId =
    (typeof block.operationId === "string" && block.operationId) ||
    (typeof block.operation_id === "string" && block.operation_id) ||
    (typeof payload.operationId === "string" && payload.operationId) ||
    null;
  const paymentLinkId =
    (typeof block.paymentLinkId === "string" && block.paymentLinkId) ||
    (typeof block.payment_link_id === "string" && block.payment_link_id) ||
    null;
  const amountRaw = block.amount ?? block.paymentAmount ?? block.payment_amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim()
        ? Number(amountRaw)
        : null;

  return { status, operationId, paymentLinkId, amount, raw: block };
}

export async function POST(request: Request) {
  const token = await request.text();
  if (!token.trim()) {
    return new Response("empty body", { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await verifyTochkaWebhookJwt<Record<string, unknown>>(token);
    payload = verified.payload;
  } catch {
    return new Response("unauthorized", { status: 401 });
  }

  const event = readWebhookPayment(payload);
  const isPing =
    event.status === "" ||
    event.status === "TEST" ||
    payload.test === true ||
    payload.ping === true;

  if (event.status !== "APPROVED") {
    return new Response(isPing ? "ok" : "ignored", { status: 200 });
  }
  if (!event.operationId && !event.paymentLinkId) {
    return new Response("ok", { status: 200 });
  }
  if (event.amount == null || Number.isNaN(event.amount)) {
    return new Response("bad amount", { status: 400 });
  }

  const db = getDb();
  const pay = await findPaymentForWebhook(db, {
    paymentLinkId: event.paymentLinkId,
    operationId: event.operationId,
  });
  if (!pay) {
    return new Response("payment not found", { status: 200 });
  }

  try {
    await confirmPaidFromBank(
      db,
      { organizationId: pay.organizationId, userId: null },
      {
        paymentId: pay.id,
        operationId: event.operationId ?? pay.externalId ?? undefined,
        amount: event.amount,
        raw: payload,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/не совпадает/i.test(message)) {
      return new Response("amount mismatch", { status: 409 });
    }
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}