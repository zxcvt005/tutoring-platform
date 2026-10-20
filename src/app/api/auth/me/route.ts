import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { mePayload } from "@/server/services/auth-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    return jsonOk(mePayload(ctx));
  } catch (err) {
    return jsonError(err);
  }
}
