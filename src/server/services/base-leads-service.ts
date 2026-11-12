import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  type BaseLead,
  type BaseLeadSource,
  type BaseLeadStatus,
  isBaseLeadSource,
  isBaseLeadStatus,
  todayIsoDate,
} from "@/lib/base-leads";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { baseLeads } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, notFound, validationError } from "@/server/errors";

const MAX_NAME = 200;
const MAX_CONTACT = 500;
const MAX_COMMENT = 4000;
const MAX_URL = 2000;

function newId() {
  return `bl_${randomBytes(6).toString("hex")}`;
}

function toLead(row: typeof baseLeads.$inferSelect): BaseLead {
  return {
    id: row.id,
    entryDate: row.entryDate,
    source: isBaseLeadSource(row.source) ? row.source : null,
    status: isBaseLeadStatus(row.status) ? row.status : null,
    name: row.name,
    avitoUrl: row.avitoUrl,
    contact: row.contact,
    path1: row.path1,
    path2: row.path2,
    path3: row.path3,
    comment: row.comment,
    reconciliation: row.reconciliation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseEntryDate(value: unknown): string {
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

function sanitizeOptionalUrl(value: unknown): string {
  const raw = sanitizeText(value, MAX_URL, "Ссылка Авито");
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw validationError("Ссылка Авито должна быть корректным URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError("Ссылка Авито допускает только http(s)");
  }
  return parsed.toString();
}

function parseOptionalSource(value: unknown): BaseLeadSource | null {
  if (value == null || value === "") return null;
  if (!isBaseLeadSource(value)) {
    throw validationError("Недопустимый источник");
  }
  return value;
}

function parseOptionalStatus(value: unknown): BaseLeadStatus | null {
  if (value == null || value === "") return null;
  if (!isBaseLeadStatus(value)) {
    throw validationError("Недопустимый статус");
  }
  return value;
}

function sameInstant(a: Date, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return a.getTime() === t;
}

export async function listBaseLeads(
  db: AppDb,
  ctx: AuthContext
): Promise<BaseLead[]> {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(baseLeads)
    .where(eq(baseLeads.organizationId, ctx.organizationId))
    .orderBy(asc(baseLeads.createdAt));
  return rows.map(toLead);
}

export async function createBaseLead(
  db: AppDb,
  ctx: AuthContext
): Promise<BaseLead> {
  requireRoles(ctx, ["director"]);
  const id = newId();
  const now = new Date();
  await db.insert(baseLeads).values({
    id,
    organizationId: ctx.organizationId,
    entryDate: todayIsoDate(),
    source: null,
    status: null,
    name: "",
    avitoUrl: "",
    contact: "",
    path1: false,
    path2: false,
    path3: false,
    comment: "",
    reconciliation: false,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db
    .select()
    .from(baseLeads)
    .where(eq(baseLeads.id, id))
    .limit(1);
  if (!row) throw new Error("Не удалось создать запись базы");
  return toLead(row);
}

export type UpdateBaseLeadInput = {
  id: string;
  /** ISO updatedAt с клиента — защита от перезаписи свежих данных */
  expectedUpdatedAt: string;
  entryDate?: string;
  source?: BaseLeadSource | null | "";
  status?: BaseLeadStatus | null | "";
  name?: string;
  avitoUrl?: string;
  contact?: string;
  path1?: boolean;
  path2?: boolean;
  path3?: boolean;
  comment?: string;
  reconciliation?: boolean;
};

export async function updateBaseLead(
  db: AppDb,
  ctx: AuthContext,
  input: UpdateBaseLeadInput
): Promise<BaseLead> {
  requireRoles(ctx, ["director"]);
  const id = String(input.id ?? "").trim();
  if (!id) throw validationError("Не указан идентификатор записи");
  const expectedUpdatedAt = String(input.expectedUpdatedAt ?? "").trim();
  if (!expectedUpdatedAt) {
    throw validationError("Не указана версия записи для сохранения");
  }

  const [existing] = await db
    .select()
    .from(baseLeads)
    .where(
      and(
        eq(baseLeads.id, id),
        eq(baseLeads.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Запись не найдена");

  if (!sameInstant(existing.updatedAt, expectedUpdatedAt)) {
    throw conflict(
      "Запись уже изменена. Обновите данные и повторите сохранение."
    );
  }

  const patch: Partial<typeof baseLeads.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.entryDate !== undefined) {
    patch.entryDate = parseEntryDate(input.entryDate);
  }
  if (input.source !== undefined) {
    patch.source = parseOptionalSource(input.source);
  }
  if (input.status !== undefined) {
    patch.status = parseOptionalStatus(input.status);
  }
  if (input.name !== undefined) {
    patch.name = sanitizeText(input.name, MAX_NAME, "Имя");
  }
  if (input.avitoUrl !== undefined) {
    patch.avitoUrl = sanitizeOptionalUrl(input.avitoUrl);
  }
  if (input.contact !== undefined) {
    patch.contact = sanitizeText(input.contact, MAX_CONTACT, "Контакт");
  }
  if (input.comment !== undefined) {
    patch.comment = sanitizeText(input.comment, MAX_COMMENT, "Комментарий");
  }
  if (input.path1 !== undefined) patch.path1 = Boolean(input.path1);
  if (input.path2 !== undefined) patch.path2 = Boolean(input.path2);
  if (input.path3 !== undefined) patch.path3 = Boolean(input.path3);
  if (input.reconciliation !== undefined) {
    patch.reconciliation = Boolean(input.reconciliation);
  }

  await db.update(baseLeads).set(patch).where(eq(baseLeads.id, existing.id));

  const [row] = await db
    .select()
    .from(baseLeads)
    .where(eq(baseLeads.id, existing.id))
    .limit(1);
  if (!row) throw notFound("Запись не найдена");
  return toLead(row);
}

export async function deleteBaseLead(
  db: AppDb,
  ctx: AuthContext,
  id: string
): Promise<{ id: string }> {
  requireRoles(ctx, ["director"]);
  const leadId = String(id ?? "").trim();
  if (!leadId) throw validationError("Не указан идентификатор записи");

  const [existing] = await db
    .select({ id: baseLeads.id })
    .from(baseLeads)
    .where(
      and(
        eq(baseLeads.id, leadId),
        eq(baseLeads.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Запись не найдена");

  await db.delete(baseLeads).where(eq(baseLeads.id, existing.id));
  return { id: existing.id };
}
