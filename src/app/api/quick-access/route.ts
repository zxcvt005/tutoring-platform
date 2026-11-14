import { z } from "zod";

import {
  QUICK_ACCESS_TYPES,
  isQuickAccessType,
} from "@/lib/quick-access";
import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { forbidden, jsonError, jsonOk } from "@/server/errors";
import {
  getClientMeta,
  getIdempotencyKey,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { withIdempotency } from "@/server/idempotency";
import * as m from "@/server/services/platform-mutations";
import {
  assertQuickAccessActionAllowed,
  assertQuickAccessRateLimit,
  hashQuickAccessToken,
  resolveQuickAccessToken,
} from "@/server/services/quick-access-service";

const bodySchema = z.object({
  token: z.string().min(32).max(128),
  accessType: z.enum(QUICK_ACCESS_TYPES),
  action: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional(),
});

async function dispatchQuickAccessAction(
  db: ReturnType<typeof getDb>,
  ctx: Awaited<ReturnType<typeof resolveQuickAccessToken>>["ctx"],
  action: string,
  p: Record<string, unknown>
) {
  switch (action) {
    case "listBaseLeads":
      return m.listBaseLeadsAction(db, ctx);
    case "createBaseLead":
      return m.createBaseLeadAction(db, ctx);
    case "updateBaseLead":
      return m.updateBaseLeadAction(db, ctx, p);
    case "deleteBaseLead":
      return m.deleteBaseLeadAction(db, ctx, p);
    case "listManualTrialLessons":
      return m.listManualTrialLessonsAction(db, ctx);
    case "createManualTrialLesson":
      return m.createManualTrialLessonAction(db, ctx);
    case "updateManualTrialLesson":
      return m.updateManualTrialLessonAction(db, ctx, p);
    case "deleteManualTrialLesson":
      return m.deleteManualTrialLessonAction(db, ctx, p);
    case "getRnpAvitoMonth":
      return m.getRnpAvitoMonthAction(db, ctx, p);
    case "upsertRnpAvitoManualDay":
      return m.upsertRnpAvitoManualDayAction(db, ctx, p);
    case "clearRnpAvitoTrialOverride":
      return m.clearRnpAvitoTrialOverrideAction(db, ctx, p);
    case "syncRnpAvitoMonth":
      return m.syncRnpAvitoMonthAction(db, ctx, p);
    case "listExpenses":
      return m.listExpensesAction(db, ctx, p);
    case "createManualExpense":
      return m.createManualExpenseAction(db, ctx, p);
    case "updateManualExpense":
      return m.updateManualExpenseAction(db, ctx, p);
    case "deleteManualExpense":
      return m.deleteManualExpenseAction(db, ctx, p);
    default:
      throw forbidden("Действие недоступно для этой ссылки");
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const raw = parseBody(bodySchema, await readJsonBody(request));
    if (!isQuickAccessType(raw.accessType)) {
      throw forbidden("Неизвестный тип доступа");
    }

    const tokenHash = hashQuickAccessToken(raw.token);
    const { ip } = getClientMeta(request);
    assertQuickAccessRateLimit({
      ip,
      tokenHashPrefix: tokenHash.slice(0, 12),
    });

    const db = getDb();
    const resolved = await resolveQuickAccessToken(
      db,
      raw.token,
      raw.accessType
    );
    assertQuickAccessActionAllowed(resolved.accessType, raw.action);

    const p = (raw.payload ?? {}) as Record<string, unknown>;
    const out = await withIdempotency(
      db,
      resolved.ctx,
      `POST:/api/quick-access:${raw.action}`,
      getIdempotencyKey(request),
      async () => {
        const body = await dispatchQuickAccessAction(
          db,
          resolved.ctx,
          raw.action,
          p
        );
        return { status: 200, body };
      }
    );
    return jsonOk(out.body);
  } catch (err) {
    return jsonError(err);
  }
}
