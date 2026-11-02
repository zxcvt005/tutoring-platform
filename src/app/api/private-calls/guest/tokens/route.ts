import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, unauthorized } from "@/server/errors";
import { readPrivateGuest } from "@/server/private-calls/access";
import { issuePrivateGuestTokens } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const claims = await readPrivateGuest(request);
    if (!claims) throw unauthorized();
    const tokens = await issuePrivateGuestTokens(getDb(), claims);
    return jsonOk({ tokens });
  } catch (err) {
    return jsonError(err);
  }
}
