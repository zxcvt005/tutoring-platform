import { and, asc, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import {
  isLandingGradeId,
  isValidLandingContact,
  validateLandingLead,
  type LandingLeadInput,
} from "@/lib/landing/lead";
import {
  isSiteLeadStatus,
  type SiteLead,
  type SiteLeadStatus,
} from "@/lib/site-leads";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { organizations, siteLeads } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, notFound, validationError } from "@/server/errors";

function newId() {
  return `sl_${randomBytes(6).toString("hex")}`;
}

function toLead(row: typeof siteLeads.$inferSelect): SiteLead {
  return {
    id: row.id,
    studentName: row.studentName,
    grade: row.grade,
    level: row.level,
    parentName: row.parentName,
    contact: row.contact,
    comment: row.comment,
    status: isSiteLeadStatus(row.status) ? row.status : "Новая",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolvePublicOrganizationId(db: AppDb): Promise<string> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) {
    throw validationError(
      "Приём заявок временно недоступен. Попробуйте позже."
    );
  }
  return org.id;
}

export async function createSiteLeadFromLanding(
  db: AppDb,
  input: LandingLeadInput
): Promise<{ id: string }> {
  const errors = validateLandingLead(input);
  if (Object.keys(errors).length > 0) {
    const first = Object.values(errors)[0];
    throw validationError(first || "Проверьте поля заявки");
  }
  if (!isLandingGradeId(input.gradeId)) {
    throw validationError("Выберите класс");
  }
  if (!isValidLandingContact(input.contact)) {
    throw validationError("Укажите телефон, email или Telegram");
  }

  const organizationId = await resolvePublicOrganizationId(db);
  const id = newId();
  const now = new Date();

  await db.insert(siteLeads).values({
    id,
    organizationId,
    studentName: input.studentName.trim(),
    grade: input.gradeId,
    level: input.level.trim(),
    parentName: input.parentName.trim(),
    contact: input.contact.trim(),
    comment: input.comment.trim(),
    status: "Новая",
    createdAt: now,
    updatedAt: now,
  });

  return { id };
}

export async function listSiteLeads(
  db: AppDb,
  ctx: AuthContext
): Promise<SiteLead[]> {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(siteLeads)
    .where(eq(siteLeads.organizationId, ctx.organizationId))
    .orderBy(desc(siteLeads.createdAt));
  return rows.map(toLead);
}

export async function updateSiteLeadStatus(
  db: AppDb,
  ctx: AuthContext,
  input: { id: string; status: SiteLeadStatus; updatedAt?: string }
): Promise<SiteLead> {
  requireRoles(ctx, ["director"]);
  const id = String(input.id ?? "").trim();
  if (!id) throw validationError("Не указан идентификатор заявки");
  if (!isSiteLeadStatus(input.status)) {
    throw validationError("Недопустимый статус");
  }

  const [existing] = await db
    .select()
    .from(siteLeads)
    .where(
      and(
        eq(siteLeads.id, id),
        eq(siteLeads.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Заявка не найдена");

  if (input.updatedAt) {
    const expected = Date.parse(input.updatedAt);
    if (
      Number.isNaN(expected) ||
      existing.updatedAt.getTime() !== expected
    ) {
      throw conflict("Заявка уже изменена. Обновите список.");
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(siteLeads)
    .set({ status: input.status, updatedAt: now })
    .where(
      and(
        eq(siteLeads.id, id),
        eq(siteLeads.organizationId, ctx.organizationId)
      )
    )
    .returning();
  if (!updated) throw notFound("Заявка не найдена");
  return toLead(updated);
}

export async function deleteSiteLead(
  db: AppDb,
  ctx: AuthContext,
  idRaw: unknown
): Promise<{ ok: true }> {
  requireRoles(ctx, ["director"]);
  const id = String(idRaw ?? "").trim();
  if (!id) throw validationError("Не указан идентификатор заявки");

  const [existing] = await db
    .select({ id: siteLeads.id })
    .from(siteLeads)
    .where(
      and(
        eq(siteLeads.id, id),
        eq(siteLeads.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!existing) throw notFound("Заявка не найдена");

  await db.delete(siteLeads).where(eq(siteLeads.id, existing.id));
  return { ok: true };
}
