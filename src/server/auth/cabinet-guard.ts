import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  cabinetHomeForRole,
  type MembershipRole,
} from "@/lib/auth/roles";
import { SESSION_COOKIE } from "@/server/auth/constants";
import { resolveAuthContext } from "@/server/authz/context";
import { getDb } from "@/server/db/runtime";

const CABINET_ROLE = {
  direkciya: "director",
  kafedra: "teacher",
  auditoria: "student",
  pressa: "press",
  assistent: "assistant",
} as const;

export type CabinetKey = keyof typeof CABINET_ROLE;

/** Сессия без нужной роли уходит в свой кабинет, без сессии — на вход. */
export async function requireCabinetMembership(cabinet: CabinetKey) {
  const expected: MembershipRole = CABINET_ROLE[cabinet];
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const ctx = await resolveAuthContext(getDb(), token).catch(() => null);
  if (!ctx) redirect("/login");
  if (ctx.role !== expected) redirect(cabinetHomeForRole(ctx.role));
}
