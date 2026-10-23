import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { getChatSummary } from "@/server/services/chat-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const data = await getChatSummary(db, ctx);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
