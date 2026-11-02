import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { parseAppInstant } from "@/lib/app-time";
import {
  findOccupancyConflict,
  occupancyConflictMessage,
  trialOccupiesSlot,
  type OccupancyBlock,
  type TrialAgreementStatus,
  type TrialEventType,
  type TrialLesson,
  type TrialLessonPublic,
  type TrialLessonStatus,
} from "@/lib/trial-lessons";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  auditLog,
  lessons,
  teachers,
  trialInteractionNotes,
  trialLessonEvents,
  trialLessons,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  conflict,
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function requirePress(ctx: AuthContext) {
  requireRoles(ctx, ["press"]);
}

function toTrial(row: typeof trialLessons.$inferSelect, extra?: {
  teacherName?: string;
  createdByName?: string | null;
  ownerName?: string | null;
}): TrialLesson {
  return {
    id: row.id,
    teacherId: row.teacherId,
    teacherName: extra?.teacherName,
    prospectName: row.prospectName,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    teacherNotes: row.teacherNotes,
    salesNotes: row.salesNotes,
    agreementStatus: row.agreementStatus as TrialAgreementStatus,
    lessonStatus: row.lessonStatus as TrialLessonStatus,
    createdByUserId: row.createdByUserId,
    createdByName: extra?.createdByName,
    ownerUserId: row.ownerUserId,
    ownerName: extra?.ownerName,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublic(row: typeof trialLessons.$inferSelect): TrialLessonPublic {
  return {
    id: row.id,
    teacherId: row.teacherId,
    prospectName: row.prospectName,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    teacherNotes: row.teacherNotes,
    lessonStatus: row.lessonStatus as TrialLessonStatus,
  };
}

export type CreateTrialInput = {
  prospectName: string;
  teacherId: string;
  startsAt: string;
  endsAt: string;
  teacherNotes?: string;
  salesNotes?: string;
  agreementStatus?: TrialAgreementStatus;
  ownerUserId?: string | null;
};

export type UpdateTrialInput = {
  prospectName?: string;
  teacherId?: string;
  startsAt?: string;
  endsAt?: string;
  teacherNotes?: string;
  salesNotes?: string;
  agreementStatus?: TrialAgreementStatus;
  lessonStatus?: TrialLessonStatus;
  ownerUserId?: string | null;
  cancelReason?: string | null;
};

function parseRange(startsAt: string, endsAt: string) {
  const start = parseAppInstant(startsAt);
  const end = parseAppInstant(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw validationError("Некорректные дата и время");
  }
  if (!(end > start)) {
    throw validationError("Окончание должно быть позже начала");
  }
  return { start, end };
}

async function loadTeacherInOrg(
  db: AppDb,
  organizationId: string,
  teacherId: string
) {
  const [row] = await db
    .select({
      id: teachers.id,
      fullName: teachers.fullName,
      status: teachers.status,
    })
    .from(teachers)
    .where(
      and(eq(teachers.id, teacherId), eq(teachers.organizationId, organizationId))
    )
    .limit(1);
  if (!row) throw notFound("Преподаватель не найден");
  return row;
}

async function collectOccupancyBlocks(
  db: AppDb,
  organizationId: string,
  teacherId: string,
  start: Date,
  end: Date,
  excludeTrialId?: string
): Promise<OccupancyBlock[]> {
  const lessonRows = await db
    .select({
      id: lessons.id,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      subject: lessons.subject,
      status: lessons.status,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.organizationId, organizationId),
        eq(lessons.teacherId, teacherId),
        ne(lessons.status, "cancelled"),
        lt(lessons.startsAt, end),
        gt(lessons.endsAt, start)
      )
    );

  const trialWhere = [
    eq(trialLessons.organizationId, organizationId),
    eq(trialLessons.teacherId, teacherId),
    eq(trialLessons.lessonStatus, "planned"),
    lt(trialLessons.startsAt, end),
    gt(trialLessons.endsAt, start),
  ];
  const trialRows = await db
    .select({
      id: trialLessons.id,
      startsAt: trialLessons.startsAt,
      endsAt: trialLessons.endsAt,
      prospectName: trialLessons.prospectName,
    })
    .from(trialLessons)
    .where(and(...trialWhere));

  const blocks: OccupancyBlock[] = [
    ...lessonRows.map((l) => ({
      kind: "lesson" as const,
      id: l.id,
      startsAt: l.startsAt.toISOString(),
      endsAt: l.endsAt.toISOString(),
      label: l.subject ?? "занятие",
    })),
    ...trialRows
      .filter((t) => t.id !== excludeTrialId)
      .map((t) => ({
        kind: "trial" as const,
        id: t.id,
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
        label: t.prospectName,
      })),
  ];
  return blocks;
}

async function assertSlotFree(
  db: AppDb,
  organizationId: string,
  teacherId: string,
  start: Date,
  end: Date,
  excludeTrialId?: string
) {
  const blocks = await collectOccupancyBlocks(
    db,
    organizationId,
    teacherId,
    start,
    end,
    excludeTrialId
  );
  const hit = findOccupancyConflict(blocks, {
    id: excludeTrialId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  });
  if (hit) throw conflict(occupancyConflictMessage(hit));
}

async function writeTrialEvent(
  db: AppDb,
  ctx: AuthContext,
  trialId: string,
  eventType: TrialEventType,
  payload: Record<string, unknown>
) {
  await db.insert(trialLessonEvents).values({
    id: newId("tle"),
    organizationId: ctx.organizationId,
    trialLessonId: trialId,
    actorUserId: ctx.userId,
    eventType,
    payload,
  });
  await db.insert(auditLog).values({
    id: newId("audit"),
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: `trial.${eventType}`,
    entityType: "trial_lesson",
    entityId: trialId,
    payload,
  });
}

function occupancyLockKey(organizationId: string, teacherId: string) {
  return `trial-occupancy:${organizationId}:${teacherId}`;
}

export async function createTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  input: CreateTrialInput
) {
  requirePress(ctx);
  const prospectName = input.prospectName.trim();
  if (!prospectName) throw validationError("Укажите имя потенциального ученика");
  const { start, end } = parseRange(input.startsAt, input.endsAt);
  await loadTeacherInOrg(db, ctx.organizationId, input.teacherId);

  const id = newId("trl");
  const lockKey = occupancyLockKey(ctx.organizationId, input.teacherId);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    await assertSlotFree(
      tx as unknown as AppDb,
      ctx.organizationId,
      input.teacherId,
      start,
      end
    );
    await tx.insert(trialLessons).values({
      id,
      organizationId: ctx.organizationId,
      teacherId: input.teacherId,
      prospectName,
      startsAt: start,
      endsAt: end,
      teacherNotes: (input.teacherNotes ?? "").trim(),
      salesNotes: (input.salesNotes ?? "").trim(),
      agreementStatus: input.agreementStatus ?? "not_discussed",
      lessonStatus: "planned",
      createdByUserId: ctx.userId,
      ownerUserId: input.ownerUserId ?? ctx.userId,
    });
    await writeTrialEvent(tx as unknown as AppDb, ctx, id, "created", {
      teacherId: input.teacherId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      prospectName,
    });
  });

  return getTrialLesson(db, ctx, id);
}

