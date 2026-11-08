import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { revokeProfileInvitation } from "@/server/services/invitation-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const { id } = await params;
    const status = await revokeProfileInvitation(getDb(), ctx, id);
    return jsonOk(status);
  } catch (err) {
    return jsonError(err);
  }
}
