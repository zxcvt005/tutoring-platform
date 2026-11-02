import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { appDateKey, parseAppInstant, startOfAppDay } from "@/lib/app-time";
import {
  nextReminderOccurrenceAfter,
  reminderIsAfterDay,
  reminderIsDueOnOrBeforeDay,
  reminderIsOnDay,
  type PressReminderFrequency,
  type PressReminderKind,
  type PressReminderStatus,
  type PressReminderView,
} from "@/lib/press-reminders";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  pressReminderCompletions,
  pressReminders,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { forbidden, notFound, validationError } from "@/server/errors";

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
      current =
        "cause" in current ? (current as { cause: unknown }).cause : undefined;
    } else {
      break;
    }
  }
  return false;
}

function parseKind(value: unknown): PressReminderKind {
  if (value === "once" || value === "recurring") return value;
  throw validationError("Укажите тип: разовое или регулярное");
}

function parseFrequency(
  kind: PressReminderKind,
  value: unknown
): PressReminderFrequency | null {
  if (kind === "once") {
    if (value == null || value === "" || value === "none") return null;
    throw validationError("У разового напоминания не бывает частоты");
  }
  if (value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }
  throw validationError("Укажите частоту: ежедневно, еженедельно или ежемесячно");
}

function parseStartAt(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError("Укажите дату и время напоминания");
  }
  const startAt = parseAppInstant(value);
  if (Number.isNaN(startAt.getTime())) {
    throw validationError("Некорректные дата и время напоминания");
  }
  return startAt;
}

export type PressReminderDto = {
  id: string;
  title: string;
  description: string;
  kind: PressReminderKind;
  frequency: PressReminderFrequency | null;
  startAt: string;
  currentDueAt: string;
  status: PressReminderStatus;
  createdAt: string;
  updatedAt: string;
};

export type PressReminderOccurrenceDto = PressReminderDto & {
  occurrenceAt: string;
  completedAt: string | null;
};

function toDto(row: typeof pressReminders.$inferSelect): PressReminderDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind as PressReminderKind,
    frequency: (row.frequency as PressReminderFrequency | null) ?? null,
    startAt: row.startAt.toISOString(),
    currentDueAt: row.currentDueAt.toISOString(),
    status: row.status as PressReminderStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  const [row] = await db
    .select()
    .from(pressReminders)
    .where(
      and(
        eq(pressReminders.id, id),
        eq(pressReminders.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Напоминание не найдено");
  if (row.userId !== ctx.userId) throw forbidden("Это чужое напоминание");
  return row;
}

function advanceCurrentDue(
  row: typeof pressReminders.$inferSelect,
  completedOccurrence: Date
): Date | null {
  if (row.kind !== "recurring" || !row.frequency) return null;
  return nextReminderOccurrenceAfter(
    row.startAt,
    row.frequency as PressReminderFrequency,
    completedOccurrence
  );
}

function recomputeCurrentDue(
  row: typeof pressReminders.$inferSelect,
  completedKeys: Set<string>
): Date {
  const kind = row.kind as PressReminderKind;
  const frequency = row.frequency as PressReminderFrequency | null;
  if (kind === "once" || !frequency) return row.startAt;
  let cursor: Date | null = row.startAt;
  for (let i = 0; i < 20_000 && cursor; i += 1) {
    if (!completedKeys.has(cursor.toISOString())) return cursor;
    cursor = nextReminderOccurrenceAfter(row.startAt, frequency, cursor);
  }
  return row.startAt;
}

export async function createPressReminder(
  db: AppDb,
  ctx: AuthContext,
  input: {
    title: string;
    description?: string | null;
    kind: unknown;
    frequency?: unknown;
    startAt: unknown;
  }
) {
  requirePress(ctx);
  const title = input.title.trim();
  if (!title) throw validationError("Укажите название напоминания");
  const kind = parseKind(input.kind);
  const frequency = parseFrequency(kind, input.frequency);
  const startAt = parseStartAt(input.startAt);
  const id = newId("prm");
  const [row] = await db
    .insert(pressReminders)
    .values({
      id,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title,
      description: (input.description ?? "").trim(),
      kind,
      frequency,
      startAt,
      currentDueAt: startAt,
      status: "active",
    })
    .returning();
  return { reminder: toDto(row!) };
}

export async function updatePressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    kind?: unknown;
    frequency?: unknown;
    startAt?: unknown;
  }
) {
  requirePress(ctx);
  const current = await loadOwnReminder(db, ctx, id);
  if (current.status === "archived") {
    throw validationError("Архивное напоминание нельзя изменить");
  }

  const title =
    input.title != null ? input.title.trim() : current.title;
  if (!title) throw validationError("Укажите название напоминания");
  const kind = input.kind != null ? parseKind(input.kind) : (current.kind as PressReminderKind);
  const frequency = parseFrequency(
    kind,
    input.frequency !== undefined ? input.frequency : current.frequency
  );
  const startAt =
    input.startAt != null ? parseStartAt(input.startAt) : current.startAt;

  const completions = await db
    .select({ occurrenceAt: pressReminderCompletions.occurrenceAt })
    .from(pressReminderCompletions)
    .where(eq(pressReminderCompletions.reminderId, id));
  const completedKeys = new Set(
    completions.map((c) => c.occurrenceAt.toISOString())
  );

  const currentDueAt = recomputeCurrentDue(
    { ...current, kind, frequency, startAt },
    completedKeys
  );

  const [row] = await db
    .update(pressReminders)
    .set({
      title,
      description:
        input.description !== undefined
          ? (input.description ?? "").trim()
          : current.description,
      kind,
      frequency,
      startAt,
      currentDueAt,
      updatedAt: new Date(),
    })
    .where(eq(pressReminders.id, id))
    .returning();
  return { reminder: toDto(row!) };
}

