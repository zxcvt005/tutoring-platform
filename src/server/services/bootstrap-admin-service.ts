import { count, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { hashPassword } from "@/server/auth/password";
import { getBootstrapAdminToken } from "@/server/auth/env";
import {
  memberships,
  organizations,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  conflict,
  forbidden,
  validationError,
} from "@/server/errors";

function timingSafeTokenEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function needsBootstrapAdmin(db: AppDb): Promise<boolean> {
  const [orgs] = await db.select({ n: count() }).from(organizations);
  if (Number(orgs?.n ?? 0) === 0) return true;
  const [dirs] = await db
    .select({ n: count() })
    .from(memberships)
    .where(eq(memberships.role, "director"));
  return Number(dirs?.n ?? 0) === 0;
}

/**
 * Создание первой организации и директора.
 * Требует BOOTSTRAP_ADMIN_TOKEN; доступно только пока нет директора.
 */
export async function bootstrapFirstAdmin(
  db: AppDb,
  input: {
    token: string;
    email: string;
    password: string;
    fullName: string;
    organizationName: string;
    organizationSlug?: string;
  }
) {
  const expected = getBootstrapAdminToken();
  if (!expected) {
    throw forbidden(
      "BOOTSTRAP_ADMIN_TOKEN не задан. Используйте CLI или задайте токен в env."
    );
  }
  if (!timingSafeTokenEq(input.token.trim(), expected)) {
    throw forbidden("Неверный bootstrap-токен");
  }

  if (!(await needsBootstrapAdmin(db))) {
    throw conflict("Администратор уже создан — bootstrap недоступен");
  }

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw validationError("Некорректный email");

  const slug =
    input.organizationSlug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") ||
    `school-${randomBytes(3).toString("hex")}`;

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  const orgId = `org_${randomBytes(6).toString("hex")}`;
  const userId = `user_${randomBytes(6).toString("hex")}`;
  const memId = `mem_${randomBytes(6).toString("hex")}`;

  await db.insert(organizations).values({
    id: orgId,
    name: input.organizationName.trim() || "Школа",
    slug,
  });

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    fullName: input.fullName.trim(),
    status: "active",
  });

  await db.insert(memberships).values({
    id: memId,
    organizationId: orgId,
    userId,
    role: "director",
  });

  return {
    organizationId: orgId,
    organizationSlug: slug,
    userId,
    email,
    role: "director" as const,
  };
}
