import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { listInviteCandidates } from "@/server/services/video-calls-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(request);
    const { id } = await context.params;
    const url = new URL(request.url);
    const db = getDb();
    const candidates = await listInviteCandidates(
      db,
      ctx,
      id,
      url.searchParams.get("q") ?? ""
    );
    return jsonOk({ candidates });
  } catch (err) {
    return jsonError(err);
  }
}
