import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, unauthorized } from "@/server/errors";
import { readPrivateGuest } from "@/server/private-calls/access";
import { pulsePrivateGuest } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const claims = await readPrivateGuest(request);
    if (!claims) throw unauthorized();
    await pulsePrivateGuest(getDb(), claims);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