export async function completePressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  input: { occurrenceAt?: string | null; now?: Date } = {}
) {
  requirePress(ctx);
  const now = input.now ?? new Date();
  const current = await loadOwnReminder(db, ctx, id);
  if (current.status !== "active") {
    throw validationError("Можно выполнить только активное напоминание");
  }

  const occurrenceAt = input.occurrenceAt
    ? parseAppInstant(input.occurrenceAt)
    : current.currentDueAt;

  const [already] = await db
    .select()
    .from(pressReminderCompletions)
    .where(
      and(
        eq(pressReminderCompletions.reminderId, id),
        eq(pressReminderCompletions.occurrenceAt, occurrenceAt)
      )
    )
    .limit(1);
  if (already) {
    return {
      reminder: toDto(current),
      completion: {
        id: already.id,
        occurrenceAt: already.occurrenceAt.toISOString(),
        completedAt: already.completedAt.toISOString(),
      },
      duplicate: true as const,
    };
  }

  if (occurrenceAt.getTime() !== current.currentDueAt.getTime()) {
    throw validationError("Это повторение уже не является текущим");
  }
  const completionId = newId("prc");
  try {
    await db.insert(pressReminderCompletions).values({
      id: completionId,
      organizationId: ctx.organizationId,
      reminderId: id,
      userId: ctx.userId,
      occurrenceAt,
      completedAt: now,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(pressReminderCompletions)
        .where(
          and(
            eq(pressReminderCompletions.reminderId, id),
            eq(pressReminderCompletions.occurrenceAt, occurrenceAt)
          )
        )
        .limit(1);
      return {
        reminder: toDto(current),
        completion: existing
          ? {
              id: existing.id,
              occurrenceAt: existing.occurrenceAt.toISOString(),
              completedAt: existing.completedAt.toISOString(),
            }
          : null,
        duplicate: true as const,
      };
    }
    throw err;
  }

  const nextDue = advanceCurrentDue(current, occurrenceAt);
  const [row] = await db
    .update(pressReminders)
    .set({
      currentDueAt: nextDue ?? current.currentDueAt,
      updatedAt: now,
    })
    .where(eq(pressReminders.id, id))
    .returning();

  return {
    reminder: toDto(row!),
    completion: {
      id: completionId,
      occurrenceAt: occurrenceAt.toISOString(),
      completedAt: now.toISOString(),
    },
    duplicate: false as const,
  };
}

export async function uncompletePressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string,
  input: { occurrenceAt?: string | null } = {}
) {
  requirePress(ctx);
  const current = await loadOwnReminder(db, ctx, id);
  if (current.status !== "active") {
    throw validationError("Можно снять отметку только с активного напоминания");
  }
  const occurrenceAt = input.occurrenceAt
    ? parseAppInstant(input.occurrenceAt)
    : current.currentDueAt;
  const [completion] = await db
    .select()
    .from(pressReminderCompletions)
    .where(
      and(
        eq(pressReminderCompletions.reminderId, id),
        eq(pressReminderCompletions.occurrenceAt, occurrenceAt)
      )
    )
    .limit(1);
  if (!completion) {
    return { reminder: toDto(current), missing: true as const };
  }
  await db
    .delete(pressReminderCompletions)
    .where(eq(pressReminderCompletions.id, completion.id));
  const remaining = await db
    .select({ occurrenceAt: pressReminderCompletions.occurrenceAt })
    .from(pressReminderCompletions)
    .where(eq(pressReminderCompletions.reminderId, id));
  const completedKeys = new Set(
    remaining.map((c) => c.occurrenceAt.toISOString())
  );
  const currentDueAt = recomputeCurrentDue(current, completedKeys);
  const [row] = await db
    .update(pressReminders)
    .set({ currentDueAt, updatedAt: new Date() })
    .where(eq(pressReminders.id, id))
    .returning();
  return { reminder: toDto(row!), missing: false as const };
}

