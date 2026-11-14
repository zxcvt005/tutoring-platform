import { and, eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  QUICK_ACCESS_ACTIONS,
  QUICK_ACCESS_LABELS,
  QUICK_ACCESS_TYPES,
  isQuickAccessType,
  quickAccessPath,
  type QuickAccessIssuedLink,
  type QuickAccessLinkView,
  type QuickAccessType,
} from "@/lib/quick-access";
import { getAppBaseUrl } from "@/server/auth/env";
import { assertMemoryRateLimit } from "@/server/auth/rate-limit";
import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import { quickAccessLinks } from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  validationError,
} from "@/server/errors";

function newId() {
  return `qal_${randomBytes(6).toString("hex")}`;
}

export function createQuickAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashQuickAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function buildAbsoluteUrl(path: string): string {
  const base = getAppBaseUrl()?.replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

function assertAccessType(value: string): QuickAccessType {
  if (!isQuickAccessType(value)) {
    throw validationError("Неизвестный тип быстрого доступа");
  }
  return value;
}

function toView(row: {
  accessType: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  lastUsedAt: Date | null;
} | null): QuickAccessLinkView | null {
  if (!row || !isQuickAccessType(row.accessType)) return null;
  return {
    accessType: row.accessType,
    label: QUICK_ACCESS_LABELS[row.accessType],
    exists: true,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listQuickAccessLinks(
  db: AppDb,
  ctx: AuthContext
): Promise<QuickAccessLinkView[]> {
  requireRoles(ctx, ["director"]);
  const rows = await db
    .select()
    .from(quickAccessLinks)
    .where(eq(quickAccessLinks.organizationId, ctx.organizationId));

  const byType = new Map(
    rows
      .filter((r) => isQuickAccessType(r.accessType))
      .map((r) => [r.accessType as QuickAccessType, r])
  );

  return QUICK_ACCESS_TYPES.map((accessType) => {
    const row = byType.get(accessType);
    if (!row) {
      return {
        accessType,
        label: QUICK_ACCESS_LABELS[accessType],
        exists: false,
        enabled: false,
        createdAt: null,
        updatedAt: null,
        disabledAt: null,
        lastUsedAt: null,
      };
    }
    return toView(row)!;
  });
}

async function issueToken(
  db: AppDb,
  ctx: AuthContext,
  accessType: QuickAccessType
): Promise<QuickAccessIssuedLink> {
  requireRoles(ctx, ["director"]);
  const rawToken = createQuickAccessToken();
  const tokenHash = hashQuickAccessToken(rawToken);
  const now = new Date();
  const path = quickAccessPath(accessType, rawToken);

  const [existing] = await db
    .select()
    .from(quickAccessLinks)
    .where(
      and(
        eq(quickAccessLinks.organizationId, ctx.organizationId),
        eq(quickAccessLinks.accessType, accessType)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(quickAccessLinks)
      .set({
        tokenHash,
        enabled: true,
        disabledAt: null,
        createdByUserId: ctx.userId,
        updatedAt: now,
      })
      .where(eq(quickAccessLinks.id, existing.id));
  } else {
    await db.insert(quickAccessLinks).values({
      id: newId(),
      organizationId: ctx.organizationId,
      accessType,
      tokenHash,
      enabled: true,
      createdByUserId: ctx.userId,
      disabledAt: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    accessType,
    label: QUICK_ACCESS_LABELS[accessType],
    url: buildAbsoluteUrl(path),
    path,
    token: rawToken,
    enabled: true,
    createdAt: now.toISOString(),
  };
}

export async function createQuickAccessLink(
  db: AppDb,
  ctx: AuthContext,
  accessTypeRaw: string
): Promise<QuickAccessIssuedLink> {
  const accessType = assertAccessType(accessTypeRaw);
  requireRoles(ctx, ["director"]);

  const [existing] = await db
    .select({ id: quickAccessLinks.id, enabled: quickAccessLinks.enabled })
    .from(quickAccessLinks)
    .where(
      and(
        eq(quickAccessLinks.organizationId, ctx.organizationId),
        eq(quickAccessLinks.accessType, accessType)
      )
    )
    .limit(1);

  if (existing?.enabled) {
    throw badRequest(
      "Ссылка уже создана. Отключите или перевыпустите её."
    );
  }

  return issueToken(db, ctx, accessType);
}

export async function reissueQuickAccessLink(
  db: AppDb,
  ctx: AuthContext,
  accessTypeRaw: string
): Promise<QuickAccessIssuedLink> {
  return issueToken(db, ctx, assertAccessType(accessTypeRaw));
}

export async function disableQuickAccessLink(
  db: AppDb,
  ctx: AuthContext,
  accessTypeRaw: string
): Promise<QuickAccessLinkView> {
  requireRoles(ctx, ["director"]);
  const accessType = assertAccessType(accessTypeRaw);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(quickAccessLinks)
    .where(
      and(
        eq(quickAccessLinks.organizationId, ctx.organizationId),
        eq(quickAccessLinks.accessType, accessType)
      )
    )
    .limit(1);

  if (!existing) {
    throw notFound("Ссылка быстрого доступа не найдена");
  }

  const [updated] = await db
    .update(quickAccessLinks)
    .set({
      enabled: false,
      disabledAt: now,
      updatedAt: now,
    })
    .where(eq(quickAccessLinks.id, existing.id))
    .returning();

  return toView(updated)!;
}

export type ResolvedQuickAccess = {
  linkId: string;
  organizationId: string;
  accessType: QuickAccessType;
  createdByUserId: string;
  ctx: AuthContext;
};

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function resolveQuickAccessToken(
  db: AppDb,
  rawToken: string,
  expectedAccessType: QuickAccessType
): Promise<ResolvedQuickAccess> {
  if (!rawToken || rawToken.length < 32 || rawToken.length > 128) {
    throw unauthorized("Недействительная ссылка быстрого доступа");
  }

  const tokenHash = hashQuickAccessToken(rawToken);
  const [row] = await db
    .select()
    .from(quickAccessLinks)
    .where(eq(quickAccessLinks.tokenHash, tokenHash))
    .limit(1);

  if (!row || !tokensEqual(row.tokenHash, tokenHash)) {
    throw unauthorized("Недействительная ссылка быстрого доступа");
  }
  if (!row.enabled) {
    throw forbidden("Ссылка быстрого доступа отключена");
  }
  if (!isQuickAccessType(row.accessType)) {
    throw unauthorized("Недействительная ссылка быстрого доступа");
  }
  if (row.accessType !== expectedAccessType) {
    throw forbidden("Эта ссылка не даёт доступ к выбранной таблице");
  }

  const now = new Date();
  await db
    .update(quickAccessLinks)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(quickAccessLinks.id, row.id));

  const ctx: AuthContext = {
    userId: row.createdByUserId,
    email: "quick-access@local",
    fullName: "Быстрый доступ",
    organizationId: row.organizationId,
    role: "director",
    teacherId: null,
    studentId: null,
    sessionId: `qa_${row.id}`,
    impersonation: null,
  };

  return {
    linkId: row.id,
    organizationId: row.organizationId,
    accessType: row.accessType,
    createdByUserId: row.createdByUserId,
    ctx,
  };
}

export function assertQuickAccessActionAllowed(
  accessType: QuickAccessType,
  action: string
): void {
  const allowed = QUICK_ACCESS_ACTIONS[accessType];
  if (!allowed.includes(action)) {
    throw forbidden("Действие недоступно для этой ссылки");
  }
}

/** Rate limit по IP + префиксу хеша (без сырого токена в ключе логов). */
export function assertQuickAccessRateLimit(input: {
  ip: string | null;
  tokenHashPrefix: string;
}): void {
  const ip = input.ip || "unknown";
  assertMemoryRateLimit(`qa:${ip}:${input.tokenHashPrefix}`, {
    max: 120,
    windowMs: 60_000,
    message: "Слишком много запросов. Подождите минуту.",
  });
}

export function redactQuickAccessTokenFromPath(pathname: string): string {
  return pathname.replace(
    /\/quick-access\/(baza|rnp-avito|probnye-uroki|rashody)\/[^/]+/g,
    "/quick-access/$1/[redacted]"
  );
}
