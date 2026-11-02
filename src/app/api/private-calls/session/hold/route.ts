import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requirePrivateHost } from "@/server/private-calls/access";
import { holdPrivateTeacher } from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    await requirePrivateHost(request);
    const call = await holdPrivateTeacher(getDb());
    return jsonOk({ call });
  } catch (err) {
    return jsonError(err);
  }
}