export async function updateTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  trialId: string,
  input: UpdateTrialInput
) {
  requirePress(ctx);
  const existing = await loadTrialInOrg(db, ctx, trialId);

  const teacherId = input.teacherId ?? existing.teacherId;
  if (input.teacherId) {
    await loadTeacherInOrg(db, ctx.organizationId, teacherId);
  }

  const start = input.startsAt
    ? parseAppInstant(input.startsAt)
    : existing.startsAt;
  const end = input.endsAt ? parseAppInstant(input.endsAt) : existing.endsAt;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw validationError("Некорректные дата и время");
  }
  if (!(end > start)) {
    throw validationError("Окончание должно быть позже начала");
  }

  const nextStatus = (input.lessonStatus ??
    existing.lessonStatus) as TrialLessonStatus;
  if (input.lessonStatus === "cancelled" && existing.lessonStatus !== "cancelled") {
    return cancelTrialLesson(db, ctx, trialId, input.cancelReason ?? "");
  }

  const occupies = trialOccupiesSlot(nextStatus);
  const timeOrTeacherChanged =
    teacherId !== existing.teacherId ||
    start.getTime() !== existing.startsAt.getTime() ||
    end.getTime() !== existing.endsAt.getTime();

  const lockKey = occupancyLockKey(ctx.organizationId, teacherId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (occupies && timeOrTeacherChanged) {
      await assertSlotFree(
        tx as unknown as AppDb,
        ctx.organizationId,
        teacherId,
        start,
        end,
        trialId
      );
    }

    const patch: Partial<typeof trialLessons.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.prospectName != null) {
      const name = input.prospectName.trim();
      if (!name) throw validationError("Укажите имя потенциального ученика");
      patch.prospectName = name;
    }
    if (input.teacherId) patch.teacherId = input.teacherId;
    if (input.startsAt) patch.startsAt = start;
    if (input.endsAt) patch.endsAt = end;
    if (input.teacherNotes != null) patch.teacherNotes = input.teacherNotes;
    if (input.salesNotes != null) patch.salesNotes = input.salesNotes;
    if (input.agreementStatus) patch.agreementStatus = input.agreementStatus;
    if (input.lessonStatus) patch.lessonStatus = input.lessonStatus;
    if (input.ownerUserId !== undefined) patch.ownerUserId = input.ownerUserId;
    if (input.cancelReason !== undefined) {
      patch.cancelReason = input.cancelReason;
    }

    await tx
      .update(trialLessons)
      .set(patch)
      .where(eq(trialLessons.id, trialId));

    if (timeOrTeacherChanged) {
      await writeTrialEvent(tx as unknown as AppDb, ctx, trialId, "rescheduled", {
        teacherId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        previousTeacherId: existing.teacherId,
        previousStartsAt: existing.startsAt.toISOString(),
      });
    }
    if (
      input.agreementStatus &&
      input.agreementStatus !== existing.agreementStatus
    ) {
      await writeTrialEvent(
        tx as unknown as AppDb,
        ctx,
        trialId,
        "agreement_changed",
        {
          from: existing.agreementStatus,
          to: input.agreementStatus,
        }
      );
    }
    if (input.lessonStatus && input.lessonStatus !== existing.lessonStatus) {
      await writeTrialEvent(
        tx as unknown as AppDb,
        ctx,
        trialId,
        "status_changed",
        { from: existing.lessonStatus, to: input.lessonStatus }
      );
    }
    if (
      input.ownerUserId !== undefined &&
      input.ownerUserId !== existing.ownerUserId
    ) {
      await writeTrialEvent(tx as unknown as AppDb, ctx, trialId, "owner_changed", {
        from: existing.ownerUserId,
        to: input.ownerUserId,
      });
    }
    if (
      !timeOrTeacherChanged &&
      !input.agreementStatus &&
      !input.lessonStatus &&
      input.ownerUserId === undefined
    ) {
      await writeTrialEvent(tx as unknown as AppDb, ctx, trialId, "updated", {
        fields: Object.keys(input),
      });
    }
  });

  return getTrialLesson(db, ctx, trialId);
}

