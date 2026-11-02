import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { endVideoCall } from "@/server/services/video-calls-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const { id } = await context.params;
    const db = getDb();
    const call = await endVideoCall(db, ctx, id);
    return jsonOk({ call });
  } catch (err) {
    return jsonError(err);
  }
}
