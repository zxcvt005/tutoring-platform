import { eq } from "drizzle-orm";

import {
  buildCurrentTariffOverview,
  buildMonthSummaries,
  type CurrentTariffOverview,
  type MonthSummary,
} from "@/lib/income-analytics";
import type { PaymentRecordStatus } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  lessonOrders,
  payments,
  students,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";

export type IncomeOverview = {
  months: MonthSummary[];
  current: CurrentTariffOverview;
};

function mapPaymentStatus(status: string): PaymentRecordStatus {
  if (status === "rejected") return "cancelled";
  return status as PaymentRecordStatus;
}

function paymentRowsForAnalytics(
  paymentRows: (typeof payments.$inferSelect)[],
  orderById: Map<string, typeof lessonOrders.$inferSelect>
) {
  return paymentRows
    .filter((p) => p.status === "paid" || p.status === "refunded" || p.status === "pending")
    .map((p) => {
      const order = orderById.get(p.orderId);
      const signedAmount =
        p.status === "refunded" ? -Number(p.amount) : Number(p.amount);
      const eventAt =
        p.status === "refunded"
          ? (p.updatedAt ?? p.paidAt ?? p.createdAt).toISOString()
          : p.status === "paid"
            ? (p.paidAt ?? p.createdAt).toISOString()
            : p.createdAt.toISOString();
      return {
        id: p.id,
        studentId: p.studentId,
        assignmentId: p.orderId,
        amount: signedAmount,
        status: mapPaymentStatus(p.status),
        paidAt: p.status === "paid" ? p.paidAt?.toISOString() ?? null : null,
        createdAt: eventAt,
        failureReason: p.failureReason ?? null,
        tariffName: order?.tariffNameSnapshot ?? null,
        lessonsLimit: order?.lessonsCount ?? null,
        orderStatus: order?.status ?? null,
      };
    });
}

export async function getCommerceIncomeOverview(
  db: AppDb,
  ctx: AuthContext
): Promise<IncomeOverview> {
  requireRoles(ctx, ["director"]);
  const orgId = ctx.organizationId;

  const [studentRows, paymentRows, orderRows] = await Promise.all([
    db.select().from(students).where(eq(students.organizationId, orgId)),
    db.select().from(payments).where(eq(payments.organizationId, orgId)),
    db.select().from(lessonOrders).where(eq(lessonOrders.organizationId, orgId)),
  ]);

  const orderById = new Map(orderRows.map((o) => [o.id, o]));
  const mappedPayments = paymentRowsForAnalytics(paymentRows, orderById);

  const paidOrders = orderRows.filter((o) => o.status === "paid");
  const assignmentLike = paidOrders.map((o) => ({
    id: o.id,
    studentId: o.studentId,
    tariffName: o.tariffNameSnapshot,
    lessonsLimitSnapshot: o.lessonsCount,
    status: "active" as const,
    paymentStatus: "paid" as const,
  }));

  const months = buildMonthSummaries({
    payments: mappedPayments.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      assignmentId: p.assignmentId,
      amount: p.amount,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      failureReason: p.failureReason,
    })),
    students: studentRows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      createdAt: s.createdAt.toISOString(),
    })),
    assignments: assignmentLike,
  });

  const revenueMonths = months.map((m) => {
    const visible = m.payments.filter((p) => p.status !== "pending");
    const revenue = visible.reduce((sum, p) => {
      if (p.status === "paid" && p.paidAt) return sum + p.amount;
      if (p.status === "refunded") return sum + p.amount;
      return sum;
    }, 0);
    return { ...m, revenue, payments: visible };
  });

  const current = buildCurrentTariffOverview({
    students: studentRows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      status: s.status,
    })),
    assignments: assignmentLike.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      tariffId: "",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      priceSnapshot: 0,
      currency: "RUB" as const,
      status: a.status,
      paymentStatus: a.paymentStatus,
      lessonsLimitSnapshot: a.lessonsLimitSnapshot,
      lessonsRemaining: a.lessonsLimitSnapshot,
      tariffName: a.tariffName,
    })),
  });

  return { months: revenueMonths, current };
}

/** @deprecated Используйте getCommerceIncomeOverview */
export async function getIncomeOverview(
  db: AppDb,
  ctx: AuthContext
): Promise<IncomeOverview> {
  return getCommerceIncomeOverview(db, ctx);
}