export async function cancelTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  trialId: string,
  cancelReason: string
) {
  requirePress(ctx);
  const existing = await loadTrialInOrg(db, ctx, trialId);
  if (existing.lessonStatus === "cancelled") {
    return getTrialLesson(db, ctx, trialId);
  }
  await db
    .update(trialLessons)
    .set({
      lessonStatus: "cancelled",
      cancelReason: cancelReason.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(trialLessons.id, trialId));
  await writeTrialEvent(db, ctx, trialId, "cancelled", {
    cancelReason: cancelReason.trim() || null,
    previousStatus: existing.lessonStatus,
  });
  return getTrialLesson(db, ctx, trialId);
}

async function loadTrialInOrg(db: AppDb, ctx: AuthContext, trialId: string) {
  const [row] = await db
    .select()
    .from(trialLessons)
    .where(
      and(
        eq(trialLessons.id, trialId),
        eq(trialLessons.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Пробный урок не найден");
  return row;
}

export async function getTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  trialId: string
) {
  if (ctx.role === "press") requirePress(ctx);
  else if (ctx.role === "teacher" || ctx.role === "director") {
    /* ok */
  } else {
    throw forbidden();
  }
  const row = await loadTrialInOrg(db, ctx, trialId);
  if (ctx.role === "teacher" && ctx.teacherId !== row.teacherId) {
    throw forbidden();
  }
  if (ctx.role !== "press") {
    return { trial: toPublic(row) };
  }
  const names = await loadTrialNames(db, [row]);
  const notes = await listTrialInteractionNotes(db, ctx, trialId);
  return { trial: toTrial(row, names.get(row.id)), notes: notes.notes };
}

async function loadTrialNames(
  db: AppDb,
  rows: (typeof trialLessons.$inferSelect)[]
) {
  const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.createdByUserId, r.ownerUserId].filter(Boolean))
    ),
  ] as string[];
  const teacherRows =
    teacherIds.length > 0
      ? await db
          .select({ id: teachers.id, fullName: teachers.fullName })
          .from(teachers)
          .where(inArray(teachers.id, teacherIds))
      : [];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const teacherMap = new Map(teacherRows.map((t) => [t.id, t.fullName]));
  const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        teacherName: teacherMap.get(r.teacherId),
        createdByName: r.createdByUserId
          ? userMap.get(r.createdByUserId) ?? null
          : null,
        ownerName: r.ownerUserId ? userMap.get(r.ownerUserId) ?? null : null,
      },
    ])
  );
}

