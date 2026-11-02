import { getDb } from "@/server/db/runtime";
import { ApiError, jsonError, jsonOk } from "@/server/errors";
import { readPrivateGuest } from "@/server/private-calls/access";
import { getPrivateGuestCall } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const claims = await readPrivateGuest(request);
    if (!claims) return jsonOk({ joined: false, call: null });
    const call = await getPrivateGuestCall(getDb(), claims);
    const joined = call.status === "active" && call.myStatus === "invited";
    return jsonOk({ joined, call });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      return jsonOk({ joined: false, call: null });
    }
    return jsonError(err);
  }
}
