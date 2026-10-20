import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import {
  resetUserPassword,
  setUserStatus,
} from "@/server/services/admin-users-service";

const patchSchema = z.object({
  status: z.enum(["active", "paused", "disabled"]).optional(),
  password: z.string().min(10).max(200).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    assertMutatingRequest(request);
    const auth = await requireAuth(request);
    const { id } = await ctx.params;
    const body = parseBody(patchSchema, await readJsonBody(request));
    const db = getDb();

    if (!body.status && !body.password) {
      throw validationError("Укажите status и/или password");
    }
    if (body.status) {
      await setUserStatus(db, auth, id, body.status);
    }
    if (body.password) {
      await resetUserPassword(db, auth, id, body.password);
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