export async function listTrialLessons(
  db: AppDb,
  ctx: AuthContext,
  input: {
    teacherId?: string;
    agreementStatus?: TrialAgreementStatus;
    lessonStatus?: TrialLessonStatus;
  } = {}
) {
  requirePress(ctx);
  const filters = [eq(trialLessons.organizationId, ctx.organizationId)];
  if (input.teacherId) filters.push(eq(trialLessons.teacherId, input.teacherId));
  if (input.agreementStatus) {
    filters.push(eq(trialLessons.agreementStatus, input.agreementStatus));
  }
  if (input.lessonStatus) {
    filters.push(eq(trialLessons.lessonStatus, input.lessonStatus));
  }
  const rows = await db
    .select()
    .from(trialLessons)
    .where(and(...filters))
    .orderBy(desc(trialLessons.startsAt));
  const names = await loadTrialNames(db, rows);
  return {
    trials: rows.map((r) => toTrial(r, names.get(r.id))),
  };
}

/**
 * Для расписания: преподаватель видит свои пробные без внутренних заметок продажника.
 * Директор и пресса — все пробные организации (пресса получит полный объект отдельно).
 */
export async function listTrialLessonsForSchedule(
  db: AppDb,
  ctx: AuthContext
): Promise<TrialLessonPublic[]> {
  if (ctx.role === "student") return [];
  const filters = [eq(trialLessons.organizationId, ctx.organizationId)];
  if (ctx.role === "teacher" && ctx.teacherId) {
    filters.push(eq(trialLessons.teacherId, ctx.teacherId));
  }
  const rows = await db
    .select()
    .from(trialLessons)
    .where(and(...filters));
  return rows
    .filter((r) => r.lessonStatus !== "cancelled")
    .map(toPublic);
}

export async function listTrialEvents(
  db: AppDb,
  ctx: AuthContext,
  trialId: string
) {
  requirePress(ctx);
  await loadTrialInOrg(db, ctx, trialId);
  const rows = await db
    .select()
    .from(trialLessonEvents)
    .where(eq(trialLessonEvents.trialLessonId, trialId))
    .orderBy(desc(trialLessonEvents.createdAt));
  return {
    events: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      payload: r.payload,
      actorUserId: r.actorUserId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function listTrialInteractionNotes(
  db: AppDb,
  ctx: AuthContext,
  trialId: string
) {
  requirePress(ctx);
  await loadTrialInOrg(db, ctx, trialId);
  const rows = await db
    .select({
      id: trialInteractionNotes.id,
      body: trialInteractionNotes.body,
      createdAt: trialInteractionNotes.createdAt,
      authorUserId: trialInteractionNotes.authorUserId,
      authorName: users.fullName,
    })
    .from(trialInteractionNotes)
    .leftJoin(users, eq(users.id, trialInteractionNotes.authorUserId))
    .where(eq(trialInteractionNotes.trialLessonId, trialId))
    .orderBy(desc(trialInteractionNotes.createdAt));
  return {
    notes: rows.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      authorUserId: n.authorUserId,
      authorName: n.authorName,
    })),
  };
}

export async function addTrialInteractionNote(
  db: AppDb,
  ctx: AuthContext,
  trialId: string,
  body: string
) {
  requirePress(ctx);
  await loadTrialInOrg(db, ctx, trialId);
  const text = body.trim();
  if (!text) throw validationError("Введите текст заметки");
  const id = newId("tin");
  await db.insert(trialInteractionNotes).values({
    id,
    organizationId: ctx.organizationId,
    trialLessonId: trialId,
    authorUserId: ctx.userId,
    body: text,
  });
  return {
    id,
    body: text,
    createdAt: new Date().toISOString(),
    authorUserId: ctx.userId,
    authorName: ctx.fullName,
  };
}

export async function listAllTrialsForAnalytics(
  db: AppDb,
  organizationId: string
) {
  return db
    .select()
    .from(trialLessons)
    .where(eq(trialLessons.organizationId, organizationId));
}