export async function disablePressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const current = await loadOwnReminder(db, ctx, id);
  const [row] = await db
    .update(pressReminders)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(pressReminders.id, current.id))
    .returning();
  return { reminder: toDto(row!) };
}

export async function archivePressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const current = await loadOwnReminder(db, ctx, id);
  const [row] = await db
    .update(pressReminders)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(pressReminders.id, current.id))
    .returning();
  return { reminder: toDto(row!) };
}

export async function listPressReminders(
  db: AppDb,
  ctx: AuthContext,
  input: {
    view?: PressReminderView;
    kind?: PressReminderKind | "all";
    status?: PressReminderStatus | "all";
    from?: string;
    to?: string;
    now?: Date;
  } = {}
) {
  requirePress(ctx);
  const now = input.now ?? new Date();
  const view = input.view ?? "today";

  if (view === "completed") {
    const rows = await db
      .select({
        completion: pressReminderCompletions,
        reminder: pressReminders,
      })
      .from(pressReminderCompletions)
      .innerJoin(
        pressReminders,
        eq(pressReminders.id, pressReminderCompletions.reminderId)
      )
      .where(
        and(
          eq(pressReminderCompletions.organizationId, ctx.organizationId),
          eq(pressReminderCompletions.userId, ctx.userId)
        )
      )
      .orderBy(desc(pressReminderCompletions.completedAt));

    let items: PressReminderOccurrenceDto[] = rows.map((r) => ({
      ...toDto(r.reminder),
      occurrenceAt: r.completion.occurrenceAt.toISOString(),
      completedAt: r.completion.completedAt.toISOString(),
    }));
    if (input.kind && input.kind !== "all") {
      items = items.filter((i) => i.kind === input.kind);
    }
    if (input.from) {
      const from = startOfAppDay(parseAppInstant(input.from));
      items = items.filter((i) => new Date(i.completedAt!).getTime() >= from.getTime());
    }
    if (input.to) {
      const to = parseAppInstant(input.to, true);
      items = items.filter((i) => new Date(i.completedAt!).getTime() <= to.getTime());
    }
    return { reminders: items };
  }

  const filters = [
    eq(pressReminders.organizationId, ctx.organizationId),
    eq(pressReminders.userId, ctx.userId),
  ];
  if (view === "today" || view === "upcoming") {
    filters.push(eq(pressReminders.status, "active"));
  } else if (input.status && input.status !== "all") {
    filters.push(eq(pressReminders.status, input.status));
  }
  if (input.kind && input.kind !== "all") {
    filters.push(eq(pressReminders.kind, input.kind));
  }

  const rows = await db
    .select()
    .from(pressReminders)
    .where(and(...filters))
    .orderBy(pressReminders.currentDueAt);

  const completionRows = await db
    .select()
    .from(pressReminderCompletions)
    .where(
      and(
        eq(pressReminderCompletions.organizationId, ctx.organizationId),
        eq(pressReminderCompletions.userId, ctx.userId)
      )
    );
  const completedCurrent = new Set(
    completionRows.map((c) => `${c.reminderId}:${c.occurrenceAt.toISOString()}`)
  );

  let items: PressReminderOccurrenceDto[] = rows.map((row) => ({
    ...toDto(row),
    occurrenceAt: row.currentDueAt.toISOString(),
    completedAt: completedCurrent.has(
      `${row.id}:${row.currentDueAt.toISOString()}`
    )
      ? completionRows.find(
          (c) =>
            c.reminderId === row.id &&
            c.occurrenceAt.toISOString() === row.currentDueAt.toISOString()
        )?.completedAt.toISOString() ?? null
      : null,
  }));

  if (view === "today") {
    const byKey = new Map<string, PressReminderOccurrenceDto>();
    const reminderById = new Map(rows.map((row) => [row.id, row]));
    for (const item of items) {
      if (item.status !== "active") continue;
      const occurrence = new Date(item.occurrenceAt);
      const onToday = reminderIsOnDay(occurrence, now);
      const overdueOpen =
        !item.completedAt && reminderIsDueOnOrBeforeDay(occurrence, now);
      if (onToday || overdueOpen) {
        byKey.set(`${item.id}:${item.occurrenceAt}`, item);
      }
    }
    for (const completion of completionRows) {
      if (!reminderIsOnDay(completion.occurrenceAt, now)) continue;
      const reminder = reminderById.get(completion.reminderId);
      if (!reminder || reminder.status !== "active") continue;
      const key = `${completion.reminderId}:${completion.occurrenceAt.toISOString()}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        ...toDto(reminder),
        occurrenceAt: completion.occurrenceAt.toISOString(),
        completedAt: completion.completedAt.toISOString(),
      });
    }
    items = [...byKey.values()].sort((a, b) => {
      const byTime = a.occurrenceAt.localeCompare(b.occurrenceAt);
      return byTime !== 0 ? byTime : a.title.localeCompare(b.title, "ru");
    });
  } else if (view === "upcoming") {
    items = items.filter(
      (i) =>
        i.status === "active" &&
        !i.completedAt &&
        reminderIsAfterDay(new Date(i.occurrenceAt), now)
    );
  } else {
    if (input.from) {
      const fromKey = appDateKey(parseAppInstant(input.from));
      items = items.filter((i) => appDateKey(i.occurrenceAt) >= fromKey);
    }
    if (input.to) {
      const toKey = appDateKey(parseAppInstant(input.to, true));
      items = items.filter((i) => appDateKey(i.occurrenceAt) <= toKey);
    }
  }

  return { reminders: items };
}

export async function getPressReminder(
  db: AppDb,
  ctx: AuthContext,
  id: string
) {
  requirePress(ctx);
  const row = await loadOwnReminder(db, ctx, id);
  const completions = await db
    .select()
    .from(pressReminderCompletions)
    .where(eq(pressReminderCompletions.reminderId, id))
    .orderBy(desc(pressReminderCompletions.completedAt));
  return {
    reminder: toDto(row),
    completions: completions.map((c) => ({
      id: c.id,
      occurrenceAt: c.occurrenceAt.toISOString(),
      completedAt: c.completedAt.toISOString(),
    })),
  };
}
