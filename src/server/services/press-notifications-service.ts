import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  pressNotifications,
  studentContactTasks,
  students,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { notFound } from "@/server/errors";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function requirePress(ctx: AuthContext) {
  requireRoles(ctx, ["press"]);
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current && typeof current === "object") {
      const code =
        "code" in current ? String((current as { code?: unknown }).code) : "";
      if (code === "23505") return true;
      const message =
        current instanceof Error ? current.message : String(current);
      if (/unique|duplicate key/i.test(message)) return true;
      current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Создаёт уведомления по наступившим контактам.
 * Идемпотентно: уникальный source_key = reminder_key задачи.
 * Не требует открытого браузера, но должен быть вызван сервером
 * (запрос кабинета «Пресса» или внешний планировщик).
 */
export async function syncDueContactReminders(
  db: AppDb,
  organizationId: string,
  now: Date = new Date()
): Promise<{ created: number }> {
  const due = await db
    .select({
      id: studentContactTasks.id,
      studentId: studentContactTasks.studentId,
      dueAt: studentContactTasks.dueAt,
      reason: studentContactTasks.reason,
      reminderKey: studentContactTasks.reminderKey,
      createdByUserId: studentContactTasks.createdByUserId,
      studentName: students.fullName,
    })
    .from(studentContactTasks)
    .innerJoin(students, eq(students.id, studentContactTasks.studentId))
    .where(
      and(
        eq(studentContactTasks.organizationId, organizationId),
        eq(studentContactTasks.status, "scheduled"),
        lte(studentContactTasks.dueAt, now)
      )
    );

  let created = 0;
  for (const task of due) {
    if (!task.createdByUserId) continue;
    try {
      await db.insert(pressNotifications).values({
        id: newId("pn"),
        organizationId,
        userId: task.createdByUserId,
        kind: "contact_due",
        title: `Контакт: ${task.studentName}`,
        body: task.reason || "Назначенный следующий контакт",
        href: `/pressa/students/${task.studentId}`,
        studentId: task.studentId,
        sourceKey: task.reminderKey,
        dueAt: task.dueAt,
      });
      created += 1;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  return { created };
}

export async function cancelContactNotifications(
  db: AppDb,
  reminderKey: string
) {
  await db
    .delete(pressNotifications)
    .where(
      and(
        eq(pressNotifications.sourceKey, reminderKey),
        isNull(pressNotifications.readAt)
      )
    );
}

export async function listPressNotifications(
  db: AppDb,
  ctx: AuthContext
) {
  requirePress(ctx);
  const rows = await db
    .select()
    .from(pressNotifications)
    .where(
      and(
        eq(pressNotifications.organizationId, ctx.organizationId),
        eq(pressNotifications.userId, ctx.userId)
      )
    )
    .orderBy(desc(pressNotifications.createdAt))
    .limit(50);

  return {
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      href: r.href,
      studentId: r.studentId,
      dueAt: r.dueAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    overdueContacts: [] as {
      id: string;
      studentId: string;
      studentName: string;
      dueAt: string;
      reason: string;
      href: string;
    }[],
  };
}

export async function markPressNotificationRead(
  db: AppDb,
  ctx: AuthContext,
  notificationId: string
) {
  requirePress(ctx);
  const [row] = await db
    .select()
    .from(pressNotifications)
    .where(
      and(
        eq(pressNotifications.id, notificationId),
        eq(pressNotifications.organizationId, ctx.organizationId),
        eq(pressNotifications.userId, ctx.userId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Уведомление не найдено");
  if (!row.readAt) {
    await db
      .update(pressNotifications)
      .set({ readAt: new Date() })
      .where(eq(pressNotifications.id, row.id));
  }
  return { ok: true as const };
}