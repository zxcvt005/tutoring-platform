import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  type ManualTrialLesson,
  type ManualTrialSource,
  defaultManualTrialTime,
  isManualTrialSource,
  todayIsoDate,
} from "@/lib/manual-trial-lessons";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { manualTrialLessons } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, notFound, validationError } from "@/server/errors";

const MAX_NAME = 200;
const MAX_CONTACT = 500;
const MAX_COMMENT = 4000;
const MAX_HOURS = 168;
const MAX_RATE_RUB = 1_000_000;

function newId() {
  return `mtl_${randomBytes(6).toString("hex")}`;
}

function toRow(row: typeof manualTrialLessons.$inferSelect): ManualTrialLesson {
  return {
    id: row.id,
    lessonDate: row.lessonDate,
    lessonTime: row.lessonTime,
    source: isManualTrialSource(row.source) ? row.source : null,
    name: row.name,
    contact: row.contact,
    attended: row.attended,
    purchased: row.purchased,
    hoursPerWeek: row.hoursPerWeek,
    ratePerHourRub: row.ratePerHourRub,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseLessonDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw validationError("Дата должна быть в формате ГГГГ-ММ-ДД");
  }
  const iso = value.trim();
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw validationError("Некорректная дата");
  }
  return iso;
}

function parseLessonTime(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())
  ) {
    throw validationError("Время должно быть в формате ЧЧ:ММ");
  }
  return value.trim();
}

function sanitizeText(value: unknown, max: number, label: string): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw validationError(`${label}: ожидается текст`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`${label}: слишком длинное значение`);
  }
  return trimmed;
}

function parseOptionalSource(value: unknown): ManualTrialSource | null {
  if (value == null || value === "") return null;
  if (!isManualTrialSource(value)) {
    throw validationError("Недопустимый источник");
  }
  return value;
}

/** null / "" / undefined → null; иначе неотрицательное целое. */
function parseOptionalNonNegInt(
  value: unknown,
  label: string,
  max: number
): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/\s/g, "").replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw validationError(`${label}: укажите целое число`);
  }
  if (n < 0) {
    throw validationError(`${label}: значение не может быть отрицательным`);
  }
  if (n > max) {
    throw validationError(`${label}: слишком большое значение`);
  }
  return n;
}

function sameInstant(a: Date, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return a.getTime() === t;
}

export async function listManualTrialLessons(
  db: AppDb,
  ctx: AuthContext
): Promise<ManualTrialLesson[]> {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(manualTrialLessons)
    .where(eq(manualTrialLessons.organizationId, ctx.organizationId))
    .orderBy(asc(manualTrialLessons.createdAt));
  return rows.map(toRow);
}

export async function createManualTrialLesson(
  db: AppDb,
  ctx: AuthContext
): Promise<ManualTrialLesson> {
  requireRoles(ctx, ["director"]);
  const id = newId();
  const now = new Date();
  await db.insert(manualTrialLessons).values({
    id,
    organizationId: ctx.organizationId,
    lessonDate: todayIsoDate(),
    lessonTime: defaultManualTrialTime(now),
    source: null,
    name: "",
    contact: "",
    attended: false,
    purchased: false,
    hoursPerWeek: null,
    ratePerHourRub: null,
    comment: "",
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db
    .select()
    .from(manualTrialLessons)
    .where(eq(manualTrialLessons.id, id))
    .limit(1);
  if (!row) throw new Error("Не удалось создать запись пробного урока");
  return toRow(row);
}

export type UpdateManualTrialLessonInput = {
  id: string;
  expectedUpdatedAt: string;
  lessonDate?: string;
  lessonTime?: string;
  source?: ManualTrialSource | null | "";
  name?: string;
  contact?: string;
  attended?: boolean;
  purchased?: boolean;
  hoursPerWeek?: number | null | "";
  ratePerHourRub?: number | null | "";
  comment?: string;
};

export async function updateManualTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  input: UpdateManualTrialLessonInput
): Promise<ManualTrialLesson> {
  requireRoles(ctx, ["director"]);
  const id = String(input.id ?? "").trim();
  if (!id) throw validationError("Не указан идентификатор записи");
  const expectedUpdatedAt = String(input.expectedUpdatedAt ?? "").trim();
  if (!expectedUpdatedAt) {
    throw validationError("Не указана версия записи для сохранения");
  }

  const [existing] = await db
    .select()
    .from(manualTrialLessons)
    .where(
      and(
        eq(manualTrialLessons.id, id),
        eq(manualTrialLessons.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Запись не найдена");

  if (!sameInstant(existing.updatedAt, expectedUpdatedAt)) {
    throw conflict(
      "Запись уже изменена. Обновите данные и повторите сохранение."
    );
  }

  const patch: Partial<typeof manualTrialLessons.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.lessonDate !== undefined) {
    patch.lessonDate = parseLessonDate(input.lessonDate);
  }
  if (input.lessonTime !== undefined) {
    patch.lessonTime = parseLessonTime(input.lessonTime);
  }
  if (input.source !== undefined) {
    patch.source = parseOptionalSource(input.source);
  }
  if (input.name !== undefined) {
    patch.name = sanitizeText(input.name, MAX_NAME, "Имя");
  }
  if (input.contact !== undefined) {
    patch.contact = sanitizeText(input.contact, MAX_CONTACT, "Контакт");
  }
  if (input.comment !== undefined) {
    patch.comment = sanitizeText(input.comment, MAX_COMMENT, "Комментарий");
  }
  if (input.attended !== undefined) patch.attended = Boolean(input.attended);
  if (input.purchased !== undefined) patch.purchased = Boolean(input.purchased);
  if (input.hoursPerWeek !== undefined) {
    patch.hoursPerWeek = parseOptionalNonNegInt(
      input.hoursPerWeek,
      "Часов/неделя",
      MAX_HOURS
    );
  }
  if (input.ratePerHourRub !== undefined) {
    patch.ratePerHourRub = parseOptionalNonNegInt(
      input.ratePerHourRub,
      "Ставка/час",
      MAX_RATE_RUB
    );
  }

  await db
    .update(manualTrialLessons)
    .set(patch)
    .where(eq(manualTrialLessons.id, existing.id));

  const [row] = await db
    .select()
    .from(manualTrialLessons)
    .where(eq(manualTrialLessons.id, existing.id))
    .limit(1);
  if (!row) throw notFound("Запись не найдена");
  return toRow(row);
}

export async function deleteManualTrialLesson(
  db: AppDb,
  ctx: AuthContext,
  id: string
): Promise<{ id: string }> {
  requireRoles(ctx, ["director"]);
  const rowId = String(id ?? "").trim();
  if (!rowId) throw validationError("Не указан идентификатор записи");

  const [existing] = await db
    .select({ id: manualTrialLessons.id })
    .from(manualTrialLessons)
    .where(
      and(
        eq(manualTrialLessons.id, rowId),
        eq(manualTrialLessons.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Запись не найдена");

  await db
    .delete(manualTrialLessons)
    .where(eq(manualTrialLessons.id, existing.id));
  return { id: existing.id };
}
