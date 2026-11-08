import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { getPublicInvitation } from "@/server/services/invitation-service";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const view = await getPublicInvitation(getDb(), decodeURIComponent(token));
    return jsonOk(view);
  } catch (err) {
    return jsonError(err);
  }
}
