import { and, asc, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { parseAppInstant } from "@/lib/app-time";
import { contactReminderKey } from "@/lib/press-contacts";
import {
  comparePressStudents,
  pressStudentBucket,
  type PressStudentBucket,
  type PressStudentSort,
} from "@/lib/press-students";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  studentContactTasks,
  studentInteractionNotes,
  studentSalesProfiles,
  studentTariffAssignments,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { badRequest, notFound, validationError } from "@/server/errors";
import { cancelContactNotifications } from "@/server/services/press-notifications-service";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function requirePress(ctx: AuthContext) {
  requireRoles(ctx, ["press"]);
}

async function loadStudentInOrg(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  const [row] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Ученик не найден");
  return row;
}

export type PressStudentListItem = {
  id: string;
  fullName: string;
  status: string;
  bucket: PressStudentBucket;
  teacherId: string | null;
  teacherName: string | null;
  grade: string | null;
  telegram: string | null;
  phone: string | null;
  tariffName: string | null;
  createdAt: string;
};

export async function listPressStudents(
  db: AppDb,
  ctx: AuthContext,
  input: {
    query?: string;
    bucket?: PressStudentBucket | "all";
    sort?: PressStudentSort;
  } = {}
): Promise<{ students: PressStudentListItem[] }> {
  requirePress(ctx);
  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.organizationId, ctx.organizationId));

  const teacherRows = await db
    .select({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.organizationId, ctx.organizationId));
  const teacherName = new Map(teacherRows.map((t) => [t.id, t.fullName]));

  const tariffRows = await db
    .select({
      studentId: studentTariffAssignments.studentId,
      tariffName: studentTariffAssignments.tariffNameSnapshot,
      status: studentTariffAssignments.status,
      paymentStatus: studentTariffAssignments.paymentStatus,
      startsAt: studentTariffAssignments.startsAt,
    })
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.organizationId, ctx.organizationId));
  const tariffByStudent = new Map<string, string>();
  const sortedTariffs = [...tariffRows].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime()
  );
  for (const row of sortedTariffs) {
    if (tariffByStudent.has(row.studentId)) continue;
    if (row.status === "active" && row.paymentStatus === "paid") {
      tariffByStudent.set(row.studentId, row.tariffName ?? "Тариф");
    }
  }
  for (const row of sortedTariffs) {
    if (tariffByStudent.has(row.studentId)) continue;
    if (row.tariffName) tariffByStudent.set(row.studentId, row.tariffName);
  }

  const q = input.query?.trim().toLowerCase() ?? "";
  let items: PressStudentListItem[] = studentRows.map((s) => {
    const teacherId = s.primaryTeacherId;
    const bucket = pressStudentBucket({
      status: s.status as "active" | "paused" | "archived",
      teacherId,
    });
    return {
      id: s.id,
      fullName: s.fullName,
      status: s.status,
      bucket,
      teacherId,
      teacherName: teacherId ? teacherName.get(teacherId) ?? null : null,
      grade: s.grade,
      telegram: s.telegram,
      phone: s.phone,
      tariffName: tariffByStudent.get(s.id) ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  });

  if (q) {
    items = items.filter((s) => {
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.telegram?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.toLowerCase().includes(q) ?? false) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }
  if (input.bucket && input.bucket !== "all") {
    items = items.filter((s) => s.bucket === input.bucket);
  }
  items.sort((a, b) =>
    comparePressStudents(a, b, input.sort ?? "name")
  );
  return { students: items };
}

export async function getPressStudentCard(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  requirePress(ctx);
  const student = await loadStudentInOrg(db, ctx, studentId);

  const [teacher] = student.primaryTeacherId
    ? await db
        .select({ id: teachers.id, fullName: teachers.fullName })
        .from(teachers)
        .where(eq(teachers.id, student.primaryTeacherId))
        .limit(1)
    : [];

  const [profile] = await db
    .select()
    .from(studentSalesProfiles)
    .where(eq(studentSalesProfiles.studentId, studentId))
    .limit(1);

  const notes = await db
    .select({
      id: studentInteractionNotes.id,
      body: studentInteractionNotes.body,
      createdAt: studentInteractionNotes.createdAt,
      authorUserId: studentInteractionNotes.authorUserId,
      authorName: users.fullName,
    })
    .from(studentInteractionNotes)
    .leftJoin(users, eq(users.id, studentInteractionNotes.authorUserId))
    .where(eq(studentInteractionNotes.studentId, studentId))
    .orderBy(desc(studentInteractionNotes.createdAt));

  const tariffRows = await db
    .select()
    .from(studentTariffAssignments)
    .where(eq(studentTariffAssignments.studentId, studentId))
    .orderBy(desc(studentTariffAssignments.startsAt));
  const currentTariff =
    tariffRows.find((a) => a.status === "active" && a.paymentStatus === "paid") ??
    tariffRows[0] ??
    null;

  const bucket = pressStudentBucket({
    status: student.status as "active" | "paused" | "archived",
    teacherId: student.primaryTeacherId,
  });

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      status: student.status,
      bucket,
      grade: student.grade,
      telegram: student.telegram,
      phone: student.phone,
      parentContacts: student.parentContacts,
      teacherId: student.primaryTeacherId,
      teacherName: teacher?.fullName ?? null,
      previousTeacherId: student.previousTeacherId,
      createdAt: student.createdAt.toISOString(),
      archivedAt: student.archivedAt?.toISOString() ?? null,
      archivedReason: student.archivedReason,
      tariffName: currentTariff?.tariffNameSnapshot ?? null,
      tariffStatus: currentTariff?.status ?? null,
    },
    currentInfo: profile?.currentInfo ?? "",
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      authorUserId: n.authorUserId,
      authorName: n.authorName,
    })),
  };
}

