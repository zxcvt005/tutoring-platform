import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { getVideoCall } from "@/server/services/video-calls-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(request);
    const { id } = await context.params;
    const db = getDb();
    return jsonOk({ call: await getVideoCall(db, ctx, id) });
  } catch (err) {
    return jsonError(err);
  }
}
