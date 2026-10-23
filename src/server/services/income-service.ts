import { eq } from "drizzle-orm";

import {
  buildCurrentTariffOverview,
  buildMonthSummaries,
  type CurrentTariffOverview,
  type MonthSummary,
} from "@/lib/income-analytics";
import type { StudentTariffAssignment } from "@/lib/types";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  payments,
  studentTariffAssignments,
  students,
  tariffs,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  balanceFromDelta,
  derivePackageStatus,
  getLedgerDeltaByAssignmentIds,
} from "@/server/services/lesson-balance";

export type IncomeOverview = {
  months: MonthSummary[];
  current: CurrentTariffOverview;
};

export async function getIncomeOverview(
  db: AppDb,
  ctx: AuthContext
): Promise<IncomeOverview> {
  requireRoles(ctx, ["director"]);
  const orgId = ctx.organizationId;

  const [studentRows, paymentRows, assignmentRows, tariffRows] =
    await Promise.all([
      db.select().from(students).where(eq(students.organizationId, orgId)),
      db.select().from(payments).where(eq(payments.organizationId, orgId)),
      db
        .select()
        .from(studentTariffAssignments)
        .where(eq(studentTariffAssignments.organizationId, orgId)),
      db.select().from(tariffs).where(eq(tariffs.organizationId, orgId)),
    ]);

  const tariffById = new Map(tariffRows.map((t) => [t.id, t]));
  const ledgerDelta = await getLedgerDeltaByAssignmentIds(
    db,
    assignmentRows.map((a) => a.id)
  );

  const mappedAssignments: StudentTariffAssignment[] = assignmentRows.map(
    (a) => {
      const t = tariffById.get(a.tariffId);
      const limit = a.lessonsLimitSnapshot ?? t?.lessonsLimit ?? null;
      const bal = balanceFromDelta(ledgerDelta.get(a.id) ?? 0, limit);
      return {
        id: a.id,
        studentId: a.studentId,
        tariffId: a.tariffId,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        priceSnapshot: Number(a.priceSnapshot),
        currency: "RUB" as const,
        status: a.status as StudentTariffAssignment["status"],
        paymentStatus:
          a.paymentStatus as StudentTariffAssignment["paymentStatus"],
        lessonsLimitSnapshot: a.lessonsLimitSnapshot,
        lessonsRemaining: bal.remaining,
        packageStatus: derivePackageStatus({
          status: a.status,
          paymentStatus: a.paymentStatus,
          remaining: bal.remaining,
        }),
        tariffName: a.tariffNameSnapshot ?? t?.name,
      };
    }
  );

  const months = buildMonthSummaries({
    payments: paymentRows.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      assignmentId: p.assignmentId,
      amount: Number(p.amount),
      status: p.status as "pending" | "paid" | "cancelled" | "failed",
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    students: studentRows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      createdAt: s.createdAt.toISOString(),
    })),
    assignments: mappedAssignments.map((a) => ({
      id: a.id,
      tariffName: a.tariffName,
    })),
  });

  const current = buildCurrentTariffOverview({
    students: studentRows.map((s) => ({ id: s.id, fullName: s.fullName })),
    assignments: mappedAssignments,
  });

  return { months, current };
}