export async function saveStudentCurrentInfo(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  currentInfo: string
) {
  requirePress(ctx);
  await loadStudentInOrg(db, ctx, studentId);
  const now = new Date();
  const [existing] = await db
    .select({ studentId: studentSalesProfiles.studentId })
    .from(studentSalesProfiles)
    .where(eq(studentSalesProfiles.studentId, studentId))
    .limit(1);
  if (existing) {
    await db
      .update(studentSalesProfiles)
      .set({
        currentInfo,
        updatedByUserId: ctx.userId,
        updatedAt: now,
      })
      .where(eq(studentSalesProfiles.studentId, studentId));
  } else {
    await db.insert(studentSalesProfiles).values({
      studentId,
      organizationId: ctx.organizationId,
      currentInfo,
      updatedByUserId: ctx.userId,
    });
  }
  return { ok: true as const, currentInfo };
}

export async function addStudentInteractionNote(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  body: string
) {
  requirePress(ctx);
  await loadStudentInOrg(db, ctx, studentId);
  const text = body.trim();
  if (!text) throw validationError("Введите текст заметки");
  const id = newId("sin");
  await db.insert(studentInteractionNotes).values({
    id,
    organizationId: ctx.organizationId,
    studentId,
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

/** Устарело: карточка ученика больше не назначает контакты и не создаёт личные напоминания. */
export async function setStudentNextContact(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  input: {
    active: boolean;
    dueAt?: string | null;
    reason?: string | null;
  }
) {
  requirePress(ctx);
  await loadStudentInOrg(db, ctx, studentId);

  const [current] = await db
    .select()
    .from(studentContactTasks)
    .where(
      and(
        eq(studentContactTasks.studentId, studentId),
        eq(studentContactTasks.status, "scheduled")
      )
    )
    .limit(1);

  if (!input.active) {
    if (current) {
      await db
        .update(studentContactTasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(studentContactTasks.id, current.id));
      await cancelContactNotifications(db, current.reminderKey);
    }
    return { ok: true as const, active: false };
  }

  if (!input.dueAt) {
    throw validationError("Укажите дату и время следующего контакта");
  }
  const dueAt = parseAppInstant(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    throw validationError("Некорректные дата и время контакта");
  }
  const reason = (input.reason ?? "").trim();

  if (current) {
    const reminderKey = contactReminderKey(current.id, dueAt);
    await db
      .update(studentContactTasks)
      .set({
        dueAt,
        reason,
        reminderKey,
        updatedAt: new Date(),
      })
      .where(eq(studentContactTasks.id, current.id));
    if (current.reminderKey !== reminderKey) {
      await cancelContactNotifications(db, current.reminderKey);
    }
    return {
      ok: true as const,
      active: true,
      id: current.id,
      dueAt: dueAt.toISOString(),
      reason,
    };
  }

  const id = newId("sct");
  const reminderKey = contactReminderKey(id, dueAt);
  try {
    await db.insert(studentContactTasks).values({
      id,
      organizationId: ctx.organizationId,
      studentId,
      dueAt,
      reason,
      status: "scheduled",
      reminderKey,
      createdByUserId: ctx.userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/sct_one_scheduled_uidx|unique/i.test(message)) {
      throw badRequest("У ученика уже есть активный следующий контакт");
    }
    throw err;
  }
  return {
    ok: true as const,
    active: true,
    id,
    dueAt: dueAt.toISOString(),
    reason,
  };
}

export async function completeStudentContact(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  input: { next?: { dueAt: string; reason?: string } | null } = {}
) {
  requirePress(ctx);
  await loadStudentInOrg(db, ctx, studentId);
  const [current] = await db
    .select()
    .from(studentContactTasks)
    .where(
      and(
        eq(studentContactTasks.studentId, studentId),
        eq(studentContactTasks.status, "scheduled")
      )
    )
    .limit(1);
  if (!current) throw badRequest("Нет активного следующего контакта");

  await db
    .update(studentContactTasks)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(studentContactTasks.id, current.id));
  await cancelContactNotifications(db, current.reminderKey);

  if (input.next) {
    return setStudentNextContact(db, ctx, studentId, {
      active: true,
      dueAt: input.next.dueAt,
      reason: input.next.reason,
    });
  }
  return { ok: true as const, completed: true, active: false };
}

export async function listScheduledContactTasks(
  db: AppDb,
  organizationId: string
) {
  return db
    .select()
    .from(studentContactTasks)
    .where(
      and(
        eq(studentContactTasks.organizationId, organizationId),
        eq(studentContactTasks.status, "scheduled")
      )
    )
    .orderBy(asc(studentContactTasks.dueAt));
}

/** Для тестов: прямой поиск без фильтра по роли. */
