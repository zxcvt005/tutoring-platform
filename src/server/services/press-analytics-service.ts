import { eq } from "drizzle-orm";

import { parseAppInstant } from "@/lib/app-time";
import {
  computePressAnalytics,
  type PressAnalyticsResult,
} from "@/lib/press-analytics";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  studentContactTasks,
  teachers,
  trialLessons,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { validationError } from "@/server/errors";

export async function getPressAnalytics(
  db: AppDb,
  ctx: AuthContext,
  input: {
    from: string;
    to: string;
    teacherId?: string | null;
    ownerUserId?: string | null;
    now?: Date;
  }
): Promise<{
  analytics: PressAnalyticsResult;
  teachers: { id: string; fullName: string }[];
  owners: { id: string; fullName: string }[];
}> {
  requireRoles(ctx, ["press"]);
  const from = parseAppInstant(input.from);
  const to = parseAppInstant(input.to, true);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw validationError("Укажите корректный период");
  }
  if (!(to >= from)) throw validationError("Конец периода должен быть не раньше начала");

  const trialRows = await db
    .select()
    .from(trialLessons)
    .where(eq(trialLessons.organizationId, ctx.organizationId));
  const contactRows = await db
    .select()
    .from(studentContactTasks)
    .where(eq(studentContactTasks.organizationId, ctx.organizationId));

  const analytics = computePressAnalytics(
    trialRows.map((t) => ({
      id: t.id,
      teacherId: t.teacherId,
      ownerUserId: t.ownerUserId,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt.toISOString(),
      startsAt: t.startsAt.toISOString(),
      agreementStatus: t.agreementStatus as never,
      lessonStatus: t.lessonStatus as never,
    })),
    contactRows.map((c) => ({
      id: c.id,
      studentId: c.studentId,
      dueAt: c.dueAt.toISOString(),
      status: c.status as never,
      completedAt: c.completedAt?.toISOString() ?? null,
      createdByUserId: c.createdByUserId,
    })),
    {
      from,
      to,
      teacherId: input.teacherId,
      ownerUserId: input.ownerUserId,
      now: input.now,
    }
  );

  const teacherRows = await db
    .select({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.organizationId, ctx.organizationId));

  const ownerRows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      role: users.status,
    })
    .from(users);

  const ownerIds = new Set(
    trialRows
      .flatMap((t) => [t.ownerUserId, t.createdByUserId])
      .filter((id): id is string => Boolean(id))
  );
  const owners = ownerRows
    .filter((u) => ownerIds.has(u.id))
    .map((u) => ({ id: u.id, fullName: u.fullName }));

  return {
    analytics,
    teachers: teacherRows.map((t) => ({ id: t.id, fullName: t.fullName })),
    owners,
  };
}
