import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requirePrivateHost } from "@/server/private-calls/access";
import {
  getPrivateHost,
  startPrivateSession,
} from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePrivateHost(request);
    const session = await getPrivateHost(getDb());
    return jsonOk({ session });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    await requirePrivateHost(request);
    const session = await startPrivateSession(getDb());
    return jsonOk({ session }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
