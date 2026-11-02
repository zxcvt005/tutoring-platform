import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { parseBody, readJsonBody, requireAuth } from "@/server/http/request";
import { inviteStudents } from "@/server/services/video-calls-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(40),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const { id } = await context.params;
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const call = await inviteStudents(db, ctx, id, body.studentIds);
    return jsonOk({ call });
  } catch (err) {
    return jsonError(err);
  }
}